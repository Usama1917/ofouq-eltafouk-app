import { Feather, Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import HolographicWatermark from "@/components/HolographicWatermark";
import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { formatNumber } from "@/lib/format";
import {
  addToCart,
  addWishlist,
  cartKey,
  getBook,
  getCart,
  pickBookCover,
  removeCartItem,
  removeWishlist,
  storeBookKey,
  storeBooksKey,
  updateCartItem,
  wishlistKey,
  type StoreBook,
  type StoreBookDetail,
} from "@/lib/store";

// Extra bottom clearance so the fixed action bar clears the floating tab bar.
// Lowered a touch so the button sits closer to the tab bar (owner request).
const TAB_BAR_CLEARANCE = Platform.OS === "ios" ? 70 : 60;

// Floating "read a sample" disc: its size, and how far it floats ABOVE the
// add-to-cart bar so the two never overlap.
const PREVIEW_FAB_SIZE = 72;
const PREVIEW_FAB_LIFT = 78;

// How many sample pages to pull down in advance from this screen (see below).
const PREFETCH_PAGES = 3;

export default function BookDetailScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const { token } = useAuth();
  const { colors, resolvedScheme, language, isRTL, direction, reduceMotion } = usePreferences();
  const en = language === "en";
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  // The banner is 16:9 of the screen PLUS the status-bar strip it sits under, so the
  // art itself still reads as 16:9 once the clock/notch area is discounted.
  const bannerH = Math.round((screenW * 9) / 16) + insets.top;
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  // Add-to-cart flow: tap → GREEN "تمت الإضافة للسلة" flash (0.5s) → the button pops
  // into a − / count / + stepper. The stepper mirrors the REAL cart line, so a book
  // already in the cart shows the stepper straight away.
  const [flash, setFlash] = useState(false);
  const [pendingQty, setPendingQty] = useState<number | null>(null); // optimistic qty while a cart call is in flight
  const busy = useRef(false);
  const stepAnim = useRef(new Animated.Value(1)).current;
  const isDark = resolvedScheme === "dark";

  // INSTANT PAINT: the catalog row we just tapped already carries the cover, title,
  // price and gallery — reuse it as placeholder data so the page draws immediately
  // (with the very same image the list just rendered, so it's already decoded and
  // cached) instead of holding a spinner until the detail request comes back. The
  // real response then fills in what the list doesn't have (related books, sample
  // pages) without any visible swap.
  const seed = useMemo<StoreBookDetail | undefined>(() => {
    const cached = qc.getQueryData<StoreBook[]>(storeBooksKey());
    const found = cached?.find((b) => String(b.id) === String(bookId));
    if (!found) return undefined;
    return { ...found, unlocksSubject: null, related: [], previewPages: [], previewDirection: "rtl" };
  }, [qc, bookId]);

  const { data: book, isLoading } = useQuery({
    queryKey: storeBookKey(bookId),
    queryFn: () => getBook(token, bookId),
    enabled: !!token && !!bookId,
    placeholderData: seed,
  });
  const { data: cart } = useQuery({ queryKey: cartKey, queryFn: () => getCart(token), enabled: !!token });
  const line = cart?.items.find((i) => i.bookId === book?.id) ?? null;
  const qty = pendingQty ?? line?.quantity ?? 0;
  const inCart = qty > 0;
  const row = (e: boolean): "row" | "row-reverse" => (e ? "row" : "row-reverse");
  const ta = isRTL ? "right" : "left";
  const out = (book?.stockQuantity ?? 0) <= 0;
  // Detail page is full-width → landscape (16:9) hero, theme-aware with fallback.
  const heroCover = book ? pickBookCover(book, { landscape: true, dark: isDark }) : null;

  // INSTANT BANNER: the hero is the LANDSCAPE art, but the catalog card that was
  // just tapped rendered the PORTRAIT one — a different file that is already
  // downloaded and decoded. Handing it to the hero as the placeholder paints real
  // book art on the very first frame, and the landscape shot crossfades in on top
  // once it lands, instead of the student staring at an empty box. Gated on `seed`
  // (i.e. we actually came from a loaded catalog) so a cold deep-link doesn't pull
  // a second image down for nothing.
  const heroPlaceholder = useMemo(() => {
    if (!seed) return null;
    const portrait = pickBookCover(seed, { landscape: false, dark: isDark });
    return portrait && portrait !== heroCover ? portrait : null;
  }, [seed, isDark, heroCover]);

  // ── Image gallery ──────────────────────────────────────────────────────────
  // The banner is a swipe pager over [cover, ...extra images]. Swiping IS the only
  // way through it (owner's call — a thumbnail strip under the banner was tried and
  // dropped as clutter), so the dots are the sole position indicator. The pager runs
  // physically left→right (index 0 leftmost) in BOTH languages.
  const gallery = useMemo(() => {
    const list: string[] = [];
    if (heroCover) list.push(heroCover);
    for (const u of book?.imageUrls ?? []) {
      if (u && !list.includes(u)) list.push(u);
    }
    return list;
  }, [heroCover, book?.imageUrls]);

  const [activeImg, setActiveImg] = useState(0);
  const [pagerW, setPagerW] = useState(0);
  const pagerRef = useRef<ScrollView>(null);

  // ── Stretchy banner (iOS over-scroll) ──────────────────────────────────────
  // Pulling the page down past the top pushes the content away and would leave a
  // bare strip of page background above the art. Instead the art GROWS to keep the
  // gap filled, App Store style.
  //
  // The maths: over-scrolling by D puts the banner's top edge at y = D. Scaling it
  // by (bannerH + D)/bannerH about its CENTRE only lifts that edge by D/2, so the
  // matching translate of −D/2 finishes the job — top edge back at 0, and the bottom
  // edge lands exactly where the unscaled banner's would, so nothing below is
  // covered. Transform-only, so it rides the native driver at full frame rate.
  // The zoom is proportional to the pull, so a normal tug is a gentle nudge; only a
  // full-banner-height drag reaches 2×.
  const scrollY = useRef(new Animated.Value(0)).current;
  const stretch = useMemo(
    () => ({
      transform: [
        {
          translateY: scrollY.interpolate({
            inputRange: [-bannerH, 0],
            outputRange: [-bannerH / 2, 0],
            extrapolateRight: "clamp" as const,
          }),
        },
        {
          scale: scrollY.interpolate({
            inputRange: [-bannerH, 0],
            outputRange: [2, 1],
            extrapolateRight: "clamp" as const,
          }),
        },
      ],
    }),
    [scrollY, bannerH],
  );

  // Opening a related book reuses this screen, so reset to the first image.
  useEffect(() => {
    setActiveImg(0);
    pagerRef.current?.scrollTo({ x: 0, animated: false });
  }, [bookId]);

  // Keep the pager pinned to the active page when the width arrives/changes
  // (first layout, rotation) — otherwise it would silently drift off-page.
  useEffect(() => {
    if (pagerW > 0) pagerRef.current?.scrollTo({ x: activeImg * pagerW, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagerW]);

  // Pull the rest of the gallery down while the student reads the description, so
  // swiping the banner sideways lands on a ready image instead of a blank page.
  // Page 0 is deliberately skipped — it's on screen and already fetching at high
  // priority, and re-requesting it here would only compete with itself.
  useEffect(() => {
    if (gallery.length < 2) return;
    void Image.prefetch(gallery.slice(1), "memory-disk").catch(() => false);
  }, [gallery]);

  // Warm the FIRST few sample pages while the student is still reading this screen,
  // so tapping "اقرأ نسخة الاطلاع" opens on an already-cached page instead of a
  // spinner. Only the opening pages: fetching a whole sample for every book someone
  // merely glances at would burn their mobile data. The reader prefetches the rest.
  const previewPages = book?.previewPages;
  useEffect(() => {
    if (!previewPages?.length) return;
    let cancelled = false;
    void (async () => {
      for (const uri of previewPages.slice(0, PREFETCH_PAGES)) {
        if (cancelled) return;
        await Image.prefetch(uri, "memory-disk").catch(() => false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewPages]);

  async function onAdd() {
    if (!token || !book || out || adding) return;
    setAdding(true);
    try {
      await addToCart(token, book.id, 1);
      setPendingQty(1);
      setFlash(true);
      qc.invalidateQueries({ queryKey: cartKey }).then(() => setPendingQty(null));
      // Green confirmation for half a second, then the button "slices" open: the side
      // pieces (− / +) grow out of its two ends while the middle shrinks between them.
      setTimeout(() => {
        setFlash(false);
        if (reduceMotion) {
          stepAnim.setValue(1);
        } else {
          stepAnim.setValue(0);
          Animated.timing(stepAnim, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
        }
      }, 500);
    } catch (e) {
      // Surface the server's Arabic reason (e.g. "نفدت الكمية") instead of silence.
      Alert.alert(en ? "Error" : "خطأ", e instanceof Error ? e.message : en ? "Could not add to cart" : "تعذّر الإضافة للسلة");
    } finally {
      setAdding(false);
    }
  }

  // +1 / −1 from the stepper; hitting 0 plays the slice morph IN REVERSE (the − / +
  // pieces melt back into one button, turning blue as they merge), removes the cart
  // line, and the "أضف للسلة" button returns.
  async function changeQty(delta: number) {
    if (!token || !book || !line || busy.current) return;
    const next = qty + delta;
    if (next > book.stockQuantity) return;
    busy.current = true;
    try {
      if (next <= 0) {
        if (!reduceMotion) {
          await new Promise<void>((resolve) =>
            Animated.timing(stepAnim, { toValue: 0, duration: 320, easing: Easing.in(Easing.cubic), useNativeDriver: false }).start(() => resolve()),
          );
        }
        setPendingQty(0);
        await removeCartItem(token, line.id);
      } else {
        setPendingQty(next);
        await updateCartItem(token, line.id, next);
      }
      await qc.invalidateQueries({ queryKey: cartKey });
    } catch (e) {
      Alert.alert(en ? "Error" : "خطأ", e instanceof Error ? e.message : en ? "Could not update the cart" : "تعذّر تعديل السلة");
    } finally {
      setPendingQty(null);
      // Back to fully-open for the next time the stepper shows (also restores it
      // if the removal failed and the stepper is still on screen).
      stepAnim.setValue(1);
      busy.current = false;
    }
  }

  async function toggleFav() {
    if (!token || !book) return;
    try {
      if (book.favorite) await removeWishlist(token, book.id);
      else await addWishlist(token, book.id);
      await Promise.all([
        qc.invalidateQueries({ queryKey: storeBookKey(bookId) }),
        qc.invalidateQueries({ queryKey: storeBooksKey() }),
        qc.invalidateQueries({ queryKey: wishlistKey }),
      ]);
    } catch {
      // ignore
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* No header bar (owner's call — App Store product-page look): the art runs
          edge to edge and up under the status bar, and the only chrome is the two
          floating glass buttons rendered at the very bottom of this tree so they stay
          above the page. The status bar is left to the app-wide AppStatusBar, which
          already follows the theme — forcing light text here would hide the clock,
          since the book covers are light-backgrounded. */}
      {isLoading || !book ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>
      ) : (
        <>
          <Animated.ScrollView
            contentContainerStyle={{ paddingBottom: insets.bottom + 160, gap: 16 }}
            // The stretch maths assumes contentOffset.y is 0 at rest; iOS's automatic
            // inset adjustment would silently shift that zero and leave the banner
            // permanently over-scaled.
            contentInsetAdjustmentBehavior="never"
            scrollEventThrottle={16}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
          >
            {/* Banner — full-bleed swipeable pager over the whole gallery */}
            <View style={styles.coverBox} onLayout={(e) => setPagerW(Math.round(e.nativeEvent.layout.width))}>
              {/* Only the ART stretches — the dots below stay put and unscaled.
                  stretchWrap MUST carry width:"100%": coverBox centres its children, so
                  without it this wrapper shrink-wraps to its content, the pager's own
                  width:"100%" resolves against nothing, and the whole gallery lays out
                  side-by-side instead of paging. */}
              <Animated.View style={[styles.stretchWrap, stretch]}>
              {gallery.length > 0 ? (
                <ScrollView
                  ref={pagerRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  scrollEnabled={gallery.length > 1}
                  // Physical LTR so page N always sits at x = N × width, whatever the
                  // ambient RTL flag says — the dots below are indexed the same way.
                  style={[styles.pager, { direction: "ltr" }]}
                  onMomentumScrollEnd={(e) => {
                    if (pagerW > 0) setActiveImg(Math.round(e.nativeEvent.contentOffset.x / pagerW));
                  }}
                >
                  {gallery.map((u, i) => (
                    <Image
                      key={`${u}-${i}`}
                      source={{ uri: u }}
                      // Fall back to the screen width until onLayout reports: the banner
                      // is full-bleed, so the two are the same number, and this keeps
                      // the first frame from drawing a zero-width (blank) page.
                      style={[styles.cover, { width: pagerW || screenW, height: bannerH }]}
                      contentFit="cover"
                      // Survives app restarts, so a book opened twice never waits again.
                      cachePolicy="memory-disk"
                      // The first page is what the student is looking at right now; the
                      // rest can wait behind it rather than competing for bandwidth.
                      priority={i === 0 ? "high" : "low"}
                      // Real art on frame one (see heroPlaceholder), then a crossfade —
                      // never a hard swap, and instant when reduce-motion is on.
                      placeholder={i === 0 && heroPlaceholder ? { uri: heroPlaceholder } : undefined}
                      placeholderContentFit="cover"
                      transition={reduceMotion ? 0 : 220}
                    />
                  ))}
                </ScrollView>
              ) : (
                <LinearGradient colors={[COLORS.primary + "22", COLORS.primary + "0A"]} style={[styles.cover, { height: bannerH }]}>
                  <Feather name="book-open" size={56} color={COLORS.primary} />
                </LinearGradient>
              )}
              </Animated.View>

              {/* Page dots — OUTSIDE the picture, centred just under its frame (owner's
                  call): sitting on top of the art they hid part of it and were easy to
                  lose against a light cover. Only worth showing past one image. */}
              {gallery.length > 1 ? (
                <View style={[styles.dots, { flexDirection: "row", direction: "ltr" }]}>
                  {gallery.map((_, i) => (
                    <PageDot key={i} active={i === activeImg} idle={colors.textTertiary} reduceMotion={reduceMotion} />
                  ))}
                </View>
              ) : null}
            </View>

            {/* Everything BELOW the banner keeps the old page padding — the padding
                moved off the ScrollView itself so the art alone can run edge to edge. */}
            <View style={{ paddingHorizontal: 20, gap: 16 }}>

            {/* Force a physical LTR box + align the block to the reading side
                (flex-end = right in Arabic), so the title sits on the right in Arabic
                regardless of the ambient RTL flag — matching the catalog card. The price
                row is centered (alignSelf) under the title per the owner's request. */}
            <View style={{ gap: 6, direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }}>
              <Text style={[styles.title, { color: colors.text, textAlign: ta, writingDirection: direction }]}>{book.title}</Text>
              <View style={[styles.priceRow, { flexDirection: row(en), direction: "ltr", alignSelf: "center" }]}>
                <Text style={[styles.price, { color: COLORS.primary }]}>{formatNumber(book.priceEgp)} {en ? "EGP" : "ج"}</Text>
                {book.originalPriceEgp && book.originalPriceEgp > book.priceEgp ? (
                  <Text style={[styles.oldPrice, { color: colors.textTertiary }]}>{formatNumber(book.originalPriceEgp)}</Text>
                ) : null}
              </View>
            </View>

            {/* Unlocks-subject line — a "security paper" chip sized like the
                add-to-cart pill (screen minus this column's 20px padding per side),
                same 16px radius, so it reads as one of the page's buttons. */}
            {book.unlocksSubject ? (
              <HolographicWatermark
                width={screenW - 40}
                isDark={isDark}
                reduceMotion={reduceMotion}
                text={en ? `Free subscription to “${book.unlocksSubject.name}” with the book` : `اشتراك مجاني مع الكتاب في مادة «${book.unlocksSubject.name}»`}
              />
            ) : null}

            {out ? (
              <View style={[styles.outBanner, { backgroundColor: COLORS.error + "15", direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }]}>
                <Text style={[styles.outBannerText, { color: COLORS.error, textAlign: ta, writingDirection: direction }]}>{en ? "Out of stock" : "الكتاب ده نفدت كميته حاليًا"}</Text>
              </View>
            ) : book.stockQuantity <= 5 ? (
              <View style={{ direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }}>
                <Text style={[styles.lowStock, { color: COLORS.warning, textAlign: ta, writingDirection: direction }]}>
                  {en ? `Only ${book.stockQuantity} left` : `متبقّي ${formatNumber(book.stockQuantity)} نسخ بس`}
                </Text>
              </View>
            ) : null}

            {book.description ? (
              <View style={{ gap: 6, direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }}>
                <Text style={[styles.sectionH, { color: colors.text, textAlign: ta, writingDirection: direction }]}>{en ? "About the book" : "عن الكتاب"}</Text>
                <Text style={[styles.desc, { color: colors.textSecondary, textAlign: ta, writingDirection: direction, width: "100%" }]}>{book.description}</Text>
              </View>
            ) : null}

            {/* Related */}
            {book.related.length > 0 ? (
              <View style={{ gap: 10 }}>
                {/* Heading wrapped so it aligns to the right in Arabic without shrinking
                    the horizontal cards ScrollView below it. */}
                <View style={{ direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }}>
                  <Text style={[styles.sectionH, { color: colors.text, textAlign: ta, writingDirection: direction }]}>{en ? "You may also like" : "اشتروا كمان"}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, flexDirection: row(en) }}>
                  {book.related.map((r) => (
                    <Pressable
                      key={r.id}
                      onPress={() => router.push({ pathname: "/(tabs)/store/book", params: { bookId: String(r.id) } })}
                      style={[styles.relCard, { backgroundColor: colors.surface }]}
                    >
                      <LinearGradient colors={[COLORS.primary + "22", COLORS.primary + "0A"]} style={styles.relCover}>
                        <Feather name="book" size={22} color={COLORS.primary} />
                      </LinearGradient>
                      <Text numberOfLines={2} style={[styles.relTitle, { color: colors.text, textAlign: ta, writingDirection: direction, width: "100%" }]}>{r.title}</Text>
                      <Text style={[styles.relPrice, { color: COLORS.primary, textAlign: ta, width: "100%" }]}>{formatNumber(r.priceEgp)} {en ? "EGP" : "ج"}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}
            </View>
          </Animated.ScrollView>

          {/* Bottom cart bar: add → green flash (0.5s) → pops into − / count / + */}
          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE, backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            {flash ? (
              <View style={[styles.addBtn, { backgroundColor: COLORS.success, flexDirection: row(en), direction: "ltr" }]}>
                {/* Text only — the green fill already says "done"; the tick icon and the
                    ✓ in the copy just bracketed the line with two of the same mark. */}
                <Text style={styles.addBtnText}>{en ? "Added to cart" : "تمت الإضافة للسلة"}</Text>
              </View>
            ) : inCart && !out ? (
              // PHYSICAL layout (direction:"ltr"): − on the left, big counter (→ cart) in
              // the middle, + on the right. The "slice" morph: each side piece animates its
              // WIDTH 0→56 (+ its gap 0→10) so it grows out of the button's end while the
              // flex:1 middle shrinks between them — and its colour eases from the button's
              // blue to the final grey, like a piece cut off the original button.
              <View style={{ flexDirection: "row", direction: "ltr", alignItems: "stretch" }}>
                <Animated.View
                  style={{
                    width: stepAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 56] }),
                    marginRight: stepAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 10] }),
                    backgroundColor: stepAnim.interpolate({ inputRange: [0, 1], outputRange: [COLORS.primary, colors.surfaceSecondary] }),
                    borderColor: colors.border,
                    opacity: stepAnim.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0.6, 1] }),
                    overflow: "hidden",
                    borderRadius: 16,
                    borderWidth: 1,
                  }}
                >
                  <Pressable onPress={() => changeQty(-1)} style={styles.qtySideFill}>
                    <Feather name="minus" size={22} color={colors.text} />
                  </Pressable>
                </Animated.View>
                {/* Physical order (direction:"ltr" ON this node): icon ← 5 ← · ← الانتقال للسلة */}
                <Pressable onPress={() => router.push("/(tabs)/store/cart")} style={[styles.qtyMid, { backgroundColor: COLORS.primary }]}>
                  <Feather name="shopping-cart" size={18} color="#fff" />
                  <Text style={styles.addBtnText}>{formatNumber(qty)}</Text>
                  <Text style={styles.qtyMidHint}>·</Text>
                  <Text style={styles.qtyMidHint}>{en ? "Go to cart" : "الانتقال للسلة"}</Text>
                </Pressable>
                <Animated.View
                  style={{
                    width: stepAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 56] }),
                    marginLeft: stepAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 10] }),
                    backgroundColor: stepAnim.interpolate({ inputRange: [0, 1], outputRange: [COLORS.primary, colors.surfaceSecondary] }),
                    borderColor: colors.border,
                    opacity: stepAnim.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0.6, 1] }),
                    overflow: "hidden",
                    borderRadius: 16,
                    borderWidth: 1,
                  }}
                >
                  <Pressable
                    onPress={() => changeQty(1)}
                    disabled={qty >= book.stockQuantity}
                    style={[styles.qtySideFill, { opacity: qty >= book.stockQuantity ? 0.4 : 1 }]}
                  >
                    <Feather name="plus" size={22} color={colors.text} />
                  </Pressable>
                </Animated.View>
              </View>
            ) : (
              <Pressable
                onPress={onAdd}
                disabled={out || adding}
                style={[styles.addBtn, { backgroundColor: out ? colors.textTertiary : COLORS.primary, flexDirection: row(en), direction: "ltr" }]}
              >
                <Feather name="shopping-cart" size={18} color="#fff" />
                <Text style={styles.addBtnText}>
                  {out ? (en ? "Out of stock" : "نفدت الكمية") : en ? "Add to cart" : "أضف للسلة"}
                </Text>
              </Pressable>
            )}
          </View>
        </>
      )}

      {/* Free sample — a floating glass disc instead of the old full-width outlined
          button (owner's call). It rides ABOVE the page so it stays reachable however
          far down the description the student has scrolled, and sits clear of the
          add-to-cart bar. Only exists when the book actually has a sample. */}
      {book && book.previewPages.length > 0 ? (
        <PreviewFab
          onPress={() => router.push({ pathname: "/book-preview", params: { bookId: String(book.id) } })}
          isDark={isDark}
          reduceMotion={reduceMotion}
          label={en ? "Free\nsample" : "نسخة\nالاطلاع"}
          bottom={insets.bottom + TAB_BAR_CLEARANCE + PREVIEW_FAB_LIFT}
        />
      ) : null}

      {/* Floating glass controls — LAST child, so they paint over the page and stay
          put while it scrolls (App Store behaviour), and they exist during loading
          too, otherwise there'd be no way back off a book that is still fetching.
          Back left / favourite right in PHYSICAL positions that don't flip with the
          language, because "back" belongs where the swipe-back gesture starts. */}
      <View pointerEvents="box-none" style={[styles.floatBar, { top: insets.top + 6, flexDirection: "row", direction: "ltr" }]}>
        <GlassButton onPress={() => router.back()} isDark={isDark}>
          <Feather name="arrow-left" size={20} color={isDark ? "#fff" : "#1c1c1e"} />
        </GlassButton>
        <GlassButton onPress={toggleFav} isDark={isDark}>
          <Ionicons
            name={book?.favorite ? "heart" : "heart-outline"}
            size={20}
            color={book?.favorite ? COLORS.error : isDark ? "#fff" : "#1c1c1e"}
          />
        </GlassButton>
      </View>
    </View>
  );
}

// The floating "read a sample" disc. Same glass recipe as the header buttons, but
// bigger and labelled, and it FADES/RISES in on mount rather than popping into place.
function PreviewFab({
  onPress,
  isDark,
  reduceMotion,
  label,
  bottom,
}: {
  onPress: () => void;
  isDark: boolean;
  reduceMotion: boolean;
  label: string;
  bottom: number;
}) {
  const enter = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const press = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      enter.setValue(1);
      return;
    }
    Animated.spring(enter, { toValue: 1, useNativeDriver: true, friction: 7, tension: 70, delay: 220 }).start();
  }, [enter, reduceMotion]);

  const springTo = (v: number) => Animated.spring(press, { toValue: v, useNativeDriver: true, friction: 7, tension: 180 }).start();

  return (
    <Animated.View
      style={[
        styles.previewFabWrap,
        {
          bottom,
          opacity: enter,
          transform: [
            { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
            { scale: Animated.multiply(enter, press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] })) },
          ],
        },
      ]}
    >
      <Pressable onPress={onPress} onPressIn={() => springTo(1)} onPressOut={() => springTo(0)} accessibilityRole="button">
        <View style={styles.previewFab}>
          <BlurView intensity={isDark ? 45 : 60} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
          {/* Tint floor keeps the label readable over whatever text scrolls beneath. */}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "rgba(28,28,30,0.5)" : "rgba(255,255,255,0.62)" }]} />
          <LinearGradient
            colors={
              isDark
                ? ["rgba(255,255,255,0.22)", "rgba(255,255,255,0.04)"]
                : ["rgba(255,255,255,0.8)", "rgba(255,255,255,0.12)"]
            }
            start={{ x: 0.3, y: 0 }}
            end={{ x: 0.7, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Feather name="book-open" size={16} color={COLORS.primary} />
          <Text style={[styles.previewFabText, { color: COLORS.primary }]}>{label}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// A round "liquid glass" button in the iOS style: a real blur of whatever is behind
// it, a translucent tint so icons stay legible over both a bright cover and a white
// page, and a soft top-down sheen that gives the disc its curved-glass look. Layered
// the same way as the theme toggle's orb so the app keeps ONE glass recipe.
function GlassButton({ onPress, isDark, children }: { onPress: () => void; isDark: boolean; children: React.ReactNode }) {
  const press = useRef(new Animated.Value(0)).current;
  const springTo = (v: number) => Animated.spring(press, { toValue: v, useNativeDriver: true, friction: 7, tension: 180 }).start();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => springTo(1)}
      onPressOut={() => springTo(0)}
      hitSlop={8}
      accessibilityRole="button"
    >
      <Animated.View
        style={[
          styles.glassBtn,
          { transform: [{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] }) }] },
        ]}
      >
        <BlurView intensity={isDark ? 45 : 60} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
        {/* Tint floor: blur alone goes muddy over a saturated cover (the book art is
            mostly one strong colour), and the icon loses contrast without this. */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "rgba(28,28,30,0.42)" : "rgba(255,255,255,0.55)" }]} />
        <LinearGradient
          colors={
            isDark
              ? ["rgba(255,255,255,0.22)", "rgba(255,255,255,0.04)"]
              : ["rgba(255,255,255,0.75)", "rgba(255,255,255,0.12)"]
          }
          start={{ x: 0.3, y: 0 }}
          end={{ x: 0.7, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {children}
      </Animated.View>
    </Pressable>
  );
}

// One page dot under the banner. The active one STRETCHES into a short pill and
// takes the brand colour, so which image you're on reads at a glance even in a row
// of small grey dots. It springs between the two states rather than snapping, and
// goes instant under reduce-motion.
function PageDot({ active, idle, reduceMotion }: { active: boolean; idle: string; reduceMotion: boolean }) {
  const anim = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      anim.setValue(active ? 1 : 0);
      return;
    }
    Animated.spring(anim, { toValue: active ? 1 : 0, useNativeDriver: false, friction: 8, tension: 120 }).start();
  }, [active, reduceMotion, anim]);

  return (
    <Animated.View
      style={[
        styles.dot,
        {
          // width/backgroundColor can't run on the native driver, hence useNativeDriver:false.
          width: anim.interpolate({ inputRange: [0, 1], outputRange: [7, 20] }),
          backgroundColor: anim.interpolate({ inputRange: [0, 1], outputRange: [idle, COLORS.primary] }),
          opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  // Full-bleed art: no radius, no side padding, and it runs up under the status bar.
  coverBox: { alignItems: "center" },
  // Full width is load-bearing, not cosmetic — see the note at the usage site.
  // `overflow: hidden` is a belt on top of it: clipping happens BEFORE the scale, so
  // the art still grows past this box, but a width mistake can never spill the
  // gallery sideways across the screen again.
  stretchWrap: { width: "100%", overflow: "hidden" },
  pager: { width: "100%" },
  cover: { width: "100%", alignItems: "center", justifyContent: "center" },
  // Fixed overlay row for the two glass buttons, pinned across the top of the art.
  floatBar: { position: "absolute", left: 16, right: 16, justifyContent: "space-between" },
  glassBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    // A hairline rim is what reads as "edge of glass" rather than a flat circle.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.45)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  // Below the frame now, not laid over it — hence a normal flow row with a small
  // gap instead of an absolutely-positioned overlay.
  dots: { marginTop: 10, alignSelf: "center", gap: 7, alignItems: "center" },
  dot: { height: 7, borderRadius: 3.5 },
  title: { ...FONT.bold, fontSize: 22 },
  author: { ...FONT.regular, fontSize: 15 },
  priceRow: { alignItems: "center", gap: 10, marginTop: 4 },
  price: { ...FONT.bold, fontSize: 22 },
  oldPrice: { ...FONT.regular, fontSize: 15, textDecorationLine: "line-through" },
  // Floating sample disc, pinned bottom-LEFT (owner's call) — a PHYSICAL corner that
  // doesn't flip with the language, so it never lands under the favourite button.
  // `bottom` is set inline (see PREVIEW_FAB_LIFT).
  previewFabWrap: { position: "absolute", left: 16 },
  previewFab: {
    width: PREVIEW_FAB_SIZE,
    height: PREVIEW_FAB_SIZE,
    borderRadius: PREVIEW_FAB_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.5)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  previewFabText: { ...FONT.bold, fontSize: 10, lineHeight: 13, textAlign: "center" },
  outBanner: { borderRadius: 12, padding: 12 },
  outBannerText: { ...FONT.semiBold, fontSize: 14 },
  lowStock: { ...FONT.semiBold, fontSize: 13 },
  sectionH: { ...FONT.bold, fontSize: 16 },
  desc: { ...FONT.regular, fontSize: 14, lineHeight: 24 },
  relCard: { width: 120, borderRadius: 14, padding: 10, gap: 6 },
  relCover: { height: 90, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  relTitle: { ...FONT.semiBold, fontSize: 12 },
  relPrice: { ...FONT.bold, fontSize: 13 },
  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  addBtn: { borderRadius: 16, paddingVertical: 15, alignItems: "center", justifyContent: "center", gap: 8 },
  addBtnText: { ...FONT.bold, fontSize: 16, color: "#fff" },
  // Fixed inner width (56 − 2px borders) so the icon stays centred at its final spot
  // while the animated overflow-hidden wrapper reveals it like a widening slice.
  qtySideFill: { width: 54, flex: 1, alignItems: "center", justifyContent: "center" },
  qtyMid: { flex: 1, borderRadius: 16, paddingVertical: 15, alignItems: "center", justifyContent: "center", gap: 6, flexDirection: "row", direction: "ltr" },
  qtyMidHint: { ...FONT.semiBold, fontSize: 13, color: "rgba(255,255,255,0.85)" },
});
