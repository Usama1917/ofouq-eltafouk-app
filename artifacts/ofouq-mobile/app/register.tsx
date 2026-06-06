import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import type { ImagePickerAsset } from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
import { type UserRole, useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { type ApiError, apiFetch } from "@/lib/api";
import { EGYPT_GOVERNORATES } from "@/lib/egyptGovernorates";
import { toEnglishDigits } from "@/lib/format";
import {
  createImageFormDataFile,
  logImageUploadDebug,
  pickImageFromLibrary,
} from "@/lib/imagePicker";
import { isSupportedProfileImageType } from "@/lib/media";

const ROLES: { id: UserRole; icon: string; color: string }[] = [
  { id: "student", icon: "book-open", color: "#3B82F6" },
  { id: "teacher", icon: "users", color: "#10B981" },
];

export default function RegisterScreen() {
  const { colors, resolvedScheme, strings, isRTL, textAlign, direction, rowDirection, alignStart } = usePreferences();
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
  const [governoratePickerOpen, setGovernoratePickerOpen] = useState(false);
  const [specialty, setSpecialty] = useState("");
  const [avatar, setAvatar] = useState<ImagePickerAsset | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function pickAvatar() {
    const result = await pickImageFromLibrary({
      source: "register-avatar",
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.82,
    });

    if (result.status === "denied") {
      Alert.alert(strings.register.photoPermissionTitle, strings.register.photoPermissionMessage);
      return;
    }

    if (result.status === "canceled") return;
    if (result.status === "error") {
      Alert.alert(strings.auth.errorTitle, strings.register.photoPermissionMessage);
      return;
    }

    const asset = result.asset;
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
    fd.append("avatar", createImageFormDataFile(avatar, "profile-photo.jpg") as any);
    logImageUploadDebug("register-avatar", "upload_start", avatar);
    try {
      const upload = await apiFetch<{ url: string }>("/api/auth/profile-photo/upload", {
        method: "POST",
        body: fd,
      });
      logImageUploadDebug("register-avatar", "upload_success", avatar);
      return upload.url;
    } catch (error) {
      logImageUploadDebug("register-avatar", "upload_error", avatar);
      throw error;
    }
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
      const apiError = err as ApiError;
      if (apiError.code === "auth/register_conflict") {
        const emailUsed = apiError.fields?.email === true;
        const phoneUsed = apiError.fields?.phone === true;
        const message = emailUsed && phoneUsed
          ? strings.register.emailAndPhoneAlreadyUsed
          : emailUsed
            ? strings.register.emailAlreadyUsed
            : phoneUsed
              ? strings.register.phoneAlreadyUsed
              : apiError.message || strings.register.failed;
        Alert.alert(strings.auth.errorTitle, message);
        return;
      }
      Alert.alert(strings.auth.errorTitle, err.message ?? strings.register.failed);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoginPromptPress = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/login");
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
          <Image
            source={require("../assets/images/login-educational-logo.png")}
            style={styles.brandLogo}
            contentFit="contain"
            accessibilityLabel={strings.common.appName}
          />
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
              <Pressable
                accessibilityRole="button"
                onPress={() => setGovernoratePickerOpen(true)}
                style={({ pressed }) => [
                  styles.inputWrapper,
                  styles.selectInput,
                  {
                    backgroundColor: colors.surfaceSecondary,
                    opacity: pressed ? 0.78 : 1,
                  },
                ]}
              >
                <Feather name="map-pin" size={18} color={colors.textTertiary} />
                <Text
                  style={[
                    styles.selectValue,
                    {
                      color: governorate ? colors.text : colors.textTertiary,
                      textAlign,
                      writingDirection: direction,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {governorate || strings.register.governoratePlaceholder}
                </Text>
                <Feather name="chevron-down" size={18} color={colors.textTertiary} />
              </Pressable>
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

            <Pressable style={styles.loginLink} onPress={handleLoginPromptPress}>
              <Text style={[styles.loginLinkText, { color: COLORS.primary }]}>
                {strings.register.loginPrompt}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={governoratePickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setGovernoratePickerOpen(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setGovernoratePickerOpen(false)} />
          <View
            style={[
              styles.governorateSheet,
              {
                backgroundColor: resolvedScheme === "dark" ? "rgba(28,28,30,0.98)" : "rgba(248,250,252,0.96)",
                borderColor: colors.border,
                paddingBottom: insets.bottom + 16,
              },
            ]}
          >
            <View style={[styles.sheetGrabber, { backgroundColor: colors.textTertiary }]} />
            <View style={styles.governorateSheetHeader}>
              <Pressable
                onPress={() => setGovernoratePickerOpen(false)}
                style={({ pressed }) => [
                  styles.governorateNavButton,
                  { opacity: pressed ? 0.58 : 1 },
                  isRTL ? styles.governorateNavButtonLeft : styles.governorateNavButtonRight,
                ]}
              >
                <Text style={[styles.governorateNavButtonText, { color: COLORS.primary, writingDirection: direction }]}>
                  {strings.common.cancel}
                </Text>
              </Pressable>
              <Text style={[styles.governorateSheetTitle, { color: colors.text, writingDirection: direction }]}>
                {strings.register.governorate}
              </Text>
            </View>

            <ScrollView
              style={styles.governorateList}
              contentContainerStyle={styles.governorateListContent}
              showsVerticalScrollIndicator={false}
            >
              {EGYPT_GOVERNORATES.map((item, index) => {
                const selected = governorate === item;
                const isLast = index === EGYPT_GOVERNORATES.length - 1;

                return (
                  <Pressable
                    key={item}
                    onPress={() => {
                      setGovernorate(item);
                      setGovernoratePickerOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.governorateOption,
                      index === 0 ? styles.governorateOptionFirst : null,
                      isLast ? styles.governorateOptionLast : null,
                      {
                        backgroundColor: selected
                          ? COLORS.primary + "10"
                          : pressed
                            ? colors.surfaceSecondary
                            : colors.surface,
                        borderBottomColor: isLast ? "transparent" : colors.border,
                        direction: "ltr",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.governorateOptionText,
                        {
                          color: selected ? COLORS.primary : colors.text,
                          textAlign: "right",
                          writingDirection: direction,
                        },
                      ]}
                    >
                      {item}
                    </Text>
                    {selected ? (
                      <Feather
                        name="check"
                        size={18}
                        color={COLORS.primary}
                        style={[
                          styles.governorateOptionCheck,
                          isRTL ? styles.governorateOptionCheckRtl : styles.governorateOptionCheckLtr,
                        ]}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 20, gap: 16 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  steps: { flexDirection: "row", gap: 6, alignItems: "center" },
  stepDot: { height: 6, width: 6, borderRadius: 3 },
  logoSection: { alignItems: "center", gap: 10 },
  brandLogo: { width: 250, height: 100 },
  cardTitle: { ...FONT.bold, fontSize: 24 },
  rolesGrid: { gap: 12 },
  roleCard: { borderRadius: 20, padding: 20, flexDirection: "row", alignItems: "center", gap: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2, position: "relative" },
  roleIcon: { width: 54, height: 54, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  roleLabel: { ...FONT.bold, fontSize: 17 },
  roleDesc: { ...FONT.regular, fontSize: 12 },
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
    ...FONT.bold,
    fontSize: 14,
  },
  photoHint: {
    ...FONT.regular,
    fontSize: 12,
    textAlign: "center",
  },
  field: { gap: 6 },
  fieldLabel: { ...FONT.semiBold, fontSize: 13, textAlign: "right" },
  inputWrapper: { flexDirection: "row", alignItems: "center", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  input: { flex: 1, ...FONT.regular, fontSize: 15 },
  selectInput: {
    minHeight: 50,
    flexDirection: "row",
  },
  selectValue: {
    flex: 1,
    ...FONT.regular,
    fontSize: 15,
  },
  nextBtn: { borderRadius: 16, overflow: "hidden", marginTop: 4 },
  nextGrad: { paddingVertical: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 10 },
  nextText: { ...FONT.bold, fontSize: 17, color: "#fff" },
  loginLink: { alignItems: "center", paddingVertical: 4 },
  loginLinkText: { ...FONT.semiBold, fontSize: 14 },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  governorateSheet: {
    maxHeight: "76%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 16,
    paddingTop: 9,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
  },
  sheetGrabber: {
    width: 38,
    height: 5,
    borderRadius: 999,
    alignSelf: "center",
    opacity: 0.34,
    marginBottom: 10,
  },
  governorateSheetHeader: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    marginBottom: 14,
    position: "relative",
  },
  governorateSheetTitle: {
    ...FONT.bold,
    fontSize: 16,
    lineHeight: 26,
    textAlign: "center",
  },
  governorateNavButton: {
    position: "absolute",
    minHeight: 38,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  governorateNavButtonLeft: {
    left: 0,
  },
  governorateNavButtonRight: {
    right: 0,
  },
  governorateNavButtonText: {
    ...FONT.semiBold,
    fontSize: 15,
  },
  governorateList: {
    maxHeight: 420,
    borderRadius: 18,
  },
  governorateListContent: {
    paddingBottom: 6,
  },
  governorateOption: {
    minHeight: 50,
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    justifyContent: "center",
    position: "relative",
  },
  governorateOptionFirst: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  governorateOptionLast: {
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  governorateOptionText: {
    position: "absolute",
    left: 48,
    right: 16,
    ...FONT.semiBold,
    fontSize: 14,
  },
  governorateOptionCheck: {
    position: "absolute",
    top: "50%",
    marginTop: -9,
  },
  governorateOptionCheckRtl: {
    left: 16,
  },
  governorateOptionCheckLtr: {
    right: 16,
  },
});
