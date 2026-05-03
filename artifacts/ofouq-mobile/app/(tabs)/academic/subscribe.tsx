import { Feather, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { apiFetch } from "@/lib/api";
import { academicRoute, getAcademicRouteBase } from "@/lib/academicRoutes";
import { formatShortDate, toEnglishDigits } from "@/lib/format";

type AccessStatus = "none" | "pending" | "approved" | "rejected";

interface Subject {
  id: number;
  name: string;
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
  year: { id: number; name: string };
  subject: { id: number; name: string };
}

function accessLabel(status: AccessStatus) {
  if (status === "approved") return "مقبول";
  if (status === "pending") return "قيد المراجعة";
  if (status === "rejected") return "مرفوض";
  return "غير مشترك";
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
  const { colors, resolvedScheme, strings, isRTL, direction, textAlign, rowDirection, alignStart } = usePreferences();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const routeBase = getAcademicRouteBase(usePathname());
  const { yearId, yearName, subjectId, subjectName } = useLocalSearchParams<{
    yearId: string;
    yearName: string;
    subjectId?: string;
    subjectName?: string;
  }>();

  const [selectedSubjectId, setSelectedSubjectId] = useState<number>(
    Number.parseInt(String(subjectId ?? "0"), 10) || 0,
  );
  const [code, setCode] = useState("");
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: "طلب اشتراك" });
  }, [navigation]);

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
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage({ type: "error", text: "يجب السماح باختيار الصورة لإرفاق كود الاشتراك." });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.82,
    });

    if (!result.canceled) {
      setImage(result.assets[0]);
      setMessage(null);
    }
  }

  async function submitRequest() {
    if (!token) {
      router.replace("/login");
      return;
    }
    const finalCode = code.trim();
    if (!selectedSubject) {
      setMessage({ type: "error", text: "اختر المادة أولًا." });
      return;
    }
    if (selectedStatus === "approved") {
      setMessage({ type: "error", text: "أنت مشترك بالفعل في هذه المادة." });
      return;
    }
    if (selectedStatus === "pending") {
      setMessage({ type: "error", text: "لديك طلب اشتراك قيد المراجعة لهذه المادة." });
      return;
    }
    if (!finalCode) {
      setMessage({ type: "error", text: "اكتب كود الاشتراك أولًا." });
      return;
    }
    if (!image) {
      setMessage({ type: "error", text: "صورة كود الاشتراك مطلوبة." });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("image", {
        uri: image.uri,
        name: image.fileName ?? "subscription-code.jpg",
        type: image.mimeType ?? "image/jpeg",
      } as any);

      const upload = await apiFetch<{ url: string }>("/api/academic/subscription-requests/upload-code-image", {
        method: "POST",
        token,
        body: fd,
      });

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
        text:
          result.message ??
          "تم إرسال طلبك بنجاح وهو الآن قيد المراجعة. سيتم مراجعته خلال يوم عمل واحد كحد أقصى.",
      });
      await refetchRequests();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "تعذر إرسال الطلب." });
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
            ? ["#0A0F1E", "#111827", "#0F172A"]
            : ["#EEF5FF", "#F8FBFF", "#F5F2FF"]
        }
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: insets.top + 18,
          paddingHorizontal: 18,
          paddingBottom: insets.bottom + 118,
          gap: 16,
        }}
      >
        <View style={styles.backCornerRow}>
          <Pressable
            onPress={goBackToSubjects}
            hitSlop={8}
            accessibilityRole="button"
            style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.62 : 1 }]}
          >
            <Feather name="arrow-left" size={16} color={colors.textSecondary} />
            <Text style={[styles.backText, { color: colors.textSecondary, writingDirection: direction }]}>المواد</Text>
          </Pressable>
        </View>

        <View style={[styles.titleRow, { flexDirection: rowDirection, direction }]}>
          <View style={styles.titleIcon}>
            <Ionicons name="key-outline" size={24} color={COLORS.primary} />
          </View>
          <View style={styles.titleBlock}>
            <Text style={[styles.title, { color: colors.text, writingDirection: direction }]}>
              {toEnglishDigits(yearName ? `اشتراك مادة - ${yearName}` : "طلب اشتراك")}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary, writingDirection: direction }]}>
              أدخل كود الاشتراك وارفع صورته لإرسال الطلب.
            </Text>
          </View>
        </View>

        <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
            المادة
          </Text>
          {subjectsLoading ? (
            <View style={[styles.loadingRow, { flexDirection: isRTL ? "row-reverse" : "row", justifyContent: rtlAlign }]}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                جاري تحميل المواد...
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
                      {toEnglishDigits(subject.name)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {selectedSubject || subjectName ? (
            <View style={[styles.statusLine, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.statusLineText, { color: statusStyle.text, textAlign: "center", writingDirection: direction }]}>
                حالة المادة: {accessLabel(selectedStatus)}
              </Text>
            </View>
          ) : null}

          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
            كود الاشتراك <Text style={styles.fieldHint}>(يوجد على ظهر غلاف الكتاب من الداخل)</Text>
          </Text>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="مثال: 1106092724"
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
            textAlign="right"
            keyboardType="default"
          />

          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
            صورة كود الاشتراك
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
              {image ? toEnglishDigits(image.fileName ?? "تم اختيار صورة") : "اختيار صورة الكود"}
            </Text>
          </Pressable>

          {message ? (
            <View
              style={[
                styles.messageBox,
                message.type === "success" ? styles.successBox : styles.errorBox,
              ]}
            >
              <Text style={message.type === "success" ? styles.successText : styles.errorText}>
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
                ? "جاري إرسال الطلب..."
                : selectedStatus === "pending"
                ? "الطلب قيد المراجعة"
                : selectedStatus === "approved"
                ? "أنت مشترك بالفعل"
                : "إرسال طلب الاشتراك"}
            </Text>
          </Pressable>
        </View>

        <View style={[styles.requestsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.requestsTitle, { color: colors.text }]}>طلباتك السابقة</Text>
          {requestsLoading ? (
            <ActivityIndicator color={COLORS.primary} />
          ) : requests.length === 0 ? (
            <Text style={[styles.emptyRequests, { color: colors.textSecondary }]}>لا توجد طلبات حتى الآن.</Text>
          ) : (
            requests.map((request) => {
              const requestBadge = accessColors(request.status);
              return (
                <View key={request.id} style={[styles.requestRow, { backgroundColor: colors.surface }]}>
                  <View style={[styles.requestBadge, { backgroundColor: requestBadge.bg }]}>
                    <Text style={[styles.requestBadgeText, { color: requestBadge.text }]}>
                      {accessLabel(request.status)}
                    </Text>
                  </View>
                  <View style={styles.requestTextBlock}>
                    <Text style={[styles.requestSubject, { color: colors.text }]} numberOfLines={1}>
                      {toEnglishDigits(request.subject.name)}
                    </Text>
                    <Text style={[styles.requestMeta, { color: colors.textSecondary }]}>
                      {toEnglishDigits(request.year.name)} · {formatShortDate(request.submittedAt, strings.locale)}
                    </Text>
                    <Text style={[styles.requestMeta, { color: colors.textSecondary }]}>
                      الكود: {toEnglishDigits(request.code)}
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
  backCornerRow: {
    width: "100%",
    alignSelf: "stretch",
    alignItems: "flex-start",
    direction: "ltr",
  },
  backButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 32,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    direction: "ltr",
  },
  backText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
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
    backgroundColor: COLORS.primary + "12",
  },
  titleBlock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flexShrink: 1,
    fontFamily: "Cairo_700Bold",
    fontSize: 23,
    lineHeight: 35,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    lineHeight: 22,
    textAlign: "center",
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
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    textAlign: "right",
    writingDirection: "rtl",
  },
  fieldHint: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
  },
  loadingRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    justifyContent: "flex-end",
  },
  loadingText: {
    fontFamily: "Cairo_400Regular",
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
    fontFamily: "Cairo_700Bold",
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
    fontFamily: "Cairo_700Bold",
    fontSize: 11,
  },
  input: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontFamily: "Cairo_600SemiBold",
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
    fontFamily: "Cairo_700Bold",
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
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
    lineHeight: 21,
    color: "#047857",
    textAlign: "right",
  },
  errorText: {
    fontFamily: "Cairo_600SemiBold",
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
    fontFamily: "Cairo_700Bold",
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
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    textAlign: "right",
    writingDirection: "rtl",
  },
  emptyRequests: {
    alignSelf: "flex-end",
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    textAlign: "right",
    writingDirection: "rtl",
  },
  requestRow: {
    borderRadius: 18,
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 12,
    paddingRight: 0,
    position: "relative",
    minHeight: 96,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "flex-end",
    direction: "ltr",
  },
  requestTextBlock: {
    width: "100%",
    paddingLeft: 92,
    alignItems: "flex-end",
    alignSelf: "stretch",
    direction: "rtl",
  },
  requestSubject: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    textAlign: "right",
    writingDirection: "rtl",
  },
  requestMeta: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: 2,
  },
  requestBadge: {
    position: "absolute",
    left: 12,
    top: 12,
    flexShrink: 0,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  requestBadgeText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 10,
  },
});
