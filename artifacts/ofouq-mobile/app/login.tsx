import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import {
  AuthCard,
  AuthErrorBanner,
  AuthFooterLink,
  AuthPasswordField,
  AuthPrimaryButton,
  AuthScreenLayout,
  AuthTextField,
} from "@/components/auth";
import { COLORS } from "@/constants/colors";
import { SHOULD_SHOW_PREVIEW_API_DEBUG, getBaseUrl } from "@/constants/api";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { type ApiError, type ApiNetworkError, getApiUrl } from "@/lib/api";
import {
  clearApiBaseUrlOverride,
  resolveApiBaseUrl,
  saveApiBaseUrlOverride,
} from "@/lib/apiBaseUrl";

function debugValue(readValue: () => string) {
  try {
    return readValue();
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export default function LoginScreen() {
  const { colors, strings } = usePreferences();
  const { login } = useAuth();
  const passwordRef = useRef<TextInput>(null);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Preview-only API base URL override state (kept for on-device LAN testing).
  const [isSavingApiBase, setIsSavingApiBase] = useState(false);
  const [apiBaseInput, setApiBaseInput] = useState("");
  const [apiBaseMessage, setApiBaseMessage] = useState<string | null>(null);
  const [lastNetworkError, setLastNetworkError] = useState<{ name: string; message: string } | null>(null);
  const [previewApiDebug, setPreviewApiDebug] = useState<{ baseUrl: string; loginUrl: string } | null>(() => {
    if (!SHOULD_SHOW_PREVIEW_API_DEBUG) return null;
    return {
      baseUrl: debugValue(() => getBaseUrl()),
      loginUrl: debugValue(() => getApiUrl("/api/auth/login")),
    };
  });

  const handleLogin = async () => {
    const nextErrors: { identifier?: string; password?: string } = {};
    if (!identifier.trim()) nextErrors.identifier = strings.auth.missingIdentifier;
    if (!password) nextErrors.password = strings.auth.missingPassword;
    setErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length > 0) return;

    setIsLoading(true);
    setLastNetworkError(null);
    try {
      await login(identifier.trim(), password);
      router.replace("/(tabs)");
    } catch (err) {
      const apiError = err as ApiError & ApiNetworkError;
      if (SHOULD_SHOW_PREVIEW_API_DEBUG) {
        setLastNetworkError({
          name: apiError.networkErrorName ?? apiError.name ?? "Error",
          message: apiError.networkErrorMessage ?? apiError.message ?? strings.auth.loginFailed,
        });
      }
      const message =
        apiError.status === 401
          ? strings.auth.invalidCredentials
          : apiError.message || strings.auth.loginFailed;
      setFormError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshPreviewApiDebug = useCallback(async () => {
    if (!SHOULD_SHOW_PREVIEW_API_DEBUG) return;
    try {
      const baseUrl = await resolveApiBaseUrl();
      setPreviewApiDebug({ baseUrl, loginUrl: `${baseUrl}/api/auth/login` });
      setApiBaseInput(baseUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setPreviewApiDebug({ baseUrl: `Error: ${message}`, loginUrl: `Error: ${message}` });
    }
  }, []);

  useEffect(() => {
    void refreshPreviewApiDebug();
  }, [refreshPreviewApiDebug]);

  const handleSaveApiBaseUrl = async () => {
    setIsSavingApiBase(true);
    setApiBaseMessage(null);
    try {
      const normalized = await saveApiBaseUrlOverride(apiBaseInput);
      setApiBaseInput(normalized);
      setPreviewApiDebug({ baseUrl: normalized, loginUrl: `${normalized}/api/auth/login` });
      setLastNetworkError(null);
      setApiBaseMessage("تم حفظ عنوان الخادم.");
    } catch (err) {
      setApiBaseMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSavingApiBase(false);
    }
  };

  const handleClearApiBaseUrl = async () => {
    setIsSavingApiBase(true);
    setApiBaseMessage(null);
    try {
      await clearApiBaseUrlOverride();
      await refreshPreviewApiDebug();
      setLastNetworkError(null);
      setApiBaseMessage("تم الرجوع للعنوان الافتراضي.");
    } catch (err) {
      setApiBaseMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSavingApiBase(false);
    }
  };

  return (
    <AuthScreenLayout
      title={strings.auth.loginTitle}
      subtitle={strings.auth.loginSubtitle}
      onClose={() => router.back()}
      closeAccessibilityLabel={strings.common.close}
      footer={
        <AuthFooterLink
          prompt={strings.auth.noAccount}
          action={strings.auth.createAccountLink}
          onPress={() => router.push("/register")}
        />
      }
    >
      <AuthCard>
        <AuthErrorBanner message={formError} />

        <AuthTextField
          label={strings.auth.identifier}
          icon="mail"
          value={identifier}
          onChangeText={(value) => {
            setIdentifier(value);
            if (errors.identifier) setErrors((prev) => ({ ...prev, identifier: undefined }));
            if (formError) setFormError(null);
          }}
          placeholder={strings.auth.identifierPlaceholder}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          returnKeyType="next"
          error={errors.identifier}
          onSubmitEditing={() => passwordRef.current?.focus()}
          submitBehavior="submit"
        />

        <AuthPasswordField
          ref={passwordRef}
          label={strings.auth.password}
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
            if (formError) setFormError(null);
          }}
          placeholder={strings.auth.passwordPlaceholder}
          autoComplete="password"
          returnKeyType="done"
          error={errors.password}
          onSubmitEditing={handleLogin}
        />

        <AuthPrimaryButton
          label={strings.auth.loginButton}
          onPress={handleLogin}
          loading={isLoading}
        />
      </AuthCard>

      {previewApiDebug ? (
        <View style={[styles.debugPanel, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}>
          <Text style={[styles.debugText, { color: colors.textSecondary }]}>API base: {previewApiDebug.baseUrl}</Text>
          <Text style={[styles.debugText, { color: colors.textSecondary }]}>Login URL: {previewApiDebug.loginUrl}</Text>
          <TextInput
            style={[styles.debugInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
            value={apiBaseInput}
            onChangeText={setApiBaseInput}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="http://192.168.0.40:8080"
            placeholderTextColor={colors.textTertiary}
            textAlign="left"
          />
          <View style={styles.debugActions}>
            <Pressable
              style={[styles.debugButton, { borderColor: colors.border }]}
              onPress={handleSaveApiBaseUrl}
              disabled={isSavingApiBase}
            >
              <Text style={[styles.debugButtonText, { color: COLORS.primary }]}>{isSavingApiBase ? "..." : "حفظ"}</Text>
            </Pressable>
            <Pressable
              style={[styles.debugButton, { borderColor: colors.border }]}
              onPress={handleClearApiBaseUrl}
              disabled={isSavingApiBase}
            >
              <Text style={[styles.debugButtonText, { color: colors.textSecondary }]}>استعادة</Text>
            </Pressable>
          </View>
          {apiBaseMessage ? (
            <Text style={[styles.debugMessage, { color: colors.textSecondary }]}>{apiBaseMessage}</Text>
          ) : null}
          <Text style={[styles.debugText, { color: colors.textSecondary }]}>
            Network: {lastNetworkError ? `${lastNetworkError.name}: ${lastNetworkError.message}` : "not tested"}
          </Text>
        </View>
      ) : null}
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  debugPanel: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  debugText: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), fontSize: 11, lineHeight: 16, textAlign: "left" },
  debugInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), fontSize: 11 },
  debugActions: { flexDirection: "row", gap: 8 },
  debugButton: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  debugButtonText: { fontSize: 12, fontWeight: "700" },
  debugMessage: { fontSize: 11, textAlign: "left" },
});
