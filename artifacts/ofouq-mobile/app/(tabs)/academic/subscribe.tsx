import { Feather, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { BlurView } from "expo-blur";
import type { ImagePickerAsset } from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams, useNavigation, usePathname } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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
import { academicRoute, getAcademicRouteBase } from "@/lib/academicRoutes";
import { localizeAcademicText } from "@/lib/academicContentLocalization";
import { formatShortDate, toEnglishDigits } from "@/lib/format";
import {
  createImageFormDataFile,
  logImageUploadDebug,
  pickImageFromLibrary,
} from "@/lib/imagePicker";

type AccessStatus = "none" | "pending" | "approved" | "rejected";

interface Subject {
  id: number;
  name: string;
  nameEn?: string | null;
  icon?: string | null;
  accessStatus?: AccessStatus;
  isLocked?: boolean;
}

interface StudentSubscriptionRequest {
  id: number;
  code: string;
  status: AccessStatus;
  submittedAt: string;
  reviewNotes?: string | null;
  year: { id: number; name: string; nameEn?: string | null };
  subject: { id: number; name: string; nameEn?: string | null };
}

function accessColors(status: AccessStatus) {
  if (status === "approved") return { bg: "#DCFCE7", text: "#047857" };
  if (status === "pending") return { bg: "#FEF3C7", text: "#B45309" };
  if (status === "rejected") return { bg: "#FFE4E6", text: "#BE123C" };
  return { bg: "#E2E8F0", text: "#475569" };
}

function encode(value: string | undefined) {
  return encodeURIComponent(value ?? "");
}

export default function SubscribeScreen() {
  const { colors, resolvedScheme, strings, language, isRTL, direction, textAlign, rowDirection, alignStart } = usePreferences();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const routeBase = getAcademicRouteBase(usePathname());
  const tr = strings.academic.subscribe;
  const statusLabel = (status: AccessStatus) =>
    status === "approved"
      ? strings.academic.approved
      : status === "pending"
        ? strings.academic.pending
        : status === "rejected"
          ? strings.academic.rejected
          : strings.academic.notSubscribed;
  const { yearId, yearName, yearNameEn, subjectId, subjectName } = useLocalSearchParams<{
    yearId: string;
    yearName: string;
    yearNameEn?: string;
    subjectId?: string;
    subjectName?: string;
  }>();
  const localizedYearName = localizeAcademicText(
    String(yearName ?? ""),
    language,
    yearNameEn ? String(yearNameEn) : undefined,
  );

  const [selectedSubjectId, setSelectedSubjectId] = useState<number>(
    Number.parseInt(String(subjectId ?? "0"), 10) || 0,
  );
  const [code, setCode] = useState("");
  const [image, setImage] = useState<ImagePickerAsset | null>(null);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: tr.navTitle });
  }, [navigation, tr.navTitle]);

  useEffect(() => {
    if (!token) router.replace("/login");
  }, [token]);

  const { data: subjects = [], isLoading: subjectsLoading } = useQuery<Subject[]>({
    queryKey: ["academic", "subscribe-subjects", yearId, token],
    queryFn: () => apiFetch(`/api/academic/years/${yearId}/subjects`, { token }),
    enabled: Boolean(yearId && token),
  });

  const {
    data: requests = [],
    refetch: refetchRequests,
    isLoading: requestsLoading,
  } = useQuery<StudentSubscriptionRequest[]>({
    queryKey: ["academic", "subscription-requests", "me", token],
    queryFn: () => apiFetch("/api/academic/subscription-requests/me", { token }),
    enabled: Boolean(token),
  });

  // Refresh on return so an admin's approval/rejection of the request reflects
  // here without needing an app restart.
  useRefetchOnFocus(refetchRequests);

  useEffect(() => {
    if (selectedSubjectId || subjects.length === 0) return;
    const preferred = subjects.find((subject) => {
      const status = subject.accessStatus ?? (subject.isLocked ? "none" : "approved");
      return status !== "approved" && status !== "pending";
    });
    setSelectedSubjectId(preferred?.id ?? subjects[0].id);
  }, [selectedSubjectId, subjects]);

  const selectedSubject = useMemo(
    () => subjects.find((subject) => subject.id === selectedSubjectId),
    [selectedSubjectId, subjects],
  );
  const selectedStatus: AccessStatus =
    selectedSubject?.accessStatus ?? (selectedSubject?.isLocked ? "none" : "approved");
  const statusStyle = accessColors(selectedStatus);
  const rtlAlign = isRTL ? "flex-end" : "flex-start";
  const headerOverlayHeight = insets.top + 134;
  const subscriptionPath =
    `${academicRoute(routeBase, "subjects")}?yearId=${yearId}&yearName=${encode(String(yearName))}`;
  const canSubmit = Boolean(
    token &&
      selectedSubject &&
      code.trim() &&
      image &&
      selectedStatus !== "approved" &&
      selectedStatus !== "pending" &&
      !submitting,
  );

  async function pickImage() {
    const result = await pickImageFromLibrary({
      source: "subscription-code",
      allowsEditing: true,
      quality: 0.82,
    });

    if (result.status === "denied") {
      setMessage({
        type: "error",
        text: strings.common.photoPermissionMessage,
      });
      return;
    }

    if (result.status === "error") {
      setMessage({
        type: "error",
        text: strings.common.photoPermissionMessage,
      });
      return;
    }

    if (result.status === "canceled") return;

    setImage(result.asset);
    setMessage(null);
  }

  async function submitRequest() {
    if (!token) {
      router.replace("/login");
      return;
    }
    const finalCode = code.trim();
    if (!selectedSubject) {
      setMessage({ type: "error", text: tr.selectSubjectFirst });
      return;
    }
    if (selectedStatus === "approved") {
      setMessage({ type: "error", text: tr.alreadySubscribedMsg });
      return;
    }
    if (selectedStatus === "pending") {
      setMessage({ type: "error", text: tr.pendingMsg });
      return;
    }
    if (!finalCode) {
      setMessage({ type: "error", text: tr.enterCodeFirst });
      return;
    }
    if (!image) {
      setMessage({ type: "error", text: tr.imageRequired });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("image", createImageFormDataFile(image, "subscription-code.jpg") as any);

      logImageUploadDebug("subscription-code", "upload_start", image);
      const upload = await apiFetch<{ url: string }>("/api/academic/subscription-requests/upload-code-image", {
        method: "POST",
        token,
        body: fd,
      });
      logImageUploadDebug("subscription-code", "upload_success", image);

      const result = await apiFetch<{ message?: string }>("/api/academic/subscription-requests", {
        method: "POST",
        token,
        body: JSON.stringify({
          yearId: Number.parseInt(String(yearId), 10),
          subjectId: selectedSubject.id,
          code: finalCode,
          codeImageUrl: upload.url,
        }),
      });

      setCode("");
      setImage(null);
      setMessage({
        type: "success",
        text: result.message ?? tr.successMsg,
      });
      await refetchRequests();
    } catch (err) {
      logImageUploadDebug("subscription-code", "upload_error", image);
      setMessage({ type: "error", text: err instanceof Error ? err.message : tr.submitError });
    } finally {
      setSubmitting(false);
    }
  }

  function goBackToSubjects() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(subscriptionPath as any);
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <LinearGradient
        colors={
          resolvedScheme === "dark"
            ? ["#000000", "#000000", "#000000"]
            : ["#EEF5FF", "#F8FBFF", "#F5F2FF"]
        }
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.topBar, { height: headerOverlayHeight, paddingTop: insets.top + 12 }]}>
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
        <View style={[styles.topBarContent, { paddingHorizontal: 18 }]}>
          <View style={styles.backCornerRow}>
            <Pressable
              onPress={goBackToSubjects}
              hitSlop={8}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.backButton,
                {
                  backgroundColor: pressed ? colors.surfaceSecondary : colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              <Feather name="arrow-left" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={[styles.titleRow, { flexDirection: rowDirection, direction }]}>
            <View style={[styles.titleIcon, resolvedScheme === "dark" && { backgroundColor: COLORS.darkIconFrame.background, borderColor: COLORS.darkIconFrame.border }]}>
              <Ionicons name="key-outline" size={24} color={resolvedScheme === "dark" ? COLORS.darkIconFrame.foreground : COLORS.primary} />
            </View>
            <View style={[styles.titleBlock, { direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }]}>
              <Text style={[styles.title, { color: colors.text, textAlign, writingDirection: direction }]} numberOfLines={2}>
                {localizedYearName ? `${tr.headerTitlePrefix} - ${localizedYearName}` : tr.navTitle}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                {tr.subtitle}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: headerOverlayHeight + 18,
          paddingHorizontal: 18,
          paddingBottom: insets.bottom + 118,
          gap: 16,
        }}
      >
        <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary, alignSelf: rtlAlign, textAlign, writingDirection: direction }]}>
            {tr.subjectLabel}
          </Text>
          {subjectsLoading ? (
            <View style={[styles.loadingRow, { flexDirection: isRTL ? "row-reverse" : "row", justifyContent: rtlAlign }]}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                {tr.loadingSubjects}
              </Text>
            </View>
          ) : (
            <View style={styles.subjectChoices}>
              {subjects.map((subject) => {
                const active = subject.id === selectedSubjectId;
                return (
                  <Pressable
                    key={subject.id}
                    onPress={() => setSelectedSubjectId(subject.id)}
                    style={[
                      styles.subjectChoice,
                      {
                        borderColor: active ? COLORS.primary : colors.border,
                        backgroundColor: active ? COLORS.primary + "12" : colors.surface,
                        flexDirection: isRTL ? "row-reverse" : "row",
                        justifyContent: rtlAlign,
                      },
                    ]}
                  >
                    <Text style={styles.subjectChoiceIcon}>{subject.icon || "📚"}</Text>
                    <Text
                      style={[
                        styles.subjectChoiceText,
                        { color: active ? COLORS.primary : colors.text, textAlign, writingDirection: direction },
                      ]}
                      numberOfLines={1}
                    >
                      {localizeAcademicText(subject.name, language, subject.nameEn)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {selectedSubject || subjectName ? (
            <View style={[styles.statusLine, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.statusLineText, { color: statusStyle.text, textAlign: "center", writingDirection: direction }]}>
                {tr.subjectStatus} {statusLabel(selectedStatus)}
              </Text>
            </View>
          ) : null}

          <Text style={[styles.fieldLabel, { color: colors.textSecondary, alignSelf: rtlAlign, textAlign, writingDirection: direction }]}>
            {tr.codeLabel} <Text style={styles.fieldHint}>{tr.codeHint}</Text>
          </Text>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder={tr.codePlaceholder}
            placeholderTextColor={colors.textTertiary}
            style={[
              styles.input,
              {
                color: colors.text,
                backgroundColor: colors.surface,
                borderColor: colors.border,
                textAlign,
                writingDirection: direction,
              },
            ]}
            textAlign={isRTL ? "right" : "left"}
            keyboardType="default"
          />

          <Text style={[styles.fieldLabel, { color: colors.textSecondary, alignSelf: rtlAlign, textAlign, writingDirection: direction }]}>
            {tr.codeImageLabel}
          </Text>
          <Pressable
            onPress={pickImage}
            style={({ pressed }) => [
              styles.imagePicker,
              {
                borderColor: COLORS.primary + "55",
                backgroundColor: pressed ? COLORS.primary + "14" : COLORS.primary + "0D",
              },
            ]}
          >
            <Feather name="image" size={18} color={COLORS.primary} />
            <Text style={styles.imagePickerText}>
              {image ? toEnglishDigits(image.fileName ?? tr.imageSelected) : tr.pickImage}
            </Text>
          </Pressable>

          {message ? (
            <View
              style={[
                styles.messageBox,
                message.type === "success" ? styles.successBox : styles.errorBox,
              ]}
            >
              <Text style={[message.type === "success" ? styles.successText : styles.errorText, { textAlign, writingDirection: direction }]}>
                {toEnglishDigits(message.text)}
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => void submitRequest()}
            disabled={!canSubmit}
            style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Feather name="send" size={17} color="#fff" />}
            <Text style={styles.submitText}>
              {submitting
                ? tr.submitting
                : selectedStatus === "pending"
                ? tr.underReview
                : selectedStatus === "approved"
                ? tr.alreadySubscribed
                : tr.submit}
            </Text>
          </Pressable>
        </View>

        <View style={[styles.requestsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.requestsTitle, { color: colors.text, alignSelf: rtlAlign, textAlign, writingDirection: direction }]}>{tr.pastRequests}</Text>
          {requestsLoading ? (
            <ActivityIndicator color={COLORS.primary} />
          ) : requests.length === 0 ? (
            <Text style={[styles.emptyRequests, { color: colors.textSecondary, alignSelf: rtlAlign, textAlign, writingDirection: direction }]}>{tr.noRequests}</Text>
          ) : (
            requests.map((request) => {
              const requestBadge = accessColors(request.status);
              return (
                <View key={request.id} style={[styles.requestRow, { backgroundColor: colors.surface, flexDirection: isRTL ? "row" : "row-reverse" }]}>
                  <View style={[styles.requestBadge, { backgroundColor: requestBadge.bg }]}>
                    <Text style={[styles.requestBadgeText, { color: requestBadge.text }]}>
                      {statusLabel(request.status)}
                    </Text>
                  </View>
                  <View style={[styles.requestTextBlock, { alignItems: rtlAlign }]}>
                    <Text style={[styles.requestSubject, { color: colors.text, textAlign, writingDirection: direction }]} numberOfLines={1}>
                      {localizeAcademicText(request.subject.name, language, request.subject.nameEn)}
                    </Text>
                    <Text style={[styles.requestMeta, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                      {localizeAcademicText(request.year.name, language, request.year.nameEn)} · {formatShortDate(request.submittedAt, strings.locale)}
                    </Text>
                    <Text style={[styles.requestMeta, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                      {tr.codePrefix} {toEnglishDigits(request.code)}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
    gap: 2,
    paddingBottom: 4,
  },
  backCornerRow: {
    width: "100%",
    alignSelf: "stretch",
    alignItems: "flex-start",
    direction: "ltr",
  },
  backButton: {
    alignSelf: "flex-start",
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    direction: "ltr",
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  backText: {
    ...FONT.bold,
    fontSize: 15,
    lineHeight: 24,
  },
  titleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 13,
  },
  titleIcon: {
    width: 54,
    height: 54,
    borderRadius: 20,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.primary + "18",
    backgroundColor: COLORS.primary + "12",
  },
  titleBlock: {
    flex: 1,
    justifyContent: "center",
  },
  title: {
    flexShrink: 1,
    ...FONT.bold,
    fontSize: 19,
    lineHeight: 29,
    textAlign: "right",
  },
  subtitle: {
    ...FONT.regular,
    fontSize: 14,
    lineHeight: 22,
    textAlign: "right",
  },
  formCard: {
    borderRadius: 26,
    borderWidth: 1,
    padding: 18,
    gap: 12,
    direction: "ltr",
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.1,
    shadowRadius: 26,
  },
  fieldLabel: {
    alignSelf: "flex-end",
    ...FONT.bold,
    fontSize: 12,
    textAlign: "right",
    writingDirection: "rtl",
  },
  fieldHint: {
    ...FONT.regular,
    fontSize: 11,
  },
  loadingRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    justifyContent: "flex-end",
  },
  loadingText: {
    ...FONT.regular,
    fontSize: 12,
  },
  subjectChoices: {
    gap: 9,
  },
  subjectChoice: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 9,
  },
  subjectChoiceIcon: { fontSize: 21 },
  subjectChoiceText: {
    flex: 1,
    ...FONT.bold,
    fontSize: 13,
    textAlign: "right",
  },
  statusLine: {
    alignSelf: "center",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusLineText: {
    ...FONT.bold,
    fontSize: 11,
  },
  input: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    ...FONT.semiBold,
    fontSize: 14,
  },
  imagePicker: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  imagePickerText: {
    ...FONT.bold,
    fontSize: 13,
    color: COLORS.primary,
  },
  messageBox: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  successBox: {
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  errorBox: {
    backgroundColor: "#FFF1F2",
    borderWidth: 1,
    borderColor: "#FECDD3",
  },
  successText: {
    ...FONT.semiBold,
    fontSize: 12,
    lineHeight: 21,
    color: "#047857",
    textAlign: "right",
  },
  errorText: {
    ...FONT.semiBold,
    fontSize: 12,
    lineHeight: 21,
    color: "#BE123C",
    textAlign: "right",
  },
  submitButton: {
    minHeight: 54,
    borderRadius: 17,
    backgroundColor: COLORS.primary,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  submitButtonDisabled: {
    opacity: 0.45,
  },
  submitText: {
    ...FONT.bold,
    fontSize: 14,
    color: "#fff",
  },
  requestsCard: {
    borderRadius: 26,
    borderWidth: 1,
    padding: 18,
    gap: 12,
    direction: "ltr",
  },
  requestsTitle: {
    alignSelf: "flex-end",
    ...FONT.bold,
    fontSize: 16,
    textAlign: "right",
    writingDirection: "rtl",
  },
  emptyRequests: {
    alignSelf: "flex-end",
    ...FONT.regular,
    fontSize: 13,
    textAlign: "right",
    writingDirection: "rtl",
  },
  requestRow: {
    borderRadius: 18,
    padding: 14,
    minHeight: 96,
    // Forced LTR physical context + flex order: status (first child) pinned to the far
    // left, the request data (second child) fills the rest to the far right.
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    direction: "ltr",
  },
  requestTextBlock: {
    flex: 1,
    alignItems: "flex-end",
    direction: "ltr",
  },
  requestSubject: {
    ...FONT.bold,
    fontSize: 13,
    width: "100%",
    textAlign: "right",
    writingDirection: "rtl",
  },
  requestMeta: {
    ...FONT.regular,
    fontSize: 11,
    width: "100%",
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: 2,
  },
  requestBadge: {
    flexShrink: 0,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  requestBadgeText: {
    ...FONT.bold,
    fontSize: 10,
  },
});
