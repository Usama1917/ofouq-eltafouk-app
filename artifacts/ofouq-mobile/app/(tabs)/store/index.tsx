import { Feather, Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useRefetchOnFocus } from "@/hooks/useRefetchOnFocus";
import { formatNumber } from "@/lib/format";
import {
  addWishlist,
  cartKey,
  getCart,
  getStoreLayout,
  listBooks,
  pickBookCover,
  removeWishlist,
  storeBooksKey,
  storeLayoutKey,
  wishlistKey,
  type LayoutRow,
  type StoreBook,
} from "@/lib/store";

// Align a title by its OWN script (not the app language): any Arabic letters →
// RTL/right, otherwise LTR/left. Lets an English title sit left inside an Arabic app.
const AR_RE = /[؀-ۿݐ-ݿࢠ-ࣿ]/;
const isArabicText = (s: string) => AR_RE.test(s ?? "");

// The category-chip row uses a FIXED height, never an onLayout measurement: a
// horizontal FlatList lays its content out asynchronously, so the first onLayout
// fires before the chips are measured and reports a too-small height — which the
// animated wrapper then clips to a thin strip. The gap ABOVE the chips lives on the
// search box (marginBottom) so it survives when the chips collapse on scroll-down —
// that leaves a small breathing gap under the search bar. CHIPS_TOTAL_H = chip + bottom gap.
const CHIP_H = 36;
const CHIPS_GAP = 12;
const CHIPS_TOTAL_H = CHIP_H + CHIPS_GAP;

type DisplayRow = { type: "normal" | "carousel"; title?: string; titleEn?: string; books: StoreBook[] };

// Split a flat list into rows of `size` (the default 2-per-row grid).
function chunk(list: StoreBook[], size: number): StoreBook[][] {
  const out: StoreBook[][] = [];
  const n = Math.max(1, size);
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}
// Build the catalog's display rows. With an owner layout and NO active search/filter,
// honour the arranged rows (map ids→books, drop missing) then append leftovers as
// normal pairs; otherwise fall back to a plain grid of the filtered books.
function buildCatalogRows(filtered: StoreBook[], all: StoreBook[], layout: LayoutRow[] | null, hasFilter: boolean, maxCols: number): DisplayRow[] {
  if (hasFilter || !layout || layout.length === 0) {
    return chunk(filtered, maxCols).map((books) => ({ type: "normal" as const, books }));
  }
  const byId = new Map(all.map((b) => [b.id, b]));
  // `placed` = every book that appears in ANY row (drives the leftover append below).
  // A book may now appear in MORE THAN ONE row (e.g. a normal row AND a carousel), so we
  // no longer skip a book just because it was already shown elsewhere — we only skip an
  // exact duplicate WITHIN the same row.
  const placed = new Set<number>();
  const rows: DisplayRow[] = [];
  for (const r of layout) {
    const cards: StoreBook[] = [];
    const rowSeen = new Set<number>();
    for (const id of r.books ?? []) {
      const b = byId.get(id);
      if (b && !rowSeen.has(id)) { rowSeen.add(id); placed.add(id); cards.push(b); }
    }
    if (cards.length) rows.push({ type: r.type === "carousel" ? "carousel" : "normal", title: r.title, titleEn: r.titleEn, books: cards });
  }
  const rest = all.filter((b) => !placed.has(b.id));
  for (const books of chunk(rest, maxCols)) rows.push({ type: "normal", books });
  return rows;
}

export default function StoreCatalogScreen() {
  const { token } = useAuth();
  const { colors, resolvedScheme, language, isRTL, direction } = usePreferences();
  const en = language === "en";
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const maxCols = 2; // phone & iPad both show ≤2 books per (normal) row
  const contentW = screenW - 32; // list has 16px horizontal padding each side
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("");

  const { data: books = [], isLoading, refetch } = useQuery({
    queryKey: storeBooksKey(),
    queryFn: () => listBooks(token),
    enabled: !!token,
  });
  const { data: cart } = useQuery({ queryKey: cartKey, queryFn: () => getCart(token), enabled: !!token });
  const { data: layoutData, refetch: refetchLayout } = useQuery({ queryKey: storeLayoutKey, queryFn: () => getStoreLayout(token), enabled: !!token });
  useRefetchOnFocus(refetch);
  useRefetchOnFocus(refetchLayout); // pick up an owner's freshly-saved layout on return
  const [refreshing, setRefreshing] = useState(false);
  async function onRefresh() {
    setRefreshing(true);
    try { await Promise.all([refetch(), refetchLayout()]); } finally { setRefreshing(false); }
  }

  const categories = useMemo(() => Array.from(new Set(books.map((b) => b.category).filter(Boolean))), [books]);
  const filtered = useMemo(
    () =>
      books.filter((b) => {
        const okCat = !category || b.category === category;
        const okSearch = !search.trim() || b.title.includes(search.trim());
        return okCat && okSearch;
      }),
    [books, category, search],
  );
  const cartCount = cart?.items.length ?? 0;
  const row = (e: boolean): "row" | "row-reverse" => (e ? "row" : "row-reverse");
  const hasFilter = Boolean(search.trim()) || Boolean(category);
  const rows = useMemo(
    () => buildCatalogRows(filtered, books, layoutData?.layout ?? null, hasFilter, maxCols),
    [filtered, books, layoutData, hasFilter, maxCols],
  );

  // Category chips: shown on open, hide when scrolling down, reveal on scroll up.
  const chipsAnim = useRef(new Animated.Value(1)).current;
  const lastY = useRef(0);
  const chipsShown = useRef(true);
  const chipsAnimating = useRef(false);
  const setChipsVisible = (visible: boolean) => {
    if (chipsShown.current === visible) return;
    chipsShown.current = visible;
    chipsAnimating.current = true;
    Animated.timing(chipsAnim, { toValue: visible ? 1 : 0, duration: 180, useNativeDriver: false }).start(() => {
      chipsAnimating.current = false;
    });
  };
  const onBooksScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const y = contentOffset.y;
    const maxY = contentSize.height - layoutMeasurement.height;
    // While the row is collapsing/expanding it resizes the list, so the scroll view
    // clamps its offset and fires synthetic events. Keep the anchor synced but don't
    // let those flip visibility (otherwise a collapse near the bottom re-reveals it).
    if (chipsAnimating.current) { lastY.current = y; return; }
    if (y <= 4) { setChipsVisible(true); lastY.current = y; return; } // at top → always shown
    if (y >= maxY - 4) { lastY.current = y; return; } // at/over bottom → ignore iOS bounce spring-back
    const dy = y - lastY.current;
    // Cumulative deadzone: advance the anchor ONLY when the ±8 threshold is crossed,
    // so slow deliberate scrolls accumulate instead of resetting to zero every frame.
    if (dy > 8) { setChipsVisible(false); lastY.current = y; } // scrolling down
    else if (dy < -8) { setChipsVisible(true); lastY.current = y; } // scrolling up
  };

  async function toggleFav(book: StoreBook) {
    if (!token) return;
    try {
      if (book.favorite) await removeWishlist(token, book.id);
      else await addWishlist(token, book.id);
      await Promise.all([qc.invalidateQueries({ queryKey: storeBooksKey() }), qc.invalidateQueries({ queryKey: wishlistKey })]);
    } catch {
      // ignore
    }
  }

  // In light mode surfaceSecondary (#EEF2FF) is almost identical to the page
  // background (#F0F4FF), so the search box / category chips / header buttons melt
  // into the background and their shapes disappear. Give them a solid (card-white)
  // fill + a visible border in light mode only; dark mode already reads fine.
  const isLight = resolvedScheme === "light";
  const controlBg = isLight ? colors.surface : colors.surfaceSecondary;
  const controlBorder = isLight ? "rgba(30,58,138,0.20)" : "transparent";

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { flexDirection: row(en), direction: "ltr" }]}>
        <Text style={[styles.title, { color: colors.text, textAlign: isRTL ? "right" : "left" }]}>
          {en ? "Store" : "المتجر"}
        </Text>
        <View style={{ flexDirection: row(en), gap: 10, direction: "ltr" }}>
          <Pressable onPress={() => router.push("/(tabs)/store/wishlist")} style={[styles.iconBtn, { backgroundColor: controlBg, borderWidth: 1, borderColor: controlBorder }]}>
            <Ionicons name="heart-outline" size={20} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => router.push("/(tabs)/store/orders")} style={[styles.iconBtn, { backgroundColor: controlBg, borderWidth: 1, borderColor: controlBorder }]}>
            <Feather name="package" size={19} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => router.push("/(tabs)/store/cart")} style={[styles.iconBtn, { backgroundColor: controlBg, borderWidth: 1, borderColor: controlBorder }]}>
            <Feather name="shopping-cart" size={19} color={colors.text} />
            {cartCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{formatNumber(cartCount)}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      {/* Search */}
      <View style={[styles.searchBox, { backgroundColor: controlBg, borderWidth: 1, borderColor: controlBorder, flexDirection: row(en), direction: "ltr" }]}>
        <Feather name="search" size={16} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}
          placeholder={en ? "Search books..." : "دوّر على كتاب..."}
          placeholderTextColor={colors.textTertiary}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Category chips — visible on open, hide on scroll-down, reveal on scroll-up */}
      {categories.length > 0 ? (
        <Animated.View
          style={{
            height: chipsAnim.interpolate({ inputRange: [0, 1], outputRange: [0, CHIPS_TOTAL_H] }),
            opacity: chipsAnim,
            overflow: "hidden",
          }}
        >
          <FlatList
            data={["", ...categories]}
            keyExtractor={(c) => c || "all"}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipBar}
            // flexGrow:1 makes the row fill the width so a few chips hug the reading side
            // (right in Arabic via row-reverse, left in English) instead of the scroll origin.
            contentContainerStyle={{ flexGrow: 1, gap: 8, paddingHorizontal: 20, flexDirection: row(en), alignItems: "center" }}
            renderItem={({ item }) => {
              const active = category === item;
              return (
                <Pressable
                  onPress={() => setCategory(item)}
                  style={[styles.chip, { backgroundColor: active ? COLORS.primary : controlBg, borderWidth: 1, borderColor: active ? "transparent" : controlBorder }]}
                >
                  <Text style={[styles.chipText, { color: active ? "#fff" : colors.textSecondary }]}>
                    {item || (en ? "All" : "الكل")}
                  </Text>
                </Pressable>
              );
            }}
          />
        </Animated.View>
      ) : null}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => `${i}:${r.type}:${r.books.map((b) => b.id).join("-")}`}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} colors={[COLORS.primary]} />}
          onScroll={onBooksScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingBottom: insets.bottom + 100 }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="book" size={44} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{en ? "No books" : "مفيش كتب"}</Text>
            </View>
          }
          renderItem={({ item: r }) => {
            // Pick the title in the device's language (fall back to the other side if empty),
            // then align by the shown text's OWN script — Arabic → right, English → left.
            // Aligning by content (like book titles do) keeps an Arabic title right-aligned no
            // matter which app language is active — see [[mobile-text-alignment-isrtl]].
            const headingText = en ? r.titleEn || r.title : r.title || r.titleEn;
            const headingAr = isArabicText(headingText ?? "");
            // PHYSICAL placement (repo pattern, see [[mobile-rtl-direction-ltr]]): a row with
            // direction:"ltr" makes flex-end the literal right edge on EVERY device state —
            // immune to I18nManager/native-RTL flag combos that can remap textAlign.
            const heading = headingText ? (
              <View style={{ flexDirection: "row", direction: "ltr", justifyContent: headingAr ? "flex-end" : "flex-start" }}>
                <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.text, textAlign: headingAr ? "right" : "left", writingDirection: headingAr ? "rtl" : "ltr" }]}>{headingText}</Text>
              </View>
            ) : null;
            if (r.type === "carousel") {
              const cardW = (contentW - 12) / 2; // 2 visible at a time
              return (
                <View>
                  {heading}
                  <CarouselRow
                    books={r.books}
                    cardW={cardW}
                    renderCard={(b) => (
                      <BookCard book={b} single={false} width={cardW} colors={colors} isDark={resolvedScheme === "dark"} en={en} isRTL={isRTL} onFav={() => toggleFav(b)} />
                    )}
                  />
                </View>
              );
            }
            const single = r.books.length === 1;
            const cols = Math.min(r.books.length, maxCols);
            const cardW = single ? contentW : (contentW - (cols - 1) * 12) / cols;
            return (
              <View>
                {heading}
                <View style={{ flexDirection: row(en), flexWrap: "wrap", gap: 12, direction: "ltr" }}>
                  {r.books.map((b, idx) => (
                    <BookCard key={`${b.id}-${idx}`} book={b} single={single} width={cardW} colors={colors} isDark={resolvedScheme === "dark"} en={en} isRTL={isRTL} onFav={() => toggleFav(b)} />
                  ))}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

function BookCard({
  book,
  single,
  width,
  colors,
  isDark,
  en,
  isRTL,
  onFav,
}: {
  book: StoreBook;
  single: boolean;
  width: number;
  colors: typeof COLORS.light;
  isDark: boolean;
  en: boolean;
  isRTL: boolean;
  onFav: () => void;
}) {
  const out = book.stockQuantity <= 0;
  const discounted = book.originalPriceEgp && book.originalPriceEgp > book.priceEgp;
  // A single-book row stretches full-width → landscape (16:9) art; a multi-book row
  // renders each as a grid card → portrait (3:4).
  const cover = pickBookCover(book, { landscape: single, dark: isDark });
  const aspectRatio = single ? 16 / 9 : 3 / 4;
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/(tabs)/store/book", params: { bookId: String(book.id) } })}
      style={[styles.card, { backgroundColor: colors.surface, width }]}
    >
      <View style={styles.coverWrap}>
        {cover ? (
          <Image source={{ uri: cover }} style={[styles.cover, { aspectRatio }]} resizeMode="cover" />
        ) : (
          <LinearGradient colors={[COLORS.primary + "22", COLORS.primary + "0A"]} style={[styles.cover, { aspectRatio }]}>
            <Feather name="book-open" size={30} color={COLORS.primary} />
          </LinearGradient>
        )}
        <Pressable onPress={onFav} hitSlop={8} style={[styles.favBtn, { backgroundColor: isDark ? "#0008" : "#fff" }]}>
          <Ionicons name={book.favorite ? "heart" : "heart-outline"} size={16} color={book.favorite ? COLORS.error : colors.textSecondary} />
        </Pressable>
        {out ? (
          <View style={styles.outBadge}>
            <Text style={styles.outText}>{en ? "Out of stock" : "نفدت"}</Text>
          </View>
        ) : book.stockQuantity <= 5 ? (
          <View style={[styles.outBadge, { backgroundColor: COLORS.warning }]}>
            <Text style={styles.outText}>{en ? `${book.stockQuantity} left` : `متبقّي ${formatNumber(book.stockQuantity)}`}</Text>
          </View>
        ) : null}
      </View>
      <View style={[styles.cardBody, { direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }]}>
        <Text
          numberOfLines={2}
          style={[
            styles.bookTitle,
            {
              color: colors.text,
              alignSelf: "stretch",
              textAlign: isArabicText(book.title) ? "right" : "left",
              writingDirection: isArabicText(book.title) ? "rtl" : "ltr",
            },
          ]}
        >
          {book.title}
        </Text>
        <View style={[styles.priceRow, { flexDirection: en ? "row" : "row-reverse", direction: "ltr" }]}>
          <Text style={[styles.price, { color: COLORS.primary }]}>{formatNumber(book.priceEgp)} {en ? "EGP" : "ج"}</Text>
          {discounted ? (
            <Text style={[styles.oldPrice, { color: colors.textTertiary }]}>{formatNumber(book.originalPriceEgp!)}</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

// A carousel row shows 2 books at a time, auto-advances one card every 3 seconds,
// and pauses while the student scrolls it — resuming 7s after they let go. Each advance
// is a slow 1-second glide, and the row loops SEAMLESSLY: the first two cards are cloned
// onto the end so it can glide past the last book into look-alikes, then snap back to the
// start instantly (invisibly) — no jarring scroll-all-the-way-back-to-the-first-book.
// Auto-rotating "متحرك" row. Rebuilt as a SEAMLESS conveyor: the books are rendered
// three times back-to-back and we keep the scroll offset inside the MIDDLE copy. Because
// every copy is identical, snapping by one whole copy-width is invisible — so the row
// drifts one card every 3s forever in a single direction and NEVER rewinds/jumps. Touch
// it and it scrolls freely (native); 5s after you let go it resumes drifting on its own.
const CAROUSEL_DRIFT = -1; // -1 = content moves left→right; flip to +1 for right→left
function CarouselRow({ books, cardW, renderCard }: { books: StoreBook[]; cardW: number; renderCard: (b: StoreBook) => React.ReactNode }) {
  const scrollRef = useRef<ScrollView>(null);
  const offset = useRef(0);   // last known scroll x
  const paused = useRef(false);
  const inited = useRef(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Each glide is driven by an Animated.Value → scrollTo(animated:false) so we control its
  // speed (ScrollView's own animated snap is a fixed, too-fast jump).
  const anim = useRef(new Animated.Value(0)).current;

  const GAP = 12;
  const step = cardW + GAP;
  const canLoop = books.length > 2;                 // 2 show at once → need >2 to rotate
  const data = canLoop ? Array.from({ length: 3 }, () => books).flat() : books;
  const copyWidth = books.length * step;            // width of one full set of books
  const startX = canLoop ? copyWidth : 0;           // start in the middle copy

  // Keep x inside the middle copy. Snapping a whole copyWidth is invisible (copies are
  // identical), so the loop is seamless — no rewind.
  const recenter = () => {
    if (!canLoop || copyWidth <= 0) return;
    let x = offset.current;
    while (x < copyWidth * 0.5) x += copyWidth;
    while (x >= copyWidth * 1.5) x -= copyWidth;
    if (x === offset.current) return;
    offset.current = x;
    anim.setValue(x);
    scrollRef.current?.scrollTo({ x, animated: false });
  };

  useEffect(() => {
    const id = anim.addListener(({ value }) => {
      offset.current = value;
      scrollRef.current?.scrollTo({ x: value, animated: false });
    });
    return () => anim.removeListener(id);
  }, [anim]);

  // Glide exactly one card every 3s, always the same direction, looping seamlessly.
  useEffect(() => {
    if (!canLoop) return;
    const t = setInterval(() => {
      if (paused.current) return;
      recenter();
      anim.setValue(offset.current);
      Animated.timing(anim, {
        toValue: offset.current + CAROUSEL_DRIFT * step,
        duration: 850,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false, // value is read in JS to scroll, so no native driver
      }).start(({ finished }) => { if (finished) recenter(); });
    }, 3000);
    return () => { clearInterval(t); anim.stopAnimation(); };
  }, [canLoop, step, copyWidth]);

  useEffect(() => () => { if (resumeTimer.current) clearTimeout(resumeTimer.current); }, []);

  const pauseAuto = () => {
    paused.current = true;
    anim.stopAnimation();
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  };
  // After the finger lifts, wait 5s of stillness then let it drift on its own again.
  const scheduleResume = () => {
    recenter();
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => { paused.current = false; }, 5000);
  };

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      scrollEventThrottle={16}
      contentContainerStyle={{ gap: GAP }}
      onContentSizeChange={(w) => {
        if (!inited.current && canLoop && w >= startX) {
          inited.current = true;
          offset.current = startX;
          scrollRef.current?.scrollTo({ x: startX, animated: false });
        }
      }}
      onScroll={(e) => { offset.current = e.nativeEvent.contentOffset.x; }}
      onScrollBeginDrag={pauseAuto}
      onScrollEndDrag={scheduleResume}
      onMomentumScrollEnd={scheduleResume}
    >
      {data.map((b, i) => (
        <View key={`${b.id}-${i}`} style={{ width: cardW }}>{renderCard(b)}</View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingVertical: 12, alignItems: "center", justifyContent: "space-between" },
  title: { ...FONT.bold, fontSize: 24 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: COLORS.error, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  badgeText: { ...FONT.bold, fontSize: 9, color: "#fff" },
  searchBox: { marginHorizontal: 20, marginBottom: CHIPS_GAP, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, alignItems: "center", gap: 8 },
  searchInput: { flex: 1, ...FONT.regular, fontSize: 14 },
  chipBar: { height: CHIP_H, marginBottom: CHIPS_GAP, flexGrow: 0, direction: "ltr" },
  chip: { height: CHIP_H, borderRadius: 20, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  chipText: { ...FONT.semiBold, fontSize: 13 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 50, gap: 12, minHeight: 200 },
  emptyText: { ...FONT.regular, fontSize: 15 },
  rowTitle: { ...FONT.bold, fontSize: 16, marginBottom: 8, marginTop: 2 },
  card: { borderRadius: 18, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  coverWrap: { position: "relative" },
  cover: { width: "100%", alignItems: "center", justifyContent: "center" },
  favBtn: { position: "absolute", top: 8, left: 8, width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  outBadge: { position: "absolute", bottom: 8, right: 8, backgroundColor: COLORS.error, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  outText: { ...FONT.bold, fontSize: 10, color: "#fff" },
  cardBody: { padding: 12, gap: 4 },
  bookTitle: { ...FONT.bold, fontSize: 14 },
  bookAuthor: { ...FONT.regular, fontSize: 12 },
  priceRow: { alignItems: "center", gap: 8, marginTop: 4 },
  price: { ...FONT.bold, fontSize: 15 },
  oldPrice: { ...FONT.regular, fontSize: 12, textDecorationLine: "line-through" },
});
