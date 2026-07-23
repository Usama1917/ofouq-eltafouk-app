import { Feather, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { FONT } from "@/constants/typography";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useRefetchOnFocus } from "@/hooks/useRefetchOnFocus";
import { apiFetch } from "@/lib/api";
import { localizeAcademicText } from "@/lib/academicContentLocalization";
import { searchLessons } from "@/lib/engagement";
import { LessonRefCard } from "@/components/LessonRefCard";

type AcademicYear = {
  id: number;
  name: string;
  nameEn?: string | null;
  description?: string | null;
  descriptionEn?: string | null;
};

const YEAR_ACCENTS = [
  { bg: "#EAF3FF", border: "#BFDBFE", icon: "#2563EB", arrow: "#2563EB" },
  { bg: "#ECFDF5", border: "#A7F3D0", icon: "#059669", arrow: "#059669" },
  { bg: "#FFF7ED", border: "#FED7AA", icon: "#EA580C", arrow: "#EA580C" },
  { bg: "#F5F3FF", border: "#DDD6FE", icon: "#7C3AED", arrow: "#7C3AED" },
];

function YearCard({ item, index }: { item: AcademicYear; index: number }) {
  const { colors, language, isRTL, textAlign, direction, rowDirection } = usePreferences();
  const accent = YEAR_ACCENTS[index % YEAR_ACCENTS.length];
  const scale = useRef(new Animated.Value(1)).current;

  function animatePress(toValue: number) {
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      speed: 22,
      bounciness: 3,
    }).start();
  }

  function handleOpen(source: "card" | "arrow") {
    const params = { yearId: String(item.id), yearName: String(item.name ?? ""), yearNameEn: String(item.nameEn ?? "") };
    console.info("[mobile][videos] year card pressed", {
      source,
      yearId: params.yearId,
      yearName: params.yearName,
      route: "/(tabs)/videos/subjects",
      disabled: false,
    });

    router.push({
      pathname: "/(tabs)/videos/subjects",
      params,
    });

    console.info("[mobile][videos] stack push after", {
      screen: "subjects",
      params,
    });
  }

  return (
    <Pressable
      onPress={() => handleOpen("card")}
      onPressIn={() => animatePress(0.985)}
      onPressOut={() => animatePress(1)}
      accessibilityRole="button"
    >
      <Animated.View
        style={[
          styles.yearCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            flexDirection: rowDirection,
            direction,
            transform: [{ scale }],
          },
        ]}
      >
        <View style={[styles.yearIcon, { backgroundColor: accent.bg, borderColor: accent.border }]}>
          <Ionicons name="school-outline" size={26} color={accent.icon} />
        </View>
        <View style={[styles.yearBody, { direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }]}>
          <Text
            style={[styles.yearTitle, { color: colors.text, textAlign, writingDirection: direction }]}
            numberOfLines={2}
          >
            {localizeAcademicText(item.name, language, item.nameEn)}
          </Text>
          {item.description ? (
            <Text
              style={[styles.yearDesc, { color: colors.textSecondary, textAlign, writingDirection: direction }]}
              numberOfLines={2}
            >
              {localizeAcademicText(item.description, language, item.descriptionEn)}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={() => handleOpen("arrow")}
          hitSlop={12}
          accessibilityRole="button"
          style={({ pressed }) => ({ opacity: pressed ? 0.62 : 1 })}
        >
          <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={21} color={accent.arrow} />
        </Pressable>
      </Animated.View>
    </Pressable>
  );
}

// Header geometry — kept as constants so the morph maths stays in one place.
const TITLE_ROW_H = 58;
const BAR_H = 44;
const GAP = 12;
const PAD_BOTTOM = 14;
const CIRCLE = 44;

export default function VideosScreen() {
  const { colors, resolvedScheme, strings, language, isRTL, textAlign, direction, reduceMotion } = usePreferences();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const en = language === "en";

  const PAD_TOP = insets.top + 30;
  const baseHeaderHeight = PAD_TOP + TITLE_ROW_H + PAD_BOTTOM;
  const openHeaderHeight = baseHeaderHeight + GAP + BAR_H;
  const closedTop = PAD_TOP + (TITLE_ROW_H - CIRCLE) / 2;
  const openTop = PAD_TOP + TITLE_ROW_H + GAP;

  const [searchOpen, setSearchOpen] = useState(false);
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [contentW, setContentW] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;

  // Debounce so we don't hit the server on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  // The static height the body content sits under (header is an animated overlay
  // on top, so the body padding can flip instantly without a visible snap).
  const headerOverlayHeight = searchOpen ? openHeaderHeight : baseHeaderHeight;

  // The search field morphs between a circle (closed) and a full-width bar (open).
  const innerWidth = contentW > 0 ? contentW - 36 : CIRCLE;
  const frameTop = anim.interpolate({ inputRange: [0, 1], outputRange: [closedTop, openTop] });
  const frameWidth = anim.interpolate({ inputRange: [0, 1], outputRange: [CIRCLE, innerWidth] });
  const frameRadius = anim.interpolate({ inputRange: [0, 1], outputRange: [CIRCLE / 2, 16] });
  const headerHeight = anim.interpolate({ inputRange: [0, 1], outputRange: [baseHeaderHeight, openHeaderHeight] });
  const closedOpacity = anim.interpolate({ inputRange: [0, 0.45, 1], outputRange: [1, 0, 0] });
  const openOpacity = anim.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 0, 1] });
  const titleShift = anim.interpolate({ inputRange: [0, 1], outputRange: [CIRCLE + 12, 0] });

  function toggleSearch(next: boolean) {
    setSearchOpen(next);
    if (next) {
      setTimeout(() => inputRef.current?.focus(), 260);
    } else {
      inputRef.current?.blur();
      setInput("");
      setQ("");
    }
    // Liquid morph: circle ↔ bar + header bottom edge slides down (respect reduce-motion).
    if (reduceMotion) {
      anim.setValue(next ? 1 : 0);
      return;
    }
    Animated.timing(anim, {
      toValue: next ? 1 : 0,
      duration: 340,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: false,
    }).start();
  }

  function clearOrClose() {
    if (input.length > 0) {
      setInput("");
      setQ("");
      inputRef.current?.focus();
    } else {
      toggleSearch(false);
    }
  }

  const {
    data: years = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<AcademicYear[]>({
    queryKey: ["academic", "years"],
    queryFn: () => apiFetch("/api/academic/years"),
  });

  // Re-fetch the year list whenever the student returns to this tab so newly
  // published academic content shows up without restarting the app.
  useRefetchOnFocus(refetch);

  // Inline lesson search — same data the standalone search screen used, but shown
  // right here without leaving the page.
  const { data: searchData, isFetching: isSearching } = useQuery({
    queryKey: ["search", q, token],
    queryFn: () => searchLessons(token, q),
    enabled: !!token && searchOpen && q.length >= 2,
  });
  const showingSearch = searchOpen && q.length >= 2;
  const searchResults = showingSearch ? searchData?.lessons ?? [] : [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={
          resolvedScheme === "dark"
            ? ["#000000", "#000000", "#000000"]
            : ["#EEF5FF", "#F8FBFF", "#F5F2FF"]
        }
        style={StyleSheet.absoluteFill}
      />

      <Animated.View
        style={[styles.topBar, { height: headerHeight }]}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          setContentW((c) => (Math.abs(c - w) < 0.5 ? c : w));
        }}
      >
        <BlurView
          intensity={resolvedScheme === "dark" ? 62 : 92}
          tint={resolvedScheme === "dark" ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: resolvedScheme === "dark"
                ? "rgba(0,0,0,0.92)"
                : "rgba(248,251,255,0.92)",
            },
          ]}
        />

        {/* Title row — its inline-start padding shrinks to 0 as the circle morphs
            away and slides down, so the title reclaims the full width. */}
        <Animated.View
          style={{
            marginTop: PAD_TOP,
            marginHorizontal: 18,
            height: TITLE_ROW_H,
            direction: "ltr",
            flexDirection: "row",
            alignItems: "center",
            paddingStart: titleShift,
          }}
        >
          <View style={{ direction: "ltr", flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
            <View style={[styles.titleIcon, resolvedScheme === "dark" && { backgroundColor: COLORS.darkIconFrame.background, borderColor: COLORS.darkIconFrame.border }]}>
              <Ionicons name="school-outline" size={22} color={resolvedScheme === "dark" ? COLORS.darkIconFrame.foreground : COLORS.primary} />
            </View>
            <View style={[styles.titleTextBlock, { direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start", flex: 1, minWidth: 0 }]}>
              <Text style={[styles.title, { color: colors.text, textAlign, writingDirection: direction }]} numberOfLines={1}>
                {strings.videos.title}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary, textAlign, writingDirection: direction }]} numberOfLines={1}>
                {strings.videos.subtitle}
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* The morphing search field: a circle when closed, a full-width bar when open. */}
        <Animated.View
          style={[
            styles.morphFrame,
            {
              top: frameTop,
              left: 18,
              width: frameWidth,
              height: BAR_H,
              borderRadius: frameRadius,
              backgroundColor: resolvedScheme === "dark" ? "#151517" : colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          {/* Closed state: a centred magnifier that fades out as it opens. */}
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.morphCentered, { opacity: closedOpacity }]}
          >
            <Feather name="search" size={20} color={COLORS.primary} />
          </Animated.View>

          {/* Open state: magnifier + input + clear/close, fading in as the bar forms. */}
          <Animated.View
            pointerEvents={searchOpen ? "auto" : "none"}
            style={[
              StyleSheet.absoluteFill,
              styles.morphBarRow,
              { direction: "ltr", flexDirection: en ? "row" : "row-reverse", opacity: openOpacity },
            ]}
          >
            <Feather name="search" size={18} color={colors.textTertiary} />
            <TextInput
              ref={inputRef}
              value={input}
              onChangeText={setInput}
              editable={searchOpen}
              placeholder={en ? "Search for a lesson…" : "دوّر على درس…"}
              placeholderTextColor={colors.textTertiary}
              style={[styles.searchInput, { color: colors.text, textAlign: en ? "left" : "right", writingDirection: direction }]}
              returnKeyType="search"
              autoCorrect={false}
            />
            <Pressable onPress={clearOrClose} hitSlop={8}>
              <Feather name="x" size={18} color={colors.textTertiary} />
            </Pressable>
          </Animated.View>

          {/* When closed the whole circle is the tap target that opens search. */}
          {!searchOpen ? (
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => toggleSearch(true)}
              accessibilityRole="button"
              accessibilityLabel="search"
            />
          ) : null}
        </Animated.View>
      </Animated.View>

      {searchOpen ? (
        isSearching && showingSearch ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: headerOverlayHeight + 40 }} />
        ) : !showingSearch ? (
          <View style={[styles.hint, { paddingTop: headerOverlayHeight + 60 }]}>
            <Feather name="search" size={38} color={colors.textTertiary} />
            <Text style={[styles.hintText, { color: colors.textSecondary }]}>
              {en ? "Type at least 2 letters to search your subjects." : "اكتب حرفين على الأقل للبحث في موادك."}
            </Text>
          </View>
        ) : searchResults.length === 0 ? (
          <View style={[styles.hint, { paddingTop: headerOverlayHeight + 60 }]}>
            <Text style={[styles.hintText, { color: colors.textSecondary }]}>
              {en ? "No lessons found." : "مفيش دروس مطابقة."}
            </Text>
          </View>
        ) : (
          <FlatList
            data={searchResults}
            keyExtractor={(it) => String(it.lessonId)}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingTop: headerOverlayHeight + 16,
              paddingHorizontal: 16,
              paddingBottom: insets.bottom + 118,
              gap: 10,
            }}
            renderItem={({ item }) => <LessonRefCard item={item} />}
          />
        )
      ) : (
        <FlatList
          data={years}
          keyExtractor={(item) => String(item.id)}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{
            paddingTop: headerOverlayHeight + 18,
            paddingHorizontal: 18,
            paddingBottom: insets.bottom + 118,
            gap: 14,
            flexGrow: 1,
          }}
          renderItem={({ item, index }) => <YearCard item={item} index={index} />}
          ListEmptyComponent={
            <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {isLoading ? (
                <>
                  <ActivityIndicator color={COLORS.primary} />
                  <Text style={[styles.stateTitle, { color: colors.text }]}>{strings.common.loading}</Text>
                </>
              ) : isError ? (
                <>
                  <View style={styles.stateIcon}>
                    <Feather name="wifi-off" size={28} color={COLORS.error} />
                  </View>
                  <Text style={[styles.stateTitle, { color: colors.text }]}>{strings.videos.loadErrorTitle}</Text>
                  <Text style={[styles.stateText, { color: colors.textSecondary }]}>
                    {error instanceof Error ? error.message : strings.common.unexpectedError}
                  </Text>
                  <Pressable
                    onPress={() => void refetch()}
                    disabled={isFetching}
                    style={styles.retryButton}
                  >
                    <Text style={styles.retryText}>
                      {isFetching ? strings.common.retrying : strings.common.retry}
                    </Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <View style={styles.stateIcon}>
                    <Ionicons name="play-circle-outline" size={34} color={COLORS.primary} />
                  </View>
                  <Text style={[styles.stateTitle, { color: colors.text }]}>{strings.videos.emptyTitle}</Text>
                  <Text style={[styles.stateText, { color: colors.textSecondary }]}>
                    {strings.videos.emptyText}
                  </Text>
                </>
              )}
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    overflow: "hidden",
  },
  topBarContent: {
    zIndex: 1,
    width: "100%",
    flex: 1,
    alignItems: "center",
    gap: 13,
    paddingBottom: 14,
  },
  header: { paddingBottom: 8 },
  morphFrame: {
    position: "absolute",
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
  },
  morphCentered: {
    alignItems: "center",
    justifyContent: "center",
  },
  morphBarRow: {
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 9,
  },
  searchInput: {
    flex: 1,
    ...FONT.regular,
    fontSize: 15,
    paddingVertical: 0,
  },
  hint: {
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 40,
    gap: 12,
  },
  hintText: {
    ...FONT.regular,
    fontSize: 13.5,
    textAlign: "center",
    lineHeight: 21,
  },
  titleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 13,
  },
  titleIcon: {
    width: 58,
    height: 58,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.primary + "18",
    backgroundColor: COLORS.primary + "12",
  },
  titleTextBlock: { flex: 1, alignItems: "flex-end" },
  title: {
    ...FONT.bold,
    fontSize: 21,
    lineHeight: 29,
    textAlign: "right",
  },
  subtitle: {
    ...FONT.regular,
    fontSize: 16,
    lineHeight: 25,
    textAlign: "right",
  },
  yearCard: {
    minHeight: 124,
    borderRadius: 26,
    borderWidth: 1,
    padding: 18,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 14,
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.1,
    shadowRadius: 26,
  },
  yearIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  yearBody: {
    flex: 1,
    alignItems: "flex-end",
  },
  yearTitle: {
    ...FONT.bold,
    fontSize: 17,
    lineHeight: 26,
    textAlign: "right",
  },
  yearDesc: {
    ...FONT.regular,
    fontSize: 14,
    lineHeight: 22,
    textAlign: "right",
    marginTop: 4,
  },
  stateCard: {
    marginTop: 44,
    borderRadius: 26,
    borderWidth: 1,
    padding: 26,
    alignItems: "center",
    gap: 10,
  },
  stateIcon: {
    width: 62,
    height: 62,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary + "10",
  },
  stateTitle: {
    ...FONT.bold,
    fontSize: 16,
    textAlign: "center",
  },
  stateText: {
    ...FONT.regular,
    fontSize: 13,
    lineHeight: 22,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 8,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: COLORS.primary,
  },
  retryText: {
    ...FONT.bold,
    fontSize: 13,
    color: "#fff",
  },
});
