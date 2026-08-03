import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as ScreenCapture from "expo-screen-capture";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ListErrorState from "@/components/ListErrorState";
import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useScreenCaptureBlockEnabled } from "@/hooks/useScreenCaptureBlock";
import { formatNumber } from "@/lib/format";
import { getBook, storeBookKey } from "@/lib/store";

// "نسخة الاطلاع" — a book sample read like Apple Books: one page fills the
// screen, you flip page-by-page, and the chrome (header + page scrubber) hides
// on a tap so nothing covers the page.
//
// DIRECTION: an Arabic book flips right→left, an English one left→right. RN's
// paging ScrollView is always physically LTR, so instead of fighting it we
// REVERSE THE PAGE ARRAY for an RTL book and map indexes back when displaying
// the page number. That way "swipe right to go forward" falls out for free and
// works identically on every device regardless of the native RTL flag.
const THUMB_W = 44;
const THUMB_GAP = 8;
const THUMB_STEP = THUMB_W + THUMB_GAP;
// How many thumbs either side of the current page actually load their image.
const THUMB_WINDOW = 4;

export default function BookPreviewScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const { token } = useAuth();
  const { colors, language, reduceMotion } = usePreferences();
  const en = language === "en";
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();

  const { data: book, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: storeBookKey(bookId),
    queryFn: () => getBook(token, bookId),
    enabled: !!token && !!bookId,
  });

  // Same owner-controlled switch the lesson player obeys (global toggle +
  // per-account allowance) — the owner asked for one rule across the app.
  const screenCaptureBlockEnabled = useScreenCaptureBlockEnabled();
  useEffect(() => {
    if (!screenCaptureBlockEnabled) return;
    const tag = "book-preview-reader";
    ScreenCapture.preventScreenCaptureAsync(tag).catch(() => undefined);
    return () => {
      ScreenCapture.allowScreenCaptureAsync(tag).catch(() => undefined);
    };
  }, [screenCaptureBlockEnabled]);

  const pages = book?.previewPages ?? [];
  const rtl = (book?.previewDirection ?? "rtl") === "rtl";
  // Physical order fed to the pager. Reversed for an RTL book so page 1 sits at
  // the far right and forward = swiping right→left, like a real Arabic book.
  const ordered = useMemo(() => (rtl ? [...pages].reverse() : pages), [pages, rtl]);
  const total = ordered.length;
  /** physical slot → human page number (1-based) */
  const pageNumberAt = (slot: number) => (rtl ? total - slot : slot + 1);
  /** human page number (1-based) → physical slot */
  const slotForPage = (page: number) => (rtl ? total - page : page - 1);

  const [slot, setSlot] = useState(0);
  const [chrome, setChrome] = useState(true);
  /** physical slot → has its image painted at least once */
  const [loadedPages, setLoadedPages] = useState<Record<number, boolean>>({});
  const pagerRef = useRef<ScrollView>(null);
  const thumbsRef = useRef<ScrollView>(null);
  const chromeAnim = useRef(new Animated.Value(1)).current;
  const started = useRef(false);

  // Open on page 1 — which for an RTL book is the LAST physical slot.
  useEffect(() => {
    if (started.current || total === 0 || screenW === 0) return;
    started.current = true;
    const first = slotForPage(1);
    setSlot(first);
    // Wait a frame: the pager has to exist at full width before it can scroll.
    requestAnimationFrame(() => pagerRef.current?.scrollTo({ x: first * screenW, animated: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, screenW]);

  // Warm the image cache in READING order, page 1 strictly first. Without this
  // every page (and every thumb, which points at the same full-size file) races
  // for bandwidth the moment the screen mounts, so the page you're actually
  // looking at is the last to arrive and you stare at black.
  useEffect(() => {
    if (ordered.length === 0) return;
    let cancelled = false;
    void (async () => {
      const first = slotForPage(1);
      // Awaited on its own so nothing competes with the page on screen.
      await Image.prefetch(ordered[first], "memory-disk").catch(() => false);
      // Then the neighbours you're most likely to flip to, then the long tail.
      for (let step = 1; step < ordered.length; step++) {
        for (const i of [first - step, first + step]) {
          if (cancelled) return;
          if (i < 0 || i >= ordered.length || i === first) continue;
          void Image.prefetch(ordered[i], "memory-disk").catch(() => false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ordered]);

  function toggleChrome() {
    const next = !chrome;
    setChrome(next);
    if (reduceMotion) {
      chromeAnim.setValue(next ? 1 : 0);
      return;
    }
    Animated.timing(chromeAnim, { toValue: next ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }

  function goToPage(page: number) {
    const s = slotForPage(page);
    setSlot(s);
    pagerRef.current?.scrollTo({ x: s * screenW, animated: !reduceMotion });
  }

  const onPagerScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (screenW <= 0) return;
    setSlot(Math.round(e.nativeEvent.contentOffset.x / screenW));
  };

  // Keep the current page's thumb in view as you flip. The scrubber uses the SAME
  // physical order as the pager, so it mirrors it: on an Arabic book page 1 is the
  // rightmost thumb, matching where page 1 sits in the reader.
  const currentPage = total > 0 ? pageNumberAt(slot) : 0;
  useEffect(() => {
    if (total === 0) return;
    thumbsRef.current?.scrollTo({ x: Math.max(0, (slot - 1) * THUMB_STEP), animated: !reduceMotion });
  }, [slot, total, reduceMotion]);

  const headerH = insets.top + 52;

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      <StatusBar hidden={!chrome} animated />

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color="#fff" /></View>
      ) : isError ? (
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <ListErrorState onRetry={() => void refetch()} retrying={isFetching} />
        </View>
      ) : total === 0 ? (
        <View style={[styles.center, { backgroundColor: colors.background, gap: 14 }]}>
          <Feather name="book" size={44} color={colors.textTertiary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {en ? "No sample for this book" : "مفيش نسخة اطلاع للكتاب ده"}
          </Text>
          <Pressable onPress={() => router.back()} style={[styles.backPill, { backgroundColor: COLORS.primary }]}>
            <Text style={styles.backPillText}>{en ? "Back" : "رجوع"}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* Pages — one full screen each */}
          <ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={{ direction: "ltr" }}
            onMomentumScrollEnd={onPagerScrollEnd}
          >
            {ordered.map((uri, i) => (
              <Pressable key={`${uri}-${i}`} onPress={toggleChrome} style={{ width: screenW, height: screenH }}>
                {/* Spinner sits UNDER the image and is simply covered once it paints —
                    a blank black screen reads as "broken", a spinner reads as "loading". */}
                {!loadedPages[i] ? (
                  <View style={[StyleSheet.absoluteFill, styles.center]}>
                    <ActivityIndicator color="rgba(255,255,255,0.7)" />
                  </View>
                ) : null}
                <Image
                  source={{ uri }}
                  style={{ width: screenW, height: screenH }}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  transition={140}
                  onLoadEnd={() => setLoadedPages((p) => (p[i] ? p : { ...p, [i]: true }))}
                />
              </Pressable>
            ))}
          </ScrollView>

          {/* Header — fades/slides away on tap so it never covers the page */}
          <Animated.View
            pointerEvents={chrome ? "auto" : "none"}
            style={[
              styles.header,
              {
                height: headerH,
                paddingTop: insets.top,
                opacity: chromeAnim,
                transform: [{ translateY: chromeAnim.interpolate({ inputRange: [0, 1], outputRange: [-headerH, 0] }) }],
              },
            ]}
          >
            <Pressable onPress={() => router.back()} hitSlop={8} style={styles.circleBtn}>
              <Feather name="arrow-left" size={20} color="#fff" />
            </Pressable>
            <Text numberOfLines={1} style={styles.headerTitle}>
              {en ? "Sample" : "نسخة الاطلاع"}
            </Text>
            <View style={styles.pageBadge}>
              <Text style={styles.pageBadgeText}>
                {formatNumber(currentPage)}/{formatNumber(total)}
              </Text>
            </View>
          </Animated.View>

          {/* Page scrubber — thumbs in READING order (page 1 first) */}
          <Animated.View
            pointerEvents={chrome ? "auto" : "none"}
            style={[
              styles.scrubber,
              {
                paddingBottom: insets.bottom + 10,
                opacity: chromeAnim,
                transform: [{ translateY: chromeAnim.interpolate({ inputRange: [0, 1], outputRange: [140, 0] }) }],
              },
            ]}
          >
            <ScrollView
              ref={thumbsRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: THUMB_GAP, paddingHorizontal: 16, flexDirection: "row", direction: "ltr", alignItems: "center" }}
            >
              {ordered.map((uri, i) => {
                const page = pageNumberAt(i);
                const active = i === slot;
                // A thumb points at the SAME full-size file as the page, so mounting
                // all of them would fire a full download per thumb and starve the page
                // being read. Only mount the ones near the current page; the rest stay
                // as empty frames until you scroll near them (and by then the prefetch
                // has usually cached them, so they appear instantly).
                const near = Math.abs(i - slot) <= THUMB_WINDOW;
                return (
                  <Pressable key={`${uri}-${i}`} onPress={() => goToPage(page)}>
                    <View style={[styles.thumbWrap, { borderColor: active ? COLORS.primary : "rgba(255,255,255,0.25)", opacity: active ? 1 : 0.6 }]}>
                      {near ? <Image source={{ uri }} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" transition={140} /> : null}
                    </View>
                    <Text style={[styles.thumbNo, { color: active ? COLORS.primary : "rgba(255,255,255,0.6)" }]}>{formatNumber(page)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Animated.View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { ...FONT.semiBold, fontSize: 16 },
  backPill: { borderRadius: 22, paddingHorizontal: 22, paddingVertical: 11 },
  backPillText: { ...FONT.bold, fontSize: 14, color: "#fff" },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    direction: "ltr",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  circleBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.14)" },
  headerTitle: { ...FONT.bold, fontSize: 16, color: "#fff", flex: 1, textAlign: "center", marginHorizontal: 8 },
  pageBadge: { minWidth: 38, height: 38, borderRadius: 19, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.14)" },
  pageBadgeText: { ...FONT.bold, fontSize: 12, color: "#fff" },
  scrubber: { position: "absolute", bottom: 0, left: 0, right: 0, paddingTop: 12, backgroundColor: "rgba(0,0,0,0.55)" },
  thumbWrap: { width: THUMB_W, height: 58, borderRadius: 6, borderWidth: 2, overflow: "hidden" },
  thumb: { width: "100%", height: "100%" },
  thumbNo: { ...FONT.bold, fontSize: 10, textAlign: "center", marginTop: 3 },
});
