import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text } from "react-native";

import {
  AuthCard,
  AuthErrorBanner,
  AuthPrimaryButton,
  AuthScreenLayout,
  AuthTextField,
} from "@/components/auth";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { type ApiError } from "@/lib/api";

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

// First-time phone collection during a two-factor login: the account has no verified
// phone yet, so the user must add one (mandatory) before a code can be sent. On
// success we move to the verify-otp screen in phone mode.
export default function SetupPhoneScreen() {
  const { colors } = usePreferences();
  const { startPhoneSetup } = useAuth();
  const params = useLocalSearchParams<{ setupTicket?: string }>();
  const setupTicket = firstParam(params.setupTicket);

  const [phone, setPhone] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    const trimmed = phone.trim();
    if (trimmed.length < 6) {
      setFormError("اكتب رقم هاتف صحيح");
      return;
    }
    setFormError(null);
    setIsLoading(true);
    try {
      const challenge = await startPhoneSetup(setupTicket, trimmed);
      router.replace({
        pathname: "/verify-otp",
        params: {
          mode: "phone",
          challengeId: challenge.challengeId,
          masked: challenge.maskedDestination,
          ...(challenge.devCode ? { devCode: challenge.devCode } : {}),
        },
      });
    } catch (err) {
      const apiError = err as ApiError;
      setFormError(apiError?.message || "تعذّر حفظ الرقم. حاول مرة أخرى.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthScreenLayout
      title="تأكيد رقم الهاتف"
      subtitle="لتأمين حسابك، أضف رقم هاتفك وسنرسل لك كود تحقق"
      onClose={() => router.back()}
      closeAccessibilityLabel="رجوع"
    >
      <AuthCard>
        <AuthErrorBanner message={formError} />

        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          سيُستخدم هذا الرقم لإرسال كود الدخول في كل مرة. تأكد من أنه رقمك الصحيح.
        </Text>

        <AuthTextField
          label="رقم الهاتف"
          icon="phone"
          value={phone}
          onChangeText={(value) => {
            setPhone(value.replace(/[^0-9+]/g, ""));
            if (formError) setFormError(null);
          }}
          placeholder="01xxxxxxxxx"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />

        <AuthPrimaryButton label="إرسال الكود" onPress={handleSubmit} loading={isLoading} />
      </AuthCard>
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 13, lineHeight: 20, textAlign: "center" },
});
