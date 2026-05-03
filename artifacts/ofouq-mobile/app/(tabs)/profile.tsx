import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
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

import { COLORS } from "@/constants/colors";
import { useAuth, type User } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { apiFetch } from "@/lib/api";
import { formatDate, toEnglishDigits } from "@/lib/format";
import { isSupportedProfileImageType, resolveMediaUrl } from "@/lib/media";

const ROLE_GRADIENTS: Record<string, [string, string]> = {
  student: ["#3B82F6", "#4F46E5"],
  teacher: ["#10B981", "#0F766E"],
  parent: ["#F59E0B", "#EA580C"],
  admin: ["#8B5CF6", "#6D28D9"],
  moderator: ["#8B5CF6", "#6D28D9"],
  owner: ["#F43F5E", "#DB2777"],
};

type ProfileForm = {
  name: string;
  phone: string;
  address: string;
  governorate: string;
  bio: string;
};

function formatJoinedDate(joinedAt: string | undefined, locale: string, prefix: string) {
  if (!joinedAt) return null;
  const formatted = formatDate(joinedAt, locale);
  return formatted ? `${prefix} ${formatted}` : null;
}

function FieldDisplay({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value?: string | null;
}) {
  const { colors, strings, textAlign, direction, rowDirection, alignStart } = usePreferences();
  return (
    <View
      style={[
        styles.infoTile,
        { backgroundColor: colors.surface, flexDirection: rowDirection, direction },
      ]}
    >
      <Feather name={icon} size={17} color={colors.textSecondary} />
      <View style={[styles.infoTextBlock, { alignItems: alignStart }]}>
        <Text style={[styles.infoLabel, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
          {label}
        </Text>
        <Text style={[styles.infoValue, { color: colors.text, textAlign, writingDirection: direction }]} numberOfLines={2}>
          {value ? toEnglishDigits(value) : strings.common.placeholderDash}
        </Text>
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const {
    colors,
    resolvedScheme,
    strings,
    isRTL,
    textAlign,
    direction,
    rowDirection,
    alignStart,
    alignEnd,
  } = usePreferences();
  const { user, token, logout, updateUser, isLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [form, setForm] = useState<ProfileForm>({
    name: "",
    phone: "",
    address: "",
    governorate: "",
    bio: "",
  });

  useEffect(() => {
    if (!user) return;
    setForm({
      name: user.name ?? "",
      phone: user.phone ?? "",
      address: user.address ?? "",
      governorate: user.governorate ?? "",
      bio: user.bio ?? "",
    });
  }, [user]);

  const roleKey = (user?.role ?? "student") as keyof typeof strings.roles;
  const roleLabel = strings.roles[roleKey] ?? strings.roles.student;
  const roleGradient = ROLE_GRADIENTS[user?.role ?? "student"] ?? ROLE_GRADIENTS.student;
  const joinedText = useMemo(
    () => formatJoinedDate(user?.joinedAt, strings.locale, strings.profile.joinedIn),
    [strings.locale, strings.profile.joinedIn, user?.joinedAt],
  );
  const avatarUri = resolveMediaUrl(user?.avatarUrl);

  async function handleAvatarPick() {
    if (!token) {
      router.push("/login");
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(strings.profile.photoPermissionTitle, strings.profile.photoPermissionMessage);
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
      Alert.alert(strings.auth.errorTitle, strings.profile.photoUnsupported);
      return;
    }
    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
      Alert.alert(strings.auth.errorTitle, strings.profile.photoTooLarge);
      return;
    }

    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append("avatar", {
        uri: asset.uri,
        name: asset.fileName ?? "profile-photo.jpg",
        type: asset.mimeType ?? "image/jpeg",
      } as any);
      const upload = await apiFetch<{ url: string }>("/api/auth/profile-photo/upload", {
        method: "POST",
        body: fd,
      });
      const updated = await apiFetch<User>("/api/auth/profile", {
        method: "PUT",
        token,
        body: JSON.stringify({ avatarUrl: upload.url }),
      });
      updateUser(updated);
    } catch (err) {
      Alert.alert(
        strings.profile.photoUploadError,
        err instanceof Error ? err.message : strings.profile.photoUploadError,
      );
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleSave() {
    if (!token) {
      router.push("/login");
      return;
    }
    setSaving(true);
    try {
      const updated = await apiFetch<User>("/api/auth/profile", {
        method: "PUT",
        token,
        body: JSON.stringify({
          name: toEnglishDigits(form.name),
          phone: toEnglishDigits(form.phone),
          address: toEnglishDigits(form.address),
          governorate: toEnglishDigits(form.governorate),
          bio: toEnglishDigits(form.bio),
        }),
      });
      updateUser(updated);
      setEditing(false);
    } catch (err) {
      Alert.alert(
        strings.profile.saveErrorTitle,
        err instanceof Error ? err.message : strings.profile.saveErrorMessage,
      );
    } finally {
      setSaving(false);
    }
  }

  function handleLogout() {
    Alert.alert(strings.profile.logoutTitle, strings.profile.logoutMessage, [
      { text: strings.common.cancel, style: "cancel" },
      {
        text: strings.profile.logoutAction,
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/login");
        },
      },
    ]);
  }

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingHorizontal: 24 }]}>
        <View style={[styles.guestCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.guestIcon}>
            <Feather name="user" size={30} color={COLORS.primary} />
          </View>
          <Text style={[styles.guestTitle, { color: colors.text, writingDirection: direction }]}>
            {strings.profile.guestTitle}
          </Text>
          <Text style={[styles.guestText, { color: colors.textSecondary, writingDirection: direction }]}>
            {strings.profile.guestText}
          </Text>
          <Pressable style={styles.loginButton} onPress={() => router.push("/login")}>
            <Text style={[styles.loginButtonText, { writingDirection: direction }]}>
              {strings.common.signIn}
            </Text>
          </Pressable>
        </View>
      </View>
    );
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
          paddingTop: insets.top + 20,
          paddingHorizontal: 18,
          paddingBottom: insets.bottom + 118,
          gap: 18,
        }}
      >
        <View style={[styles.headerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <LinearGradient
            colors={[roleGradient[0] + "12", roleGradient[1] + "08", "rgba(255,255,255,0)"]}
            start={{ x: isRTL ? 1 : 0, y: 0 }}
            end={{ x: isRTL ? 0 : 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.headerTop, { alignItems: alignEnd }]}>
            <Pressable
              onPress={handleLogout}
              style={[styles.logoutPill, { flexDirection: rowDirection, direction }]}
            >
              <Feather name="log-out" size={16} color={colors.textSecondary} />
              <Text style={[styles.logoutText, { color: colors.textSecondary, writingDirection: direction }]}>
                {strings.common.logoutShort}
              </Text>
            </Pressable>
          </View>

          <View
            style={[
              styles.profileHeaderRow,
              { flexDirection: rowDirection, direction },
            ]}
          >
            <Pressable
              onPress={handleAvatarPick}
              disabled={avatarUploading}
              style={({ pressed }) => [
                styles.avatarButton,
                { opacity: pressed || avatarUploading ? 0.78 : 1 },
              ]}
            >
              <LinearGradient colors={roleGradient} style={styles.avatar}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatarImage} contentFit="cover" />
                ) : (
                  <Text style={styles.avatarText}>{user.name?.charAt(0) ?? strings.settings.accountInitial}</Text>
                )}
                <View style={styles.avatarOverlay}>
                  {avatarUploading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Feather name="camera" size={15} color="#fff" />
                  )}
                </View>
              </LinearGradient>
            </Pressable>

            <View style={[styles.identityBlock, { alignItems: alignStart }]}>
              <Text
                style={[styles.userName, { color: colors.text, textAlign, writingDirection: direction }]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.78}
              >
                {toEnglishDigits(user.name)}
              </Text>
              <Text
                style={[styles.userEmail, { color: colors.textSecondary, textAlign, writingDirection: direction }]}
                numberOfLines={1}
              >
                {toEnglishDigits(user.email)}
              </Text>
              <View style={[styles.badgesRow, { flexDirection: rowDirection, justifyContent: alignStart, direction }]}>
                <View style={[styles.roleBadge, { backgroundColor: roleGradient[0] }]}>
                  <Text style={[styles.roleBadgeText, { writingDirection: direction }]}>{roleLabel}</Text>
                </View>
                {joinedText ? (
                  <View style={[styles.joinedBadge, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.joinedText, { color: colors.textSecondary, writingDirection: direction }]}>
                      {toEnglishDigits(joinedText)}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.cardHeader, { flexDirection: rowDirection, direction }]}>
            <View style={[styles.cardTitleRow, { flexDirection: rowDirection, direction }]}>
              <Feather name="user" size={19} color={COLORS.primary} />
              <Text style={[styles.cardTitle, { color: colors.text, textAlign, writingDirection: direction }]}>
                {strings.profile.personalInfo}
              </Text>
            </View>
            {!editing ? (
              <Pressable
                onPress={() => setEditing(true)}
                style={[styles.editButton, { flexDirection: rowDirection, direction }]}
              >
                <Feather name="edit-2" size={15} color={COLORS.primary} />
                <Text style={[styles.editText, { writingDirection: direction }]}>{strings.common.edit}</Text>
              </Pressable>
            ) : (
              <View style={[styles.editActions, { flexDirection: rowDirection, direction }]}>
                <Pressable onPress={() => setEditing(false)} style={styles.cancelButton} disabled={saving}>
                  <Text style={[styles.cancelText, { color: colors.textSecondary, writingDirection: direction }]}>
                    {strings.common.cancel}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleSave()}
                  style={[styles.saveButton, { flexDirection: rowDirection, direction }]}
                  disabled={saving}
                >
                  {saving ? <ActivityIndicator color="#fff" /> : <Feather name="save" size={15} color="#fff" />}
                  <Text style={[styles.saveText, { writingDirection: direction }]}>
                    {saving ? strings.common.saving : strings.common.save}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

          {editing ? (
            <View style={styles.formGrid}>
              {[
                { key: "name", label: strings.profile.fullName, icon: "user" },
                { key: "phone", label: strings.profile.phone, icon: "phone" },
                { key: "address", label: strings.profile.address, icon: "map-pin" },
                { key: "governorate", label: strings.profile.governorate, icon: "map-pin" },
              ].map((field) => (
                <View key={field.key} style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                    {field.label}
                  </Text>
                  <TextInput
                    value={toEnglishDigits(form[field.key as keyof ProfileForm])}
                    onChangeText={(value) =>
                      setForm((prev) => ({ ...prev, [field.key]: toEnglishDigits(value) }))
                    }
                    style={[
                      styles.input,
                      {
                        color: colors.text,
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                        writingDirection: direction,
                      },
                    ]}
                    placeholderTextColor={colors.textTertiary}
                    textAlign={textAlign}
                  />
                </View>
              ))}

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                  {strings.profile.bio}
                </Text>
                <TextInput
                  value={toEnglishDigits(form.bio)}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, bio: toEnglishDigits(value) }))}
                  multiline
                  style={[
                    styles.input,
                    styles.bioInput,
                    {
                      color: colors.text,
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      writingDirection: direction,
                    },
                  ]}
                  placeholderTextColor={colors.textTertiary}
                  textAlign={textAlign}
                  textAlignVertical="top"
                />
              </View>
            </View>
          ) : (
            <View style={styles.infoGrid}>
              <FieldDisplay icon="user" label={strings.profile.name} value={user.name} />
              <FieldDisplay icon="mail" label={strings.profile.email} value={user.email} />
              <FieldDisplay icon="phone" label={strings.profile.phone} value={user.phone} />
              <FieldDisplay icon="map-pin" label={strings.profile.address} value={user.address} />
              <FieldDisplay icon="map-pin" label={strings.profile.governorate} value={user.governorate} />
              {user.bio ? <FieldDisplay icon="file-text" label={strings.profile.bio} value={user.bio} /> : null}
            </View>
          )}
        </View>

        <View style={[styles.actionsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable
            onPress={() => router.push("/(tabs)/settings")}
            style={({ pressed }) => [
              styles.actionRow,
              {
                backgroundColor: pressed ? colors.surfaceSecondary : colors.surface,
                flexDirection: rowDirection,
                direction,
              },
            ]}
          >
            <View style={[styles.actionLeading, { flexDirection: rowDirection, direction }]}>
              <View style={styles.actionIcon}>
                <Feather name="settings" size={18} color={COLORS.primary} />
              </View>
              <View style={[styles.actionTextBlock, { alignItems: alignStart }]}>
                <Text style={[styles.actionTitle, { color: colors.text, textAlign, writingDirection: direction }]}>
                  {strings.profile.settings}
                </Text>
                <Text style={[styles.actionSubtitle, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                  {strings.profile.settingsSubtitle}
                </Text>
              </View>
            </View>
            <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={19} color={colors.textTertiary} />
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  guestCard: {
    width: "100%",
    borderRadius: 28,
    borderWidth: 1,
    padding: 26,
    alignItems: "center",
    gap: 12,
  },
  guestIcon: {
    width: 62,
    height: 62,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary + "10",
  },
  guestTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 24,
  },
  guestText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    lineHeight: 23,
    textAlign: "center",
  },
  loginButton: {
    marginTop: 6,
    minHeight: 50,
    borderRadius: 17,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  loginButtonText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: "#fff",
  },
  headerCard: {
    borderRadius: 30,
    borderWidth: 1,
    padding: 18,
    overflow: "hidden",
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.1,
    shadowRadius: 28,
  },
  headerTop: {
    marginBottom: 14,
  },
  logoutPill: {
    minHeight: 40,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
  },
  logoutText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
  },
  profileHeaderRow: {
    alignItems: "center",
    gap: 16,
  },
  avatarButton: {
    width: 92,
    height: 92,
    borderRadius: 46,
    flexShrink: 0,
  },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarOverlay: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: "#fff",
  },
  avatarText: {
    fontFamily: "Cairo_700Bold",
    color: "#fff",
    fontSize: 38,
  },
  identityBlock: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
    gap: 2,
  },
  userName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 26,
    lineHeight: 36,
    textAlign: "right",
    flexShrink: 1,
    maxWidth: "100%",
  },
  userEmail: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    textAlign: "right",
    flexShrink: 1,
    maxWidth: "100%",
  },
  badgesRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    flexWrap: "wrap",
    maxWidth: "100%",
  },
  roleBadge: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  roleBadgeText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    color: "#fff",
  },
  joinedBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  joinedText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 11,
  },
  infoCard: {
    borderRadius: 26,
    borderWidth: 1,
    padding: 18,
    gap: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  cardTitleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 18,
    textAlign: "right",
  },
  editButton: {
    minHeight: 38,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 6,
  },
  editText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: COLORS.primary,
  },
  editActions: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  cancelButton: { minHeight: 40, justifyContent: "center", paddingHorizontal: 6 },
  cancelText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
  },
  saveButton: {
    minHeight: 40,
    borderRadius: 14,
    paddingHorizontal: 12,
    backgroundColor: COLORS.primary,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
  },
  saveText: {
    fontFamily: "Cairo_700Bold",
    color: "#fff",
    fontSize: 12,
  },
  infoGrid: { gap: 10 },
  infoTile: {
    minHeight: 70,
    borderRadius: 18,
    padding: 13,
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: 11,
  },
  infoTextBlock: { flex: 1, alignItems: "flex-end" },
  infoLabel: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
    textAlign: "right",
  },
  infoValue: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
    marginTop: 2,
  },
  formGrid: { gap: 12 },
  inputGroup: { gap: 6 },
  inputLabel: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
    textAlign: "right",
  },
  input: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
  },
  bioInput: {
    minHeight: 92,
    paddingTop: 12,
  },
  actionsCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 12,
  },
  actionRow: {
    borderRadius: 18,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  actionLeading: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 12,
  },
  actionTextBlock: { flex: 1, alignItems: "flex-end" },
  actionTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
  },
  actionSubtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    textAlign: "right",
  },
  actionIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary + "10",
  },
});
