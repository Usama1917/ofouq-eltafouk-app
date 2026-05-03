import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

import { Logo } from "@/components/Logo";
import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";

export default function LoginScreen() {
  const { colors, strings, isRTL, textAlign, direction } = usePreferences();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const rowDirection = isRTL ? "row" : "row-reverse";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const fillDemo = (role: "student" | "admin" | "owner" | "teacher") => {
    const accounts: Record<string, { email: string; password: string }> = {
      student: { email: "student@demo.com", password: "demo123" },
      teacher: { email: "teacher@demo.com", password: "demo123" },
      admin: { email: "admin@demo.com", password: "admin123" },
      owner: { email: "owner@demo.com", password: "owner123" },
    };
    setEmail(accounts[role].email);
    setPassword(accounts[role].password);
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert(strings.auth.errorTitle, strings.auth.missingLogin);
      return;
    }
    setIsLoading(true);
    try {
      await login(email.trim(), password.trim());
      router.replace("/(tabs)");
    } catch (err: any) {
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
          <Logo size={72} />
          <Text style={[styles.appName, { color: colors.text, writingDirection: direction }]}>
            {strings.common.appName}
          </Text>
          <Text style={[styles.appSub, { color: colors.textSecondary, writingDirection: direction }]}>
            {strings.common.appSubtitle}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.cardTitle, { color: colors.text, textAlign, writingDirection: direction }]}>
            {strings.auth.loginTitle}
          </Text>

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
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
            <Text style={[styles.fieldLabel, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
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

          <Pressable style={styles.registerLink} onPress={() => router.push("/register")}>
            <Text style={[styles.registerLinkText, { color: COLORS.primary }]}>
              {strings.auth.registerPrompt}
            </Text>
          </Pressable>
        </View>

        <View style={[styles.demoSection, { backgroundColor: colors.surface }]}>
          <Text style={[styles.demoTitle, { color: colors.textSecondary, writingDirection: direction }]}>
            {strings.auth.demoAccounts}
          </Text>
          <View style={styles.demoRow}>
            {(["student", "teacher", "admin", "owner"] as const).map((role) => {
              const labels = strings.roles;
              const roleColors = { student: "#3B82F6", teacher: "#10B981", admin: "#EF4444", owner: "#F59E0B" };
              return (
                <Pressable
                  key={role}
                  style={[styles.demoChip, { backgroundColor: roleColors[role] + "22", borderColor: roleColors[role] + "44" }]}
                  onPress={() => fillDemo(role)}
                >
                  <Text style={[styles.demoChipText, { color: roleColors[role] }]}>{labels[role]}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 20, gap: 16 },
  closeBtn: { alignSelf: "flex-start", padding: 8 },
  logoSection: { alignItems: "center", gap: 8, paddingVertical: 12 },
  appName: { fontFamily: "Cairo_700Bold", fontSize: 28 },
  appSub: { fontFamily: "Cairo_400Regular", fontSize: 14 },
  card: { borderRadius: 24, padding: 24, gap: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, textAlign: "right" },
  field: { gap: 6 },
  fieldLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, textAlign: "right" },
  inputWrapper: { flexDirection: "row", alignItems: "center", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  input: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 15 },
  loginBtn: { borderRadius: 16, overflow: "hidden", marginTop: 4 },
  loginGrad: { paddingVertical: 16, alignItems: "center" },
  loginText: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#fff" },
  registerLink: { alignItems: "center", paddingVertical: 4 },
  registerLinkText: { fontFamily: "Cairo_600SemiBold", fontSize: 14 },
  demoSection: { borderRadius: 20, padding: 16, gap: 10 },
  demoTitle: { fontFamily: "Cairo_600SemiBold", fontSize: 13, textAlign: "center" },
  demoRow: { flexDirection: "row", justifyContent: "center", gap: 8, flexWrap: "wrap" },
  demoChip: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1 },
  demoChipText: { fontFamily: "Cairo_700Bold", fontSize: 13 },
});
