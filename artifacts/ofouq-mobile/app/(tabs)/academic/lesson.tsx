import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { Video, ResizeMode } from "expo-av";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { getBaseUrl } from "@/constants/api";

const SCREEN_WIDTH = Dimensions.get("window").width;

interface Lesson {
  id: number;
  title: string;
  description: string;
  video?: {
    id: number;
    title: string;
    videoUrl: string;
    thumbnailUrl?: string;
    duration: number;
    instructor: string;
    videoType: "youtube" | "upload";
  } | null;
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

function getYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^&?/\s]{11})/);
  return match ? match[1] : null;
}

export default function LessonDetailScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const videoRef = useRef<Video>(null);
  const { lessonId, lessonTitle } = useLocalSearchParams<{ lessonId: string; lessonTitle: string }>();

  useEffect(() => {
    navigation.setOptions({ title: String(lessonTitle ?? "الدرس") });
  }, [lessonTitle, navigation]);

  const { data: lesson, isLoading } = useQuery<Lesson>({
    queryKey: ["academic", "lesson", lessonId],
    queryFn: () => apiFetch(`/api/academic/lessons/${lessonId}`),
    enabled: !!lessonId,
  });

  const youTubeId = lesson?.video?.videoType === "youtube" && lesson.video?.videoUrl
    ? getYouTubeId(lesson.video.videoUrl)
    : null;

  const openYouTubeVideo = async () => {
    const url = lesson?.video?.videoUrl;
    if (!url) return;
    await WebBrowser.openBrowserAsync(url);
  };

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
    >
      {lesson?.video ? (
        youTubeId ? (
          <View style={[styles.youtubeCard, { backgroundColor: colors.surfaceSecondary }]}> 
            <Ionicons name="logo-youtube" size={44} color="#ff0000" />
            <Text style={[styles.youtubeText, { color: colors.text }]}>هذا الدرس من YouTube</Text>
            <Pressable style={styles.youtubeButton} onPress={openYouTubeVideo}>
              <Text style={styles.youtubeButtonText}>فتح الفيديو</Text>
            </Pressable>
          </View>
        ) : (
          <Video
            ref={videoRef}
            source={{ uri: lesson.video.videoUrl }}
            style={styles.videoPlayer}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            isLooping={false}
            posterSource={lesson.video.thumbnailUrl ? { uri: lesson.video.thumbnailUrl } : undefined}
            usePoster={!!lesson.video.thumbnailUrl}
          />
        )
      ) : (
        <View style={[styles.noVideoPlaceholder, { backgroundColor: colors.surfaceSecondary }]}> 
          <Ionicons name="play-circle-outline" size={60} color={colors.textTertiary} />
          <Text style={[styles.noVideoText, { color: colors.textSecondary }]}>لا يوجد فيديو لهذا الدرس بعد</Text>
        </View>
      )}

      <View style={styles.content}>
        <Text style={[styles.lessonTitle, { color: colors.text }]}>{lesson?.title ?? lessonTitle}</Text>

        {lesson?.description ? (
          <Text style={[styles.lessonDesc, { color: colors.textSecondary }]}>{lesson.description}</Text>
        ) : null}

        {lesson?.video && (
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <View style={styles.infoRow}>
              <Ionicons name="person-circle-outline" size={18} color={COLORS.primary} />
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>المعلم:</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{lesson.video.instructor}</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={18} color={COLORS.primary} />
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>المدة:</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{lesson.video.duration} دقيقة</Text>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  videoPlayer: {
    width: SCREEN_WIDTH,
    height: (SCREEN_WIDTH * 9) / 16,
    backgroundColor: "#000",
  },
  noVideoPlaceholder: {
    width: SCREEN_WIDTH,
    height: (SCREEN_WIDTH * 9) / 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  youtubeCard: {
    width: SCREEN_WIDTH,
    height: (SCREEN_WIDTH * 9) / 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 20,
  },
  youtubeText: { fontFamily: "Cairo_700Bold", fontSize: 16 },
  youtubeButton: {
    backgroundColor: "#ff0000",
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
  },
  youtubeButtonText: { color: "#fff", fontFamily: "Cairo_700Bold", fontSize: 14 },
  noVideoText: { fontFamily: "Cairo_400Regular", fontSize: 15 },
  content: { padding: 20, gap: 12 },
  lessonTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, textAlign: "right" },
  lessonDesc: { fontFamily: "Cairo_400Regular", fontSize: 14, textAlign: "right", lineHeight: 24 },
  infoCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10, marginTop: 4 },
  infoRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  infoLabel: { fontFamily: "Cairo_400Regular", fontSize: 13 },
  infoValue: { fontFamily: "Cairo_700Bold", fontSize: 14, flex: 1, textAlign: "right" },
});
