import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { apiFetch } from "@/lib/api";
import { toEnglishDigits } from "@/lib/format";

type SupportMessage = {
  id: number;
  conversationId: number;
  senderId?: number | null;
  senderRole: "user" | "admin" | string;
  body: string;
  createdAt: string;
};

type SupportConversationResponse = {
  conversation: {
    id: number;
    status: string;
    lastMessageAt: string;
  } | null;
  messages: SupportMessage[];
};

const QUICK_QUESTIONS_AR = [
  "لدي مشكلة في مشاهدة الدرس",
  "لم يصلني رد على طلب الاشتراك",
  "أريد تعديل بيانات حسابي",
  "لدي مشكلة في رفع صورة الكود",
];

const QUICK_QUESTIONS_EN = [
  "I have a problem watching a lesson",
  "I did not receive a subscription request reply",
  "I want to update my account details",
  "I have a problem uploading the code image",
];

const TAB_BAR_CLEARANCE = Platform.OS === "ios" ? 86 : 74;

export default function SupportChatScreen() {
  const {
    colors,
    resolvedScheme,
    strings,
    language,
    isRTL,
    textAlign,
    direction,
    rowDirection,
    alignStart,
  } = usePreferences();
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const quickQuestions = language === "ar" ? QUICK_QUESTIONS_AR : QUICK_QUESTIONS_EN;

  const queryKey = ["support", "me", token] as const;
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<SupportConversationResponse>({
    queryKey,
    queryFn: () => apiFetch("/api/support/me", { token }),
    enabled: Boolean(user && token),
    refetchInterval: 6000,
  });

  const messages = data?.messages ?? [];

  useEffect(() => {
    const timeout = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(timeout);
  }, [messages.length]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, () => setIsKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setIsKeyboardVisible(false));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  async function sendSupportMessage(rawBody: string) {
    if (!token) {
      router.push("/login");
      return;
    }

    const body = rawBody.trim();
    if (!body || sending) return;

    setSending(true);
    setMessage("");
    try {
      await apiFetch("/api/support/me/messages", {
        method: "POST",
        token,
        body: JSON.stringify({ body }),
      });
      await queryClient.invalidateQueries({ queryKey });
      await refetch();
    } catch (err) {
      setMessage(body);
      Alert.alert(
        strings.auth.errorTitle,
        err instanceof Error ? err.message : strings.common.unexpectedError,
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <LinearGradient
        colors={
          resolvedScheme === "dark"
            ? ["#0A0F1E", "#111827", "#0F172A"]
            : ["#EEF5FF", "#F8FBFF", "#F5F2FF"]
        }
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.pageBackWrap, { top: insets.top + 12 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.pageBackButton,
            {
              backgroundColor: pressed ? colors.surfaceSecondary : colors.card,
              borderColor: colors.border,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={strings.common.back}
        >
          <Feather name={isRTL ? "arrow-left" : "arrow-right"} size={18} color={colors.textSecondary} />
          <Text style={[styles.pageBackText, { color: colors.text, writingDirection: direction }]}>
            {strings.common.back}
          </Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        <View
          style={[
            styles.header,
            {
              paddingTop: insets.top + 74,
              paddingHorizontal: 18,
              flexDirection: rowDirection,
              direction,
            },
          ]}
        >
          <View style={styles.headerIcon}>
            <Feather name="headphones" size={24} color={COLORS.primary} />
          </View>
          <View style={[styles.headerTextBlock, { alignItems: alignStart }]}>
            <Text style={[styles.title, { color: colors.text, textAlign, writingDirection: direction }]}>
              {strings.settings.supportChatTitle}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
              {strings.settings.supportChatSubtitle}
            </Text>
          </View>
        </View>

        {!user || !token ? (
          <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="lock" size={26} color={COLORS.primary} />
            <Text style={[styles.stateTitle, { color: colors.text, writingDirection: direction }]}>
              {strings.settings.supportLoginRequired}
            </Text>
            <Pressable style={styles.primaryButton} onPress={() => router.push("/login")}>
              <Text style={[styles.primaryButtonText, { writingDirection: direction }]}>
                {strings.common.signIn}
              </Text>
            </Pressable>
          </View>
        ) : isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : isError ? (
          <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="alert-circle" size={26} color={COLORS.error} />
            <Text style={[styles.stateTitle, { color: colors.text, writingDirection: direction }]}>
              {strings.settings.supportLoadError}
            </Text>
            <Text style={[styles.stateText, { color: colors.textSecondary, writingDirection: direction }]}>
              {error instanceof Error ? error.message : strings.common.unexpectedError}
            </Text>
            <Pressable style={styles.primaryButton} onPress={() => void refetch()} disabled={isFetching}>
              <Text style={[styles.primaryButtonText, { writingDirection: direction }]}>
                {isFetching ? strings.common.retrying : strings.common.retry}
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <ScrollView
              ref={scrollRef}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingHorizontal: 18,
                paddingTop: 12,
                paddingBottom: 18,
                gap: 10,
              }}
            >
              {messages.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Feather name="message-circle" size={28} color={COLORS.primary} />
                  <Text style={[styles.stateTitle, { color: colors.text, writingDirection: direction }]}>
                    {strings.settings.supportEmptyTitle}
                  </Text>
                  <Text style={[styles.stateText, { color: colors.textSecondary, writingDirection: direction }]}>
                    {strings.settings.supportEmptyText}
                  </Text>
                </View>
              ) : null}

              {messages.map((item) => {
                const isUserMessage = item.senderRole === "user";
                return (
                  <View
                    key={item.id}
                    style={[
                      styles.messageRow,
                      { alignItems: isUserMessage ? "flex-start" : "flex-end" },
                    ]}
                  >
                    <View
                      style={[
                        styles.messageBubble,
                        {
                          backgroundColor: isUserMessage ? COLORS.primary : colors.card,
                          borderColor: isUserMessage ? COLORS.primary : colors.border,
                          borderBottomRightRadius: isUserMessage ? 6 : 18,
                          borderBottomLeftRadius: isUserMessage ? 18 : 6,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.messageText,
                          {
                            color: isUserMessage ? "#fff" : colors.text,
                            textAlign,
                            writingDirection: direction,
                          },
                        ]}
                      >
                        {toEnglishDigits(item.body)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <View style={[styles.quickWrap, { borderTopColor: colors.border }]}>
              <Text style={[styles.quickTitle, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                {strings.settings.supportQuickQuestions}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickList}>
                {quickQuestions.map((question) => (
                  <Pressable
                    key={question}
                    onPress={() => void sendSupportMessage(question)}
                    disabled={sending}
                    style={({ pressed }) => [
                      styles.quickChip,
                      {
                        backgroundColor: pressed ? colors.surfaceSecondary : colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.quickChipText, { color: colors.text, writingDirection: direction }]}>
                      {toEnglishDigits(question)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View
              style={[
                styles.composer,
                {
                  paddingBottom: insets.bottom + (isKeyboardVisible ? 10 : TAB_BAR_CLEARANCE),
                  backgroundColor: colors.background,
                  borderTopColor: colors.border,
                  flexDirection: rowDirection,
                  direction,
                },
              ]}
            >
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder={strings.settings.supportInputPlaceholder}
                placeholderTextColor={colors.textTertiary}
                multiline
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    textAlign,
                    writingDirection: direction,
                  },
                ]}
              />
              <Pressable
                onPress={() => void sendSupportMessage(message)}
                disabled={sending || message.trim().length === 0}
                style={({ pressed }) => [
                  styles.sendButton,
                  { opacity: pressed || sending || message.trim().length === 0 ? 0.66 : 1 },
                ]}
              >
                {sending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Feather name="send" size={18} color="#fff" />
                )}
              </Pressable>
            </View>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  pageBackWrap: {
    position: "absolute",
    left: 18,
    zIndex: 20,
  },
  pageBackButton: {
    minHeight: 40,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 13,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 7,
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  pageBackText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    lineHeight: 22,
  },
  header: {
    alignItems: "center",
    gap: 13,
    paddingBottom: 12,
  },
  headerIcon: {
    width: 56,
    height: 56,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary + "12",
  },
  headerTextBlock: { flex: 1, alignItems: "flex-end", justifyContent: "center" },
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 25,
    lineHeight: 36,
    textAlign: "right",
  },
  subtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    lineHeight: 22,
    textAlign: "right",
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stateCard: {
    margin: 18,
    borderRadius: 26,
    borderWidth: 1,
    padding: 22,
    alignItems: "center",
    gap: 12,
  },
  emptyCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  stateTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    textAlign: "center",
  },
  stateText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    lineHeight: 22,
    textAlign: "center",
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 16,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  primaryButtonText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: "#fff",
  },
  messageRow: {
    width: "100%",
  },
  messageBubble: {
    maxWidth: "82%",
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  messageText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
    lineHeight: 24,
  },
  quickWrap: {
    borderTopWidth: 1,
    paddingTop: 10,
    paddingBottom: 8,
  },
  quickTitle: {
    width: "100%",
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  quickList: {
    paddingHorizontal: 18,
    gap: 8,
  },
  quickChip: {
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  quickChipText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
  },
  composer: {
    borderTopWidth: 1,
    paddingTop: 10,
    paddingHorizontal: 12,
    alignItems: "flex-end",
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 110,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
});
