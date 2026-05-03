import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { getBaseUrl } from "@/constants/api";
import { useAuth } from "@/contexts/AuthContext";
import { toEnglishDigits } from "@/lib/format";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const SUGGESTIONS = [
  "اشرح لي قانون نيوتن الثاني",
  "ما هي أسهل طريقة لحفظ المعادلات؟",
  "ساعدني في حل مسألة رياضيات",
  "اقترح خطة مذاكرة أسبوعية",
];

const INITIAL_MSG: Message = {
  id: "0",
  role: "assistant",
  content: "مرحباً! أنا مساعدك الذكي في منصة أفق التفوق. كيف يمكنني مساعدتك في رحلتك التعليمية اليوم؟",
  timestamp: new Date(),
};

function formatTime(d: Date) {
  return toEnglishDigits(d.toLocaleTimeString("ar-EG-u-nu-latn", { hour: "2-digit", minute: "2-digit" }));
}

interface BubbleProps {
  message: Message;
  isDark: boolean;
}

function Bubble({ message, isDark }: BubbleProps) {
  const colors = isDark ? COLORS.dark : COLORS.light;
  const isUser = message.role === "user";

  return (
    <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
      {!isUser && (
        <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.avatarGrad}>
          <Ionicons name="sparkles" size={14} color="#fff" />
        </LinearGradient>
      )}
      <View
        style={[
          styles.bubble,
          isUser
            ? [styles.bubbleUser, { backgroundColor: COLORS.primary }]
            : [styles.bubbleAssistant, { backgroundColor: colors.surface }],
        ]}
      >
        <Text
          style={[
            styles.bubbleText,
            { color: isUser ? "#fff" : colors.text },
          ]}
        >
          {message.content}
        </Text>
        <Text
          style={[
            styles.bubbleTime,
            { color: isUser ? "rgba(255,255,255,0.6)" : colors.textTertiary },
          ]}
        >
          {formatTime(message.timestamp)}
        </Text>
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();

  const [messages, setMessages] = useState<Message[]>([INITIAL_MSG]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const sendMessage = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || isLoading) return;
    setInput("");

    const userMsg: Message = {
      id: String(Date.now()),
      role: "user",
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const base = getBaseUrl();
      const res = await fetch(`${base}/api/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: content }),
      });

      let replyContent = "";
      if (res.ok) {
        const data = await res.json();
        replyContent = data.reply ?? data.message ?? "حدث خطأ في الرد.";
      } else {
        replyContent = "عذراً، حدث خطأ في الاتصال. يرجى المحاولة مجدداً.";
      }

      const assistantMsg: Message = {
        id: String(Date.now() + 1),
        role: "assistant",
        content: replyContent,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          role: "assistant",
          content: "عذراً، تعذّر الاتصال بالخادم. يرجى التحقق من الاتصال بالإنترنت.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, token]);

  const showSuggestions = messages.length <= 1;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={["#1D4ED8", "#1E3A8A"]} style={styles.header}>
        <View style={styles.headerContent}>
          <LinearGradient colors={["rgba(255,255,255,0.25)", "rgba(255,255,255,0.1)"]} style={styles.aiAvatar}>
            <Ionicons name="sparkles" size={24} color="#fff" />
          </LinearGradient>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>المساعد الذكي</Text>
            <View style={styles.onlineRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>متاح الآن</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentInsetAdjustmentBehavior="automatic"
          renderItem={({ item }) => <Bubble message={item} isDark={isDark} />}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          contentContainerStyle={[styles.messageList, { paddingBottom: 12 }]}
          ListFooterComponent={
            <>
              {isLoading && (
                <View style={[styles.bubbleRow, styles.bubbleRowAssistant]}>
                  <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.avatarGrad}>
                    <Ionicons name="sparkles" size={14} color="#fff" />
                  </LinearGradient>
                  <View style={[styles.bubble, styles.bubbleAssistant, { backgroundColor: colors.surface }]}>
                    <View style={styles.typingRow}>
                      <ActivityIndicator size="small" color={COLORS.primary} />
                      <Text style={[styles.typingText, { color: colors.textSecondary }]}>يكتب...</Text>
                    </View>
                  </View>
                </View>
              )}
            </>
          }
        />

        {showSuggestions && (
          <View style={styles.suggestions}>
            <Text style={[styles.suggestLabel, { color: colors.textSecondary }]}>اقتراحات للبدء:</Text>
            <View style={styles.suggestRow}>
              {SUGGESTIONS.slice(0, 2).map((s) => (
                <Pressable
                  key={s}
                  style={[styles.suggestChip, { backgroundColor: colors.surface }]}
                  onPress={() => sendMessage(s)}
                >
                  <Text style={[styles.suggestText, { color: colors.text }]} numberOfLines={2}>{s}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.suggestRow}>
              {SUGGESTIONS.slice(2).map((s) => (
                <Pressable
                  key={s}
                  style={[styles.suggestChip, { backgroundColor: colors.surface }]}
                  onPress={() => sendMessage(s)}
                >
                  <Text style={[styles.suggestText, { color: colors.text }]} numberOfLines={2}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <View style={[styles.inputBar, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 8 }]}>
          <Pressable
            style={[styles.sendBtn, { backgroundColor: input.trim() ? COLORS.primary : colors.surfaceSecondary }]}
            onPress={() => sendMessage()}
            disabled={!input.trim() || isLoading}
          >
            <Feather name="arrow-up" size={20} color={input.trim() ? "#fff" : colors.textTertiary} />
          </Pressable>
          <TextInput
            style={[styles.inputField, { color: colors.text, backgroundColor: colors.surfaceSecondary }]}
            placeholder="اكتب سؤالك هنا..."
            placeholderTextColor={colors.textTertiary}
            value={input}
            onChangeText={setInput}
            multiline
            textAlign="right"
            returnKeyType="send"
            onSubmitEditing={() => sendMessage()}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  headerContent: { flexDirection: "row", alignItems: "center", gap: 12, justifyContent: "flex-end" },
  aiAvatar: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  headerText: { alignItems: "flex-end" },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#fff" },
  onlineRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#34D399" },
  onlineText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.75)" },
  messageList: { paddingHorizontal: 16, paddingTop: 12 },
  bubbleRow: { flexDirection: "row", marginBottom: 10, alignItems: "flex-end", gap: 8 },
  bubbleRowUser: { justifyContent: "flex-start" },
  bubbleRowAssistant: { justifyContent: "flex-end" },
  avatarGrad: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  bubble: { maxWidth: "78%", borderRadius: 18, padding: 12 },
  bubbleUser: { borderBottomLeftRadius: 4 },
  bubbleAssistant: { borderBottomRightRadius: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  bubbleText: { fontFamily: "Cairo_400Regular", fontSize: 15, lineHeight: 24, textAlign: "right" },
  bubbleTime: { fontFamily: "Cairo_400Regular", fontSize: 10, textAlign: "left", marginTop: 4 },
  typingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  typingText: { fontFamily: "Cairo_400Regular", fontSize: 13 },
  suggestions: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  suggestLabel: { fontFamily: "Cairo_400Regular", fontSize: 12, textAlign: "right" },
  suggestRow: { flexDirection: "row", gap: 8 },
  suggestChip: { flex: 1, borderRadius: 12, padding: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  suggestText: { fontFamily: "Cairo_400Regular", fontSize: 12, textAlign: "right" },
  inputBar: { paddingHorizontal: 12, paddingTop: 10, flexDirection: "row", alignItems: "flex-end", gap: 8 },
  inputField: { flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontFamily: "Cairo_400Regular", fontSize: 15, maxHeight: 100 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
});
