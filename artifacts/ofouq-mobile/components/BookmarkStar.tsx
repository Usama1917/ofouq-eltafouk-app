import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { Pressable, StyleProp, ViewStyle } from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { addBookmark, bookmarksQueryKey, fetchBookmarks, removeBookmark } from "@/lib/engagement";

// v2 Phase 4 — the ⭐ save toggle. Reads the shared bookmarks list from cache so every
// star (lesson screen + list cards) reflects the same state, and refreshes it on toggle.
export function BookmarkStar({ lessonId, size = 22, style }: { lessonId: number; size?: number; style?: StyleProp<ViewStyle> }) {
  const { token } = useAuth();
  const { colors } = usePreferences();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: bookmarksQueryKey,
    queryFn: () => fetchBookmarks(token),
    enabled: !!token,
    staleTime: 30_000,
  });
  const bookmarked = !!data?.bookmarks?.some((b) => b.lessonId === lessonId);

  const toggle = async () => {
    if (busy || !token) return;
    setBusy(true);
    try {
      if (bookmarked) await removeBookmark(token, lessonId);
      else await addBookmark(token, lessonId);
      await qc.invalidateQueries({ queryKey: bookmarksQueryKey });
    } catch {
      // ignore — the star just won't flip
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable onPress={toggle} hitSlop={10} disabled={busy} style={style} accessibilityRole="button">
      <Ionicons name={bookmarked ? "star" : "star-outline"} size={size} color={bookmarked ? "#F59E0B" : colors.textTertiary} />
    </Pressable>
  );
}
