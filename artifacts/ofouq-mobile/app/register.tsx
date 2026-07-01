import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import type { ImagePickerAsset } from "expo-image-picker";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { type ApiError, apiFetch } from "@/lib/api";
import { isAllowedEmailDomain, isValidEmail, isValidPhone, PASSWORD_MIN_LENGTH } from "@/lib/authValidation";
import { EGYPT_GOVERNORATES, governorateLabel } from "@/lib/egyptGovernorates";
import { FONT } from "@/constants/typography";
import { toEnglishDigits } from "@/lib/format";
import {
  createImageFormDataFile,
  logImageUploadDebug,
  pickImageFromLibrary,
} from "@/lib/imagePicker";
import { isSupportedProfileImageType } from "@/lib/media";

type FieldErrors = {
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
};

export default function RegisterScreen() {
  const { colors, resolvedScheme, strings, isRTL, textAlign, direction, language } = usePreferences();
  const insets = useSafeAreaInsets();
  const { register } = useAuth();
  // Physical placement inside the modal (see AuthTextField for the rationale).
  const rowFlex = isRTL ? "row-reverse" : "row";

  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [governoratePickerOpen, setGovernoratePickerOpen] = useState(false);
  const [avatar, setAvatar] = useState<ImagePickerAsset | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const clearError = (field: keyof FieldErrors) => {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
    if (formError) setFormError(null);
  };

  async function pickAvatar() {
    const result = await pickImageFromLibrary({
      source: "register-avatar",
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.82,
    });
    if (result.status === "denied") {
      setFormError(strings.register.photoPermissionMessage);
      return;
    }
    if (result.status === "canceled") return;
    if (result.status === "error") {
      setFormError(strings.register.photoPermissionMessage);
      return;
    }
    const asset = result.asset;
    if (!isSupportedProfileImageType(asset.mimeType)) {
      setFormError(strings.register.photoUnsupported);
      return;
    }
    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
      setFormError(strings.register.photoTooLarge);
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

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    const trimmedName = toEnglishDigits(name).trim();
    const trimmedEmail = toEnglishDigits(email).trim();
    const trimmedPhone = toEnglishDigits(phone).trim();

    if (!trimmedName) next.name = strings.register.nameRequired;

    if (!trimmedEmail) next.email = strings.register.emailRequired;
    else if (!isValidEmail(trimmedEmail)) next.email = strings.register.emailInvalid;
    else if (!isAllowedEmailDomain(trimmedEmail)) next.email = strings.register.emailDomainNotAllowed;

    if (!trimmedPhone) next.phone = strings.register.phoneRequired;
    else if (!isValidPhone(trimmedPhone)) next.phone = strings.register.phoneInvalid;

    if (!password) next.password = strings.register.passwordRequired;
    else if (password.length < PASSWORD_MIN_LENGTH) next.password = strings.register.passwordTooShort;

    if (!confirmPassword) next.confirmPassword = strings.register.confirmRequired;
    else if (confirmPassword !== password) next.confirmPassword = strings.register.passwordMismatch;

    return next;
  }

  const handleRegister = async () => {
    const nextErrors = validate();
    setErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length > 0) return;

    setIsLoading(true);
    try {
      const avatarUrl = await uploadAvatarIfNeeded();
      await register({
        name: toEnglishDigits(name).trim(),
        email: toEnglishDigits(email).trim(),
        password,
        role: "student",
        phone: toEnglishDigits(phone).trim() || undefined,
        governorate: toEnglishDigits(governorate).trim() || undefined,
        avatarUrl,
      });
      router.replace("/(tabs)");
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.code === "auth/register_conflict") {
        const emailUsed = apiError.fields?.email === true;
        const phoneUsed = apiError.fields?.phone === true;
        setErrors((prev) => ({
          ...prev,
          email: emailUsed ? strings.register.emailExists : prev.email,
          phone: phoneUsed ? strings.register.phoneExists : prev.phone,
        }));
        setFormError(
          emailUsed && phoneUsed
            ? `${strings.register.emailExists} • ${strings.register.phoneExists}`
            : emailUsed
              ? strings.register.emailExists
              : phoneUsed
                ? strings.register.phoneExists
                : apiError.message || strings.register.failed,
        );
        return;
      }
      setFormError(apiError.message || strings.register.failed);
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
    <AuthScreenLayout
      title={strings.register.title}
      subtitle={strings.register.subtitle}
      onClose={() => router.back()}
      closeAccessibilityLabel={strings.common.close}
      footer={
        <AuthFooterLink
          prompt={strings.register.haveAccount}
          action={strings.register.loginLink}
          onPress={handleLoginPromptPress}
        />
      }
    >
      <AuthCard>
        <View style={styles.photoSection}>
          <Pressable
            onPress={pickAvatar}
            accessibilityRole="button"
            accessibilityLabel={strings.register.profilePhoto}
            style={({ pressed }) => [
              styles.photoPicker,
              { opacity: pressed ? 0.82 : 1, backgroundColor: COLORS.primary + "10", borderColor: COLORS.primary + "28" },
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
          <Text style={[styles.photoHint, { color: colors.textSecondary, writingDirection: direction }]}>
            {avatar ? strings.register.changePhoto : strings.register.photoOptional}
          </Text>
        </View>

        <AuthErrorBanner message={formError} />

        <AuthTextField
          label={strings.register.fullName}
          icon="user"
          value={toEnglishDigits(name)}
          onChangeText={(value) => {
            setName(toEnglishDigits(value));
            clearError("name");
          }}
          placeholder={strings.register.fullNamePlaceholder}
          autoCapitalize="words"
          returnKeyType="next"
          error={errors.name}
          onSubmitEditing={() => emailRef.current?.focus()}
          submitBehavior="submit"
        />

        <AuthTextField
          ref={emailRef}
          label={strings.register.email}
          icon="mail"
          value={toEnglishDigits(email)}
          onChangeText={(value) => {
            setEmail(toEnglishDigits(value));
            clearError("email");
          }}
          placeholder="example@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          error={errors.email}
          onSubmitEditing={() => phoneRef.current?.focus()}
          submitBehavior="submit"
        />

        <AuthTextField
          ref={phoneRef}
          label={`${strings.register.phone} *`}
          icon="phone"
          value={toEnglishDigits(phone)}
          onChangeText={(value) => {
            setPhone(toEnglishDigits(value));
            clearError("phone");
          }}
          placeholder={strings.register.phonePlaceholder}
          keyboardType="phone-pad"
          returnKeyType="next"
          error={errors.phone}
          onSubmitEditing={() => passwordRef.current?.focus()}
          submitBehavior="submit"
        />

        {/* Governorate picker (optional) */}
        <View style={styles.field}>
          <Text style={[styles.selectLabel, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
            {strings.register.governorate}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.register.governorate}
            onPress={() => setGovernoratePickerOpen(true)}
            style={({ pressed }) => [
              styles.selectInput,
              { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, flexDirection: rowFlex, opacity: pressed ? 0.78 : 1 },
            ]}
          >
            <Feather name="map-pin" size={18} color={colors.textTertiary} />
            <Text
              style={[styles.selectValue, { color: governorate ? colors.text : colors.textTertiary, textAlign, writingDirection: direction }]}
              numberOfLines={1}
            >
              {governorate ? governorateLabel(governorate, language) : strings.register.governoratePlaceholder}
            </Text>
            <Feather name="chevron-down" size={18} color={colors.textTertiary} />
          </Pressable>
        </View>

        <AuthPasswordField
          ref={passwordRef}
          label={strings.register.password}
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            clearError("password");
          }}
          placeholder={strings.auth.passwordPlaceholder}
          autoComplete="password-new"
          returnKeyType="next"
          error={errors.password}
          onSubmitEditing={() => confirmRef.current?.focus()}
          submitBehavior="submit"
        />

        <AuthPasswordField
          ref={confirmRef}
          label={strings.register.confirmPassword}
          value={confirmPassword}
          onChangeText={(value) => {
            setConfirmPassword(value);
            clearError("confirmPassword");
          }}
          placeholder={strings.register.confirmPasswordPlaceholder}
          autoComplete="password-new"
          returnKeyType="done"
          error={errors.confirmPassword}
          onSubmitEditing={handleRegister}
        />

        <AuthPrimaryButton
          label={strings.register.createButton}
          onPress={handleRegister}
          loading={isLoading}
          icon="user-check"
        />
      </AuthCard>

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
                const selected = governorate === item.value;
                const isLast = index === EGYPT_GOVERNORATES.length - 1;
                return (
                  <Pressable
                    key={item.value}
                    onPress={() => {
                      setGovernorate(item.value);
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
                      style={[styles.governorateOptionText, { color: selected ? COLORS.primary : colors.text, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}
                    >
                      {governorateLabel(item.value, language)}
                    </Text>
                    {selected ? (
                      <Feather
                        name="check"
                        size={18}
                        color={COLORS.primary}
                        style={[styles.governorateOptionCheck, isRTL ? styles.governorateOptionCheckRtl : styles.governorateOptionCheckLtr]}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  photoSection: { alignItems: "center", gap: 6, paddingBottom: 2 },
  photoPicker: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  photoPreview: { width: "100%", height: "100%" },
  photoBadge: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: "#fff",
  },
  photoHint: { ...FONT.regular, fontSize: 12, textAlign: "center" },
  field: { direction: "ltr", gap: 7, alignSelf: "stretch", width: "100%" },
  selectLabel: { ...FONT.semiBold, fontSize: 13, alignSelf: "stretch", width: "100%" },
  selectInput: {
    alignItems: "center",
    alignSelf: "stretch",
    width: "100%",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  selectValue: { flex: 1, ...FONT.regular, fontSize: 15 },
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
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
  sheetGrabber: { width: 38, height: 5, borderRadius: 999, alignSelf: "center", opacity: 0.34, marginBottom: 10 },
  governorateSheetHeader: { alignItems: "center", justifyContent: "center", minHeight: 44, marginBottom: 14, position: "relative" },
  governorateSheetTitle: { ...FONT.bold, fontSize: 16, lineHeight: 26, textAlign: "center" },
  governorateNavButton: { position: "absolute", minHeight: 38, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  governorateNavButtonLeft: { left: 0 },
  governorateNavButtonRight: { right: 0 },
  governorateNavButtonText: { ...FONT.semiBold, fontSize: 15 },
  governorateList: { maxHeight: 420, borderRadius: 18 },
  governorateListContent: { paddingBottom: 6 },
  governorateOption: { minHeight: 50, borderBottomWidth: 1, paddingHorizontal: 16, justifyContent: "center", position: "relative" },
  governorateOptionFirst: { borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  governorateOptionLast: { borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  governorateOptionText: { position: "absolute", left: 48, right: 16, ...FONT.semiBold, fontSize: 14 },
  governorateOptionCheck: { position: "absolute", top: "50%", marginTop: -9 },
  governorateOptionCheckRtl: { left: 16 },
  governorateOptionCheckLtr: { right: 16 },
});
