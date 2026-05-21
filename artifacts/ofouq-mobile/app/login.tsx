import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { SHOULD_SHOW_PREVIEW_API_DEBUG, getBaseUrl } from "@/constants/api";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { type ApiNetworkError, getApiUrl } from "@/lib/api";

function debugValue(readValue: () => string) {
  try {
    return readValue();
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export default function LoginScreen() {
  const { colors, strings, isRTL, textAlign, direction } = usePreferences();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const rowDirection = isRTL ? "row" : "row-reverse";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastNetworkError, setLastNetworkError] = useState<{ name: string; message: string } | null>(null);
  const previewApiDebug = useMemo(() => {
    if (!SHOULD_SHOW_PREVIEW_API_DEBUG) return null;

    return {
      baseUrl: debugValue(() => getBaseUrl()),
      loginUrl: debugValue(() => getApiUrl("/api/auth/login")),
    };
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert(strings.auth.errorTitle, strings.auth.missingLogin);
      return;
    }
    setIsLoading(true);
    setLastNetworkError(null);
    try {
      await login(email.trim(), password.trim());
      router.replace("/(tabs)");
    } catch (err: any) {
      const apiError = err as ApiNetworkError;
      if (SHOULD_SHOW_PREVIEW_API_DEBUG) {
        setLastNetworkError({
          name: apiError.networkErrorName ?? apiError.name ?? "Error",
          message: apiError.networkErrorMessage ?? apiError.message ?? strings.auth.loginFailed,
        });
      }
      Alert.alert(strings.auth.errorTitle, err.message ?? strings.auth.loginFailed);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable style={styles.closeBtn} onPress={() => router.back()}>
          <Feather name="x" size={22} color={colors.textSecondary} />
        </Pressable>

        <View style={styles.logoSection}>
          <Image
            source={require("../assets/images/login-educational-logo.png")}
            style={styles.brandLogo}
            resizeMode="contain"
            accessibilityLabel={strings.common.appName}
          />
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.cardTitle, { color: colors.text, writingDirection: direction }]}>
            {strings.auth.loginTitle}
          </Text>

          <View style={styles.field}>
            <Text
              style={[
                styles.fieldLabel,
                {
                  alignSelf: isRTL ? "flex-end" : "flex-start",
                  color: colors.textSecondary,
                  textAlign: isRTL ? "right" : "left",
                  writingDirection: direction,
                },
              ]}
            >
              {strings.auth.email}
            </Text>
            <View style={[styles.inputWrapper, { backgroundColor: colors.surfaceSecondary, flexDirection: rowDirection }]}>
              <TextInput
                style={[styles.input, { color: colors.text, writingDirection: direction }]}
                placeholder="example@email.com"
                placeholderTextColor={colors.textTertiary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                textAlign={textAlign}
              />
              <Feather name="mail" size={18} color={colors.textTertiary} />
            </View>
          </View>

          <View style={styles.field}>
            <Text
              style={[
                styles.fieldLabel,
                {
                  alignSelf: isRTL ? "flex-end" : "flex-start",
                  color: colors.textSecondary,
                  textAlign: isRTL ? "right" : "left",
                  writingDirection: direction,
                },
              ]}
            >
              {strings.auth.password}
            </Text>
            <View style={[styles.inputWrapper, { backgroundColor: colors.surfaceSecondary, flexDirection: rowDirection }]}>
              <Pressable onPress={() => setShowPassword(!showPassword)}>
                <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={colors.textTertiary} />
              </Pressable>
              <TextInput
                style={[styles.input, { color: colors.text, writingDirection: direction }]}
                placeholder="••••••••"
                placeholderTextColor={colors.textTertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                textAlign={textAlign}
              />
              <Feather name="lock" size={18} color={colors.textTertiary} />
            </View>
          </View>

          <Pressable style={styles.loginBtn} onPress={handleLogin} disabled={isLoading}>
            <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.loginGrad}>
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.loginText, { writingDirection: direction }]}>{strings.auth.loginButton}</Text>
              )}
            </LinearGradient>
          </Pressable>

          {previewApiDebug ? (
            <View style={[styles.debugPanel, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.debugText, { color: colors.textSecondary }]}>API base: {previewApiDebug.baseUrl}</Text>
              <Text style={[styles.debugText, { color: colors.textSecondary }]}>Login URL: {previewApiDebug.loginUrl}</Text>
              <Text style={[styles.debugText, { color: colors.textSecondary }]}>
                Network: {lastNetworkError ? `${lastNetworkError.name}: ${lastNetworkError.message}` : "not tested"}
              </Text>
            </View>
          ) : null}

          <Pressable style={styles.registerLink} onPress={() => router.push("/register")}>
            <Text style={[styles.registerLinkText, { color: COLORS.primary }]}>
              {strings.auth.registerPrompt}
            </Text>
          </Pressable>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 20, gap: 16 },
  closeBtn: { alignSelf: "flex-start", padding: 8 },
  logoSection: { alignItems: "center", paddingVertical: 12 },
  brandLogo: { width: 260, height: 104 },
  card: { borderRadius: 24, padding: 24, gap: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  cardTitle: { fontWeight: "700", fontSize: 22, textAlign: "center" },
  field: { gap: 6 },
  fieldLabel: { fontWeight: "600", fontSize: 13 },
  inputWrapper: { flexDirection: "row", alignItems: "center", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  input: { flex: 1, fontWeight: "400", fontSize: 15 },
  loginBtn: { borderRadius: 16, overflow: "hidden", marginTop: 4 },
  loginGrad: { paddingVertical: 16, alignItems: "center" },
  loginText: { fontWeight: "700", fontSize: 17, color: "#fff" },
  debugPanel: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 4 },
  debugText: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), fontSize: 11, lineHeight: 16, textAlign: "left" },
  registerLink: { alignItems: "center", paddingVertical: 4 },
  registerLinkText: { fontWeight: "600", fontSize: 14 },
});
