import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextStyle,
  View,
} from "react-native";
import { FONT } from "@/constants/typography";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { apiFetch } from "@/lib/api";
import { toEnglishDigits } from "@/lib/format";
import { notificationsQueryKey } from "@/lib/notifications";

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

type ChatMessageColors = {
  border: string;
  card: string;
  text: string;
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
const RTL_STRONG_CHAR_RE = /[\u0590-\u08FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;
const LTR_STRONG_CHAR_RE = /[A-Za-z]/;

function getTextFlow(value: string, fallbackDirection: "rtl" | "ltr") {
  for (const char of value) {
    if (RTL_STRONG_CHAR_RE.test(char)) {
      return {
        textAlign: "right" as TextStyle["textAlign"],
        writingDirection: "rtl" as TextStyle["writingDirection"],
      };
    }
    if (LTR_STRONG_CHAR_RE.test(char)) {
      return {
        textAlign: "left" as TextStyle["textAlign"],
        writingDirection: "ltr" as TextStyle["writingDirection"],
      };
    }
  }

  return {
    textAlign: fallbackDirection === "rtl" ? "right" : "left" as TextStyle["textAlign"],
    writingDirection: fallbackDirection as TextStyle["writingDirection"],
  };
}

function renderSupportMessageBody(value: string) {
  return value.split("\n").map((line, index) => {
    const subjectMatch = line.match(/^(بخصوص طلب الإشتراك الخاص بكم لمادة )(.*)$/);
    const codeMatch = line.match(/^(بكود )(.*)$/);
    const match = subjectMatch || codeMatch;

    return (
      <React.Fragment key={`${index}-${line}`}>
        {index > 0 ? "\n" : null}
        {match ? (
          <>
            {match[1]}
            <Text style={styles.messageStrongText}>{match[2]}</Text>
          </>
        ) : (
          line
        )}
      </React.Fragment>
    );
  });
}

function AnimatedSupportMessage({
  item,
  colors,
  direction,
}: {
  item: SupportMessage;
  colors: ChatMessageColors;
  direction: "rtl" | "ltr";
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const isUserMessage = item.senderRole === "user";
  const displayBody = toEnglishDigits(item.body);
  const messageTextFlow = getTextFlow(displayBody, direction);

  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: isUserMessage ? 260 : 340,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [isUserMessage, progress]);

  const animatedStyle = {
    opacity: progress,
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [isUserMessage ? 16 : 10, 0],
        }),
      },
      {
        scale: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [isUserMessage ? 0.94 : 0.97, 1],
        }),
      },
    ],
  };

  return (
    <Animated.View
      style={[
        styles.messageRow,
        animatedStyle,
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
              textAlign: messageTextFlow.textAlign,
              writingDirection: messageTextFlow.writingDirection,
            },
          ]}
        >
          {renderSupportMessageBody(displayBody)}
        </Text>
      </View>
    </Animated.View>
  );
}

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
  const sendingRef = useRef(false);
  const sendButtonScale = useRef(new Animated.Value(1)).current;
  const sendButtonLift = useRef(new Animated.Value(0)).current;
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [quickQuestionsDismissed, setQuickQuestionsDismissed] = useState(false);
  const quickQuestions = language === "ar" ? QUICK_QUESTIONS_AR : QUICK_QUESTIONS_EN;
  const headerOverlayHeight = insets.top + 150;
  const inputTextFlow = getTextFlow(message, direction);

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
  const showQuickQuestions = !quickQuestionsDismissed;

  useFocusEffect(
    useCallback(() => {
      setQuickQuestionsDismissed(false);
    }, []),
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(timeout);
  }, [messages.length]);

  useEffect(() => {
    if (data) {
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
    }
  }, [data, queryClient]);

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

  function playSendButtonAnimation() {
    sendButtonScale.stopAnimation();
    sendButtonLift.stopAnimation();
    sendButtonScale.setValue(1);
    sendButtonLift.setValue(0);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(sendButtonScale, {
          toValue: 0.86,
          duration: 90,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(sendButtonLift, {
          toValue: -3,
          duration: 90,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.spring(sendButtonScale, {
          toValue: 1,
          friction: 4,
          tension: 190,
          useNativeDriver: true,
        }),
        Animated.spring(sendButtonLift, {
          toValue: 0,
          friction: 5,
          tension: 170,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }

  async function sendSupportMessage(rawBody: string, options: { dismissQuickQuestions?: boolean } = {}) {
    if (!token) {
      router.push("/login");
      return;
    }

    const body = rawBody.trim();
    if (!body || sendingRef.current) return;

    sendingRef.current = true;
    setSending(true);
    setMessage("");
    try {
      await apiFetch("/api/support/me/messages", {
        method: "POST",
        token,
        body: JSON.stringify({ body }),
      });
      if (options.dismissQuickQuestions) {
        setQuickQuestionsDismissed(true);
      }
      await queryClient.invalidateQueries({ queryKey });
      await refetch();
    } catch (err) {
      setMessage(body);
      Alert.alert(
        strings.auth.errorTitle,
        err instanceof Error ? err.message : strings.common.unexpectedError,
      );
    } finally {
      sendingRef.current = false;
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
            ? ["#000000", "#000000", "#000000"]
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
              flexDirection: "row",
              direction: "ltr",
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={strings.common.back}
        >
          <Feather name="arrow-left" size={20} color={colors.textSecondary} />
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
              height: headerOverlayHeight,
              paddingTop: insets.top + 60,
              flexDirection: rowDirection,
              direction,
            },
          ]}
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
          <View style={[styles.headerContent, { paddingHorizontal: 18, flexDirection: rowDirection, direction }]}>
            <View style={styles.headerIcon}>
              <Feather name="headphones" size={24} color={COLORS.primary} />
            </View>
            <View style={[styles.headerTextBlock, { direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }]}>
              <Text style={[styles.title, { color: colors.text, textAlign, writingDirection: direction }]}>
                {strings.settings.supportChatTitle}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                {strings.settings.supportChatSubtitle}
              </Text>
            </View>
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
                paddingTop: headerOverlayHeight + 12,
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

              {messages.map((item) => (
                <AnimatedSupportMessage
                  key={item.id}
                  item={item}
                  colors={colors}
                  direction={direction}
                />
              ))}
            </ScrollView>

            {showQuickQuestions ? (
              <View style={[styles.quickWrap, { borderTopColor: colors.border }]}>
                <View style={[styles.quickTitleRow, { direction: "ltr" }]}>
                  <Text
                    style={[
                      styles.quickTitle,
                      {
                        color: colors.textSecondary,
                        marginLeft: isRTL ? "auto" : 0,
                        marginRight: isRTL ? 0 : "auto",
                        textAlign: isRTL ? "right" : "left",
                        writingDirection: direction,
                      },
                    ]}
                  >
                    {strings.settings.supportQuickQuestions}
                  </Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="always"
                  contentContainerStyle={styles.quickList}
                >
                  {quickQuestions.map((question) => (
                    <Pressable
                      key={question}
                      onPress={() => void sendSupportMessage(question, { dismissQuickQuestions: true })}
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
            ) : null}

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
                    textAlign: inputTextFlow.textAlign,
                    writingDirection: inputTextFlow.writingDirection,
                  },
                ]}
              />
              <Animated.View
                style={{
                  transform: [{ scale: sendButtonScale }, { translateY: sendButtonLift }],
                }}
              >
                <Pressable
                  onPress={() => {
                    playSendButtonAnimation();
                    void sendSupportMessage(message);
                  }}
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
              </Animated.View>
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
    ...FONT.bold,
    fontSize: 15,
    lineHeight: 24,
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    overflow: "hidden",
  },
  headerContent: {
    zIndex: 1,
    width: "100%",
    flex: 1,
    alignItems: "center",
    gap: 13,
    paddingBottom: 14,
  },
  headerIcon: {
    width: 56,
    height: 56,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.primary + "18",
    backgroundColor: COLORS.primary + "12",
  },
  headerTextBlock: { flex: 1, alignItems: "flex-end", justifyContent: "center" },
  title: {
    ...FONT.bold,
    fontSize: 25,
    lineHeight: 36,
    textAlign: "right",
  },
  subtitle: {
    ...FONT.regular,
    fontSize: 15,
    lineHeight: 24,
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
  primaryButton: {
    minHeight: 46,
    borderRadius: 16,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  primaryButtonText: {
    ...FONT.bold,
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
    ...FONT.semiBold,
    fontSize: 14,
    lineHeight: 24,
  },
  messageStrongText: {
    ...FONT.black,
  },
  quickWrap: {
    borderTopWidth: 1,
    paddingTop: 10,
    paddingBottom: 8,
  },
  quickTitleRow: {
    width: "100%",
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  quickTitle: {
    ...FONT.bold,
    fontSize: 12,
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
    ...FONT.semiBold,
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
    ...FONT.semiBold,
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
