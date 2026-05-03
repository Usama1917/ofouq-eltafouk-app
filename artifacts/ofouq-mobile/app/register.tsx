import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
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
import { usePreferences } from "@/contexts/PreferencesContext";
import { apiFetch } from "@/lib/api";
import { toEnglishDigits } from "@/lib/format";
import { isSupportedProfileImageType } from "@/lib/media";

const ROLES: { id: UserRole; icon: string; color: string }[] = [
  { id: "student", icon: "book-open", color: "#3B82F6" },
  { id: "teacher", icon: "users", color: "#10B981" },
  { id: "parent", icon: "heart", color: "#F59E0B" },
];

export default function RegisterScreen() {
  const { colors, strings, isRTL, textAlign, direction, rowDirection, alignStart } = usePreferences();
  const insets = useSafeAreaInsets();
  const { register } = useAuth();
  const inputRowDirection = isRTL ? "row" : "row-reverse";

  const [step, setStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [avatar, setAvatar] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function pickAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(strings.register.photoPermissionTitle, strings.register.photoPermissionMessage);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.82,
    });

    if (result.canceled) return;
    const asset = result.assets[0];
    if (!isSupportedProfileImageType(asset.mimeType)) {
      Alert.alert(strings.auth.errorTitle, strings.register.photoUnsupported);
      return;
    }
    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
      Alert.alert(strings.auth.errorTitle, strings.register.photoTooLarge);
      return;
    }
    setAvatar(asset);
  }

  async function uploadAvatarIfNeeded() {
    if (!avatar) return undefined;
    const fd = new FormData();
    fd.append("avatar", {
      uri: avatar.uri,
      name: avatar.fileName ?? "profile-photo.jpg",
      type: avatar.mimeType ?? "image/jpeg",
    } as any);
    const upload = await apiFetch<{ url: string }>("/api/auth/profile-photo/upload", {
      method: "POST",
      body: fd,
    });
    return upload.url;
  }

  const handleNext = () => {
    if (step === 1 && !selectedRole) {
      Alert.alert(strings.auth.warningTitle, strings.register.missingRole);
      return;
    }
    setStep(2);
  };

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      Alert.alert(strings.auth.errorTitle, strings.register.missingRequired);
      return;
    }
    if (!selectedRole) return;
    setIsLoading(true);
    try {
      const avatarUrl = await uploadAvatarIfNeeded();
      await register({
        name: toEnglishDigits(name).trim(),
        email: toEnglishDigits(email).trim(),
        password: password.trim(),
        role: selectedRole,
        phone: toEnglishDigits(phone).trim() || undefined,
        governorate: toEnglishDigits(governorate).trim() || undefined,
        specialty: toEnglishDigits(specialty).trim() || undefined,
        avatarUrl,
      });
      router.replace("/(tabs)");
    } catch (err: any) {
      Alert.alert(strings.auth.errorTitle, err.message ?? strings.register.failed);
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
            <Feather
              name={step === 2 ? (isRTL ? "arrow-right" : "arrow-left") : "x"}
              size={22}
              color={colors.textSecondary}
            />
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
          <Text style={[styles.cardTitle, { color: colors.text, writingDirection: direction }]}>
            {step === 1 ? strings.register.chooseRole : strings.register.completeProfile}
          </Text>
        </View>

        {step === 1 ? (
          <View style={styles.rolesGrid}>
            {ROLES.map((role) => (
              <Pressable
                key={role.id}
                style={[
                  styles.roleCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: selectedRole === role.id ? role.color : "transparent",
                    flexDirection: rowDirection,
                    direction,
                  },
                  selectedRole === role.id && { borderWidth: 2 },
                ]}
                onPress={() => setSelectedRole(role.id)}
              >
                <View style={[styles.roleIcon, { backgroundColor: role.color + "22" }]}>
                  <Feather name={role.icon as any} size={28} color={role.color} />
                </View>
                <View style={{ flex: 1, alignItems: alignStart }}>
                  <Text style={[styles.roleLabel, { color: colors.text, textAlign, writingDirection: direction }]}>
                    {strings.register.roles[role.id as keyof typeof strings.register.roles].label}
                  </Text>
                  <Text style={[styles.roleDesc, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                    {strings.register.roles[role.id as keyof typeof strings.register.roles].desc}
                  </Text>
                </View>
                {selectedRole === role.id && (
                  <View
                    style={[
                      styles.selectedCheck,
                      { backgroundColor: role.color, left: isRTL ? 10 : undefined, right: isRTL ? undefined : 10 },
                    ]}
                  >
                    <Feather name="check" size={12} color="#fff" />
                  </View>
                )}
              </Pressable>
            ))}

            <Pressable
              style={styles.nextBtn}
              onPress={handleNext}
            >
              <LinearGradient
                colors={[COLORS.primary, COLORS.primaryDark]}
                style={[styles.nextGrad, { flexDirection: rowDirection, direction }]}
              >
                <Text style={[styles.nextText, { writingDirection: direction }]}>{strings.register.next}</Text>
                <Feather name={isRTL ? "arrow-left" : "arrow-right"} size={18} color="#fff" />
              </LinearGradient>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.photoSection}>
              <Pressable
                onPress={pickAvatar}
                style={({ pressed }) => [
                  styles.photoPicker,
                  {
                    opacity: pressed ? 0.82 : 1,
                    backgroundColor: COLORS.primary + "10",
                    borderColor: COLORS.primary + "28",
                  },
                ]}
              >
                {avatar ? (
                  <Image source={{ uri: avatar.uri }} style={styles.photoPreview} contentFit="cover" />
                ) : (
                  <Feather name="user" size={34} color={COLORS.primary} />
                )}
                <View style={styles.photoBadge}>
                  <Feather name="camera" size={14} color="#fff" />
                </View>
              </Pressable>
              <Text style={[styles.photoTitle, { color: colors.text, writingDirection: direction }]}>
                {strings.register.profilePhoto}
              </Text>
              <Text style={[styles.photoHint, { color: colors.textSecondary, writingDirection: direction }]}>
                {avatar ? strings.register.changePhoto : strings.register.photoOptional}
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                {strings.register.fullName}
              </Text>
              <View style={[styles.inputWrapper, { backgroundColor: colors.surfaceSecondary, flexDirection: inputRowDirection }]}>
                <TextInput
                  style={[styles.input, { color: colors.text, writingDirection: direction }]}
                  placeholder={strings.register.fullNamePlaceholder}
                  placeholderTextColor={colors.textTertiary}
                  value={toEnglishDigits(name)}
                  onChangeText={(value) => setName(toEnglishDigits(value))}
                  textAlign={textAlign}
                />
                <Feather name="user" size={18} color={colors.textTertiary} />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                {strings.register.email}
              </Text>
              <View style={[styles.inputWrapper, { backgroundColor: colors.surfaceSecondary, flexDirection: inputRowDirection }]}>
                <TextInput
                  style={[styles.input, { color: colors.text, writingDirection: direction }]}
                  placeholder="example@email.com"
                  placeholderTextColor={colors.textTertiary}
                  value={toEnglishDigits(email)}
                  onChangeText={(value) => setEmail(toEnglishDigits(value))}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  textAlign={textAlign}
                />
                <Feather name="mail" size={18} color={colors.textTertiary} />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                {strings.register.password}
              </Text>
              <View style={[styles.inputWrapper, { backgroundColor: colors.surfaceSecondary, flexDirection: inputRowDirection }]}>
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

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                {strings.register.phone}
              </Text>
              <View style={[styles.inputWrapper, { backgroundColor: colors.surfaceSecondary, flexDirection: inputRowDirection }]}>
                <TextInput
                  style={[styles.input, { color: colors.text, writingDirection: direction }]}
                  placeholder="01xxxxxxxxx"
                  placeholderTextColor={colors.textTertiary}
                  value={toEnglishDigits(phone)}
                  onChangeText={(value) => setPhone(toEnglishDigits(value))}
                  keyboardType="phone-pad"
                  textAlign={textAlign}
                />
                <Feather name="phone" size={18} color={colors.textTertiary} />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                {strings.register.governorate}
              </Text>
              <View style={[styles.inputWrapper, { backgroundColor: colors.surfaceSecondary, flexDirection: inputRowDirection }]}>
                <TextInput
                  style={[styles.input, { color: colors.text, writingDirection: direction }]}
                  placeholder={strings.register.governoratePlaceholder}
                  placeholderTextColor={colors.textTertiary}
                  value={toEnglishDigits(governorate)}
                  onChangeText={(value) => setGovernorate(toEnglishDigits(value))}
                  textAlign={textAlign}
                />
                <Feather name="map-pin" size={18} color={colors.textTertiary} />
              </View>
            </View>

            {selectedRole === "teacher" && (
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                  {strings.register.specialty}
                </Text>
                <View style={[styles.inputWrapper, { backgroundColor: colors.surfaceSecondary, flexDirection: inputRowDirection }]}>
                  <TextInput
                    style={[styles.input, { color: colors.text, writingDirection: direction }]}
                    placeholder={strings.register.specialtyPlaceholder}
                    placeholderTextColor={colors.textTertiary}
                    value={toEnglishDigits(specialty)}
                    onChangeText={(value) => setSpecialty(toEnglishDigits(value))}
                    textAlign={textAlign}
                  />
                  <Feather name="star" size={18} color={colors.textTertiary} />
                </View>
              </View>
            )}

            <Pressable style={styles.nextBtn} onPress={handleRegister} disabled={isLoading}>
              <LinearGradient
                colors={[COLORS.primary, COLORS.primaryDark]}
                style={[styles.nextGrad, { flexDirection: rowDirection, direction }]}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={[styles.nextText, { writingDirection: direction }]}>
                      {strings.register.createAccount}
                    </Text>
                    <Feather name="user-check" size={18} color="#fff" />
                  </>
                )}
              </LinearGradient>
            </Pressable>

            <Pressable style={styles.loginLink} onPress={() => router.push("/login")}>
              <Text style={[styles.loginLinkText, { color: COLORS.primary }]}>
                {strings.register.loginPrompt}
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
  selectedCheck: { position: "absolute", top: 10, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: 24, padding: 24, gap: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  photoSection: { alignItems: "center", gap: 5, paddingBottom: 4 },
  photoPicker: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  photoPreview: {
    width: "100%",
    height: "100%",
  },
  photoBadge: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: "#fff",
  },
  photoTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
  },
  photoHint: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    textAlign: "center",
  },
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
