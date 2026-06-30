import { router, useLocalSearchParams } from "expo-router";
import React, { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  AuthCard,
  AuthErrorBanner,
  AuthPrimaryButton,
  AuthScreenLayout,
  AuthTextField,
} from "@/components/auth";
import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { type ApiError } from "@/lib/api";

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

// Step 2 of a two-factor login: the user enters the SMS code. Reused for both the
// normal login OTP (`mode=login`) and the first-time phone verification
// (`mode=phone`), which differ only in which finalising call runs.
export default function VerifyOtpScreen() {
  const { colors } = usePreferences();
  const { completeOtp, completePhoneVerify, resendOtp } = useAuth();
  const params = useLocalSearchParams<{ mode?: string; challengeId?: string; masked?: string; devCode?: string }>();

  const isPhone = firstParam(params.mode) === "phone";
  const [challengeId, setChallengeId] = useState(() => firstParam(params.challengeId));
  const [masked, setMasked] = useState(() => firstParam(params.masked));
  const [devCode, setDevCode] = useState(() => firstParam(params.devCode));

  const [code, setCode] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const resendingRef = useRef(false);

  const handleVerify = async () => {
    const trimmed = code.trim();
    if (trimmed.length < 4) {
      setFormError("اكتب الكود المكوّن من الأرقام المرسلة إليك");
      return;
    }
    setFormError(null);
    setInfo(null);
    setIsLoading(true);
    try {
      if (isPhone) {
        await completePhoneVerify(challengeId, trimmed);
      } else {
        await completeOtp(challengeId, trimmed);
      }
      router.replace("/(tabs)");
    } catch (err) {
      const apiError = err as ApiError;
      setFormError(apiError?.message || "تعذّر التحقق من الكود. حاول مرة أخرى.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendingRef.current) return;
    resendingRef.current = true;
    setIsResending(true);
    setFormError(null);
    setInfo(null);
    try {
      const next = await resendOtp(challengeId);
      setChallengeId(next.challengeId);
      setMasked(next.maskedDestination);
      setDevCode(next.devCode ?? "");
      setCode("");
      setInfo("تم إرسال كود جديد.");
    } catch (err) {
      const apiError = err as ApiError & { retryAfterSeconds?: number };
      const retry = apiError?.retryAfterSeconds;
      setFormError(
        retry ? `انتظر ${retry} ثانية قبل طلب كود جديد` : apiError?.message || "تعذّر إرسال كود جديد.",
      );
    } finally {
      resendingRef.current = false;
      setIsResending(false);
    }
  };

  return (
    <AuthScreenLayout
      title="التحقق بخطوتين"
      subtitle={
        isPhone
          ? "أكّد رقم هاتفك بإدخال الكود المرسل إليه"
          : "أدخل كود التحقق لإتمام تسجيل الدخول"
      }
      onClose={() => router.back()}
      closeAccessibilityLabel="رجوع"
    >
      <AuthCard>
        <AuthErrorBanner message={formError} />

        {masked ? (
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            أرسلنا كودًا عبر رسالة نصية إلى {masked}
          </Text>
        ) : null}

        {devCode ? (
          <View style={[styles.devBox, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}>
            <Text style={[styles.devText, { color: colors.textSecondary }]}>كود التجربة (وضع التطوير): {devCode}</Text>
          </View>
        ) : null}

        <AuthTextField
          label="كود التحقق"
          icon="shield"
          value={code}
          onChangeText={(value) => {
            setCode(value.replace(/[^0-9]/g, ""));
            if (formError) setFormError(null);
          }}
          placeholder="------"
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={8}
          returnKeyType="done"
          onSubmitEditing={handleVerify}
        />

        <AuthPrimaryButton label="تأكيد" onPress={handleVerify} loading={isLoading} />

        {info ? <Text style={[styles.info, { color: COLORS.primary }]}>{info}</Text> : null}

        <Text
          accessibilityRole="button"
          onPress={isResending ? undefined : handleResend}
          style={[styles.resend, { color: isResending ? colors.textTertiary : COLORS.primary }]}
        >
          {isResending ? "جارٍ الإرسال..." : "لم يصلك الكود؟ إرسال كود جديد"}
        </Text>
      </AuthCard>
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 13, lineHeight: 20, textAlign: "center" },
  devBox: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  devText: { fontSize: 12, textAlign: "center" },
  info: { fontSize: 13, textAlign: "center", fontWeight: "600" },
  resend: { fontSize: 14, textAlign: "center", fontWeight: "700", paddingVertical: 6 },
});
