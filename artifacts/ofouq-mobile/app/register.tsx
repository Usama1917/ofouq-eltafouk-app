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
import { type UserRole, useAuth } from "@/contexts/AuthContext";
import { useAppTheme } from "@/contexts/ThemeContext";

const ROLES: { id: UserRole; label: string; icon: string; color: string; desc: string }[] = [
  { id: "student", label: "طالب", icon: "book-open", color: "#3B82F6", desc: "أتعلم وأطور مهاراتي" },
  { id: "teacher", label: "معلم", icon: "users", color: "#10B981", desc: "أقدّم المحتوى التعليمي" },
  { id: "parent", label: "ولي أمر", icon: "heart", color: "#F59E0B", desc: "أتابع تقدم ابني" },
];

export default function RegisterScreen() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { register } = useAuth();

  const [step, setStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleNext = () => {
    if (step === 1 && !selectedRole) {
      Alert.alert("تنبيه", "يرجى اختيار نوع الحساب");
      return;
    }
    setStep(2);
  };

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      Alert.alert("خطأ", "يرجى ملء جميع الحقول المطلوبة");
      return;
    }
    if (!selectedRole) return;
    setIsLoading(true);
    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        password: password.trim(),
        role: selectedRole,
        phone: phone.trim() || undefined,
        governorate: governorate.trim() || undefined,
        specialty: specialty.trim() || undefined,
      });
      router.replace("/(tabs)");
    } catch (err: any) {
      Alert.alert("خطأ", err.message ?? "فشل إنشاء الحساب");
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
        <View style={styles.topBar}>
          <Pressable onPress={() => (step === 2 ? setStep(1) : router.back())}>
            <Feather name={step === 2 ? "arrow-right" : "x"} size={22} color={colors.textSecondary} />
          </Pressable>
          <View style={styles.steps}>
            {[1, 2].map((s) => (
              <View
                key={s}
                style={[
                  styles.stepDot,
                  s === step && { backgroundColor: COLORS.primary, width: 24 },
                  s !== step && { backgroundColor: colors.border },
                ]}
              />
            ))}
          </View>
          <View style={{ width: 22 }} />
        </View>

        <View style={styles.logoSection}>
          <Logo size={60} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            {step === 1 ? "اختر نوع حسابك" : "أكمل بياناتك"}
          </Text>
        </View>

        {step === 1 ? (
          <View style={styles.rolesGrid}>
            {ROLES.map((role) => (
              <Pressable
                key={role.id}
                style={[
                  styles.roleCard,
                  { backgroundColor: colors.surface, borderColor: selectedRole === role.id ? role.color : "transparent" },
                  selectedRole === role.id && { borderWidth: 2 },
                ]}
                onPress={() => setSelectedRole(role.id)}
              >
                <View style={[styles.roleIcon, { backgroundColor: role.color + "22" }]}>
                  <Feather name={role.icon as any} size={28} color={role.color} />
                </View>
                <Text style={[styles.roleLabel, { color: colors.text }]}>{role.label}</Text>
                <Text style={[styles.roleDesc, { color: colors.textSecondary }]}>{role.desc}</Text>
                {selectedRole === role.id && (
                  <View style={[styles.selectedCheck, { backgroundColor: role.color }]}>
                    <Feather name="check" size={12} color="#fff" />
                  </View>
                )}
              </Pressable>
            ))}

            <Pressable
              style={styles.nextBtn}
              onPress={handleNext}
            >
              <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.nextGrad}>
                <Text style={styles.nextText}>التالي</Text>
                <Feather name="arrow-left" size={18} color="#fff" />
              </LinearGradient>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>الاسم الكامل *</Text>
              <View style={[styles.inputWrapper, { backgroundColor: colors.surfaceSecondary }]}>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="الاسم الكامل"
                  placeholderTextColor={colors.textTertiary}
                  value={name}
                  onChangeText={setName}
                  textAlign="right"
                />
                <Feather name="user" size={18} color={colors.textTertiary} />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>البريد الإلكتروني *</Text>
              <View style={[styles.inputWrapper, { backgroundColor: colors.surfaceSecondary }]}>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="example@email.com"
                  placeholderTextColor={colors.textTertiary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  textAlign="right"
                />
                <Feather name="mail" size={18} color={colors.textTertiary} />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>كلمة المرور *</Text>
              <View style={[styles.inputWrapper, { backgroundColor: colors.surfaceSecondary }]}>
                <Pressable onPress={() => setShowPassword(!showPassword)}>
                  <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={colors.textTertiary} />
                </Pressable>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textTertiary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  textAlign="right"
                />
                <Feather name="lock" size={18} color={colors.textTertiary} />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>رقم الهاتف</Text>
              <View style={[styles.inputWrapper, { backgroundColor: colors.surfaceSecondary }]}>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="01xxxxxxxxx"
                  placeholderTextColor={colors.textTertiary}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  textAlign="right"
                />
                <Feather name="phone" size={18} color={colors.textTertiary} />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>المحافظة</Text>
              <View style={[styles.inputWrapper, { backgroundColor: colors.surfaceSecondary }]}>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="مثال: القاهرة"
                  placeholderTextColor={colors.textTertiary}
                  value={governorate}
                  onChangeText={setGovernorate}
                  textAlign="right"
                />
                <Feather name="map-pin" size={18} color={colors.textTertiary} />
              </View>
            </View>

            {selectedRole === "teacher" && (
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>التخصص</Text>
                <View style={[styles.inputWrapper, { backgroundColor: colors.surfaceSecondary }]}>
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="مثال: رياضيات"
                    placeholderTextColor={colors.textTertiary}
                    value={specialty}
                    onChangeText={setSpecialty}
                    textAlign="right"
                  />
                  <Feather name="star" size={18} color={colors.textTertiary} />
                </View>
              </View>
            )}

            <Pressable style={styles.nextBtn} onPress={handleRegister} disabled={isLoading}>
              <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.nextGrad}>
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={styles.nextText}>إنشاء الحساب</Text>
                    <Feather name="user-check" size={18} color="#fff" />
                  </>
                )}
              </LinearGradient>
            </Pressable>

            <Pressable style={styles.loginLink} onPress={() => router.push("/login")}>
              <Text style={[styles.loginLinkText, { color: COLORS.primary }]}>
                لديك حساب؟ سجّل دخولك
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 20, gap: 16 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  steps: { flexDirection: "row", gap: 6, alignItems: "center" },
  stepDot: { height: 6, width: 6, borderRadius: 3 },
  logoSection: { alignItems: "center", gap: 10 },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 24 },
  rolesGrid: { gap: 12 },
  roleCard: { borderRadius: 20, padding: 20, flexDirection: "row", alignItems: "center", gap: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2, position: "relative" },
  roleIcon: { width: 54, height: 54, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  roleLabel: { fontFamily: "Cairo_700Bold", fontSize: 17 },
  roleDesc: { fontFamily: "Cairo_400Regular", fontSize: 12 },
  selectedCheck: { position: "absolute", top: 10, left: 10, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: 24, padding: 24, gap: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  field: { gap: 6 },
  fieldLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, textAlign: "right" },
  inputWrapper: { flexDirection: "row", alignItems: "center", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  input: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 15 },
  nextBtn: { borderRadius: 16, overflow: "hidden", marginTop: 4 },
  nextGrad: { paddingVertical: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 10 },
  nextText: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#fff" },
  loginLink: { alignItems: "center", paddingVertical: 4 },
  loginLinkText: { fontFamily: "Cairo_600SemiBold", fontSize: 14 },
});
