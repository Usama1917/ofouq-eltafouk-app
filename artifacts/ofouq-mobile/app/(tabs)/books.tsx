import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";

import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { formatNumber, toEnglishDigits } from "@/lib/format";

const CATEGORIES = ["الكل", "رياضيات", "علوم", "لغة عربية", "تاريخ", "جغرافيا", "فيزياء"];

const BOOKS = [
  { id: 1, title: "الرياضيات المتقدمة", author: "أ. أحمد محمد", category: "رياضيات", points: 250, pages: 320, rating: 4.8, reviews: 124, owned: false },
  { id: 2, title: "الفيزياء العامة", author: "أ. سارة خالد", category: "فيزياء", points: 200, pages: 280, rating: 4.6, reviews: 98, owned: true },
  { id: 3, title: "قواعد اللغة العربية", author: "د. منى حسن", category: "لغة عربية", points: 180, pages: 240, rating: 4.9, reviews: 210, owned: false },
  { id: 4, title: "العلوم التطبيقية", author: "أ. كريم علي", category: "علوم", points: 220, pages: 300, rating: 4.7, reviews: 156, owned: false },
  { id: 5, title: "التاريخ الإسلامي", author: "د. فاطمة عمر", category: "تاريخ", points: 160, pages: 200, rating: 4.5, reviews: 87, owned: false },
  { id: 6, title: "الكيمياء العضوية", author: "أ. يوسف إبراهيم", category: "علوم", points: 240, pages: 350, rating: 4.7, reviews: 132, owned: true },
];

const categoryColors: Record<string, string> = {
  رياضيات: "#3B82F6",
  علوم: "#10B981",
  "لغة عربية": "#8B5CF6",
  تاريخ: "#F59E0B",
  جغرافيا: "#06B6D4",
  فيزياء: "#EF4444",
};

interface BookCardProps {
  book: (typeof BOOKS)[0];
  onPress: () => void;
}

function BookCard({ book, onPress }: BookCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;
  const scale = useRef(new Animated.Value(1)).current;
  const catColor = categoryColors[book.category] ?? COLORS.primary;

  return (
    <Pressable
      onPressIn={() => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()}
      onPress={onPress}
    >
      <Animated.View style={[styles.bookCard, { backgroundColor: colors.surface, transform: [{ scale }] }]}>
        <LinearGradient
          colors={[catColor + "33", catColor + "11"]}
          style={styles.bookCover}
        >
          <Feather name="book-open" size={32} color={catColor} />
          {book.owned && (
            <View style={styles.ownedBadge}>
              <Feather name="check-circle" size={12} color="#fff" />
            </View>
          )}
        </LinearGradient>

        <View style={styles.bookInfo}>
          <View style={[styles.categoryBadge, { backgroundColor: catColor + "22" }]}>
            <Text style={[styles.categoryText, { color: catColor }]}>{book.category}</Text>
          </View>
          <Text style={[styles.bookTitle, { color: colors.text }]} numberOfLines={2}>{book.title}</Text>
          <Text style={[styles.bookAuthor, { color: colors.textSecondary }]}>{book.author}</Text>

          <View style={styles.bookFooter}>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={13} color="#F59E0B" />
              <Text style={[styles.ratingText, { color: colors.textSecondary }]}>{toEnglishDigits(book.rating)}</Text>
            </View>
            {book.owned ? (
              <View style={[styles.ownedTag, { backgroundColor: COLORS.success + "22" }]}>
                <Text style={[styles.ownedTagText, { color: COLORS.success }]}>مملوك</Text>
              </View>
            ) : (
              <View style={styles.priceTag}>
                <Ionicons name="star" size={11} color="#F59E0B" />
                <Text style={styles.priceText}>{formatNumber(book.points)}</Text>
              </View>
            )}
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export default function BooksScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;
  const { user } = useAuth();

  const [selectedCategory, setSelectedCategory] = useState("الكل");
  const [search, setSearch] = useState("");

  const filtered = BOOKS.filter((b) => {
    const matchCat = selectedCategory === "الكل" || b.category === selectedCategory;
    const matchSearch = !search || b.title.includes(search) || b.author.includes(search);
    return matchCat && matchSearch;
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.headerBar, { backgroundColor: colors.surface }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>مكتبة الكتب</Text>
        <View style={[styles.searchBox, { backgroundColor: colors.surfaceSecondary }]}>
          <Feather name="search" size={16} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="ابحث عن كتاب..."
            placeholderTextColor={colors.textTertiary}
            value={search}
            onChangeText={setSearch}
            textAlign="right"
          />
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(i) => String(i.id)}
        contentInsetAdjustmentBehavior="automatic"
        numColumns={2}
        columnWrapperStyle={styles.row}
        ListHeaderComponent={
          <View>
            <FlatList
              data={CATEGORIES}
              keyExtractor={(c) => c}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoryBar}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.catChip,
                    selectedCategory === item && { backgroundColor: COLORS.primary },
                    selectedCategory !== item && { backgroundColor: colors.surfaceSecondary },
                  ]}
                  onPress={() => setSelectedCategory(item)}
                >
                  <Text style={[
                    styles.catChipText,
                    { color: selectedCategory === item ? "#fff" : colors.textSecondary },
                  ]}>
                    {item}
                  </Text>
                </Pressable>
              )}
            />
            <View style={styles.resultsRow}>
              <Text style={[styles.resultsText, { color: colors.textSecondary }]}>
                {formatNumber(filtered.length)} كتاب
              </Text>
              <View style={styles.pointsIndicator}>
                <Ionicons name="star" size={13} color="#F59E0B" />
                <Text style={styles.userPoints}>{formatNumber(user?.points ?? 0)} نقطة</Text>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="book" size={48} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>لا توجد كتب</Text>
          </View>
        }
        renderItem={({ item }) => (
          <BookCard book={item} onPress={() => {}} />
        )}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBar: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, gap: 10 },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, textAlign: "right" },
  searchBox: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, gap: 8 },
  searchInput: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 14 },
  categoryBar: { paddingHorizontal: 20, paddingVertical: 8 },
  catChip: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginLeft: 8 },
  catChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 13 },
  resultsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 8 },
  resultsText: { fontFamily: "Cairo_400Regular", fontSize: 13 },
  pointsIndicator: { flexDirection: "row", alignItems: "center", gap: 4 },
  userPoints: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: COLORS.accent },
  list: { paddingHorizontal: 12, paddingBottom: 100 },
  row: { justifyContent: "space-between", marginBottom: 12 },
  bookCard: { width: "48%", borderRadius: 18, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 },
  bookCover: { height: 110, alignItems: "center", justifyContent: "center" },
  ownedBadge: { position: "absolute", top: 8, left: 8, backgroundColor: COLORS.success, borderRadius: 10, padding: 3 },
  bookInfo: { padding: 12, gap: 5 },
  categoryBadge: { alignSelf: "flex-end", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  categoryText: { fontFamily: "Cairo_600SemiBold", fontSize: 10 },
  bookTitle: { fontFamily: "Cairo_700Bold", fontSize: 13, textAlign: "right" },
  bookAuthor: { fontFamily: "Cairo_400Regular", fontSize: 11, textAlign: "right" },
  bookFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  ratingText: { fontFamily: "Cairo_400Regular", fontSize: 12 },
  priceTag: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#F59E0B22", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  priceText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: COLORS.accent },
  ownedTag: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  ownedTagText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  empty: { alignItems: "center", justifyContent: "center", padding: 60, gap: 16 },
  emptyText: { fontFamily: "Cairo_400Regular", fontSize: 16 },
});
