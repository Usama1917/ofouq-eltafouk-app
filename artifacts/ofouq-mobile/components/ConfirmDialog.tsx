import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { usePreferences } from "@/contexts/PreferencesContext";

export type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Red confirm button + red icon tint for irreversible/sign-out actions. */
  destructive?: boolean;
  icon?: keyof typeof Feather.glyphMap;
  onConfirm: () => void;
  onCancel: () => void;
};

// Themed confirmation dialog used instead of the native Alert so (a) the text aligns
// correctly in Arabic — title centered, body read from the right — and (b) it keeps
// the iOS "liquid glass" look via a blurred translucent card. Body alignment is keyed
// off the app direction (not a language-string compare) so a dropped RTL context in
// the Modal portal can't push Arabic to the left.
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive,
  icon,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { colors, direction, resolvedScheme } = usePreferences();
  const isDark = resolvedScheme === "dark";
  const isAndroid = Platform.OS === "android";

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <View style={[styles.overlay, { backgroundColor: isDark ? "rgba(0,0,0,0.5)" : "rgba(15,23,42,0.28)" }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />

        {/* Outer view carries the shadow (can't clip), inner clips the blur to the radius. */}
        <View style={styles.cardShadow}>
          <View style={[styles.card, { borderColor: isAndroid ? (isDark ? "rgba(255,255,255,0.10)" : "rgba(15,23,42,0.08)") : isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.6)" }]}>
            {isAndroid ? (
              // Android's BlurView is unreliable and shows the content through — use a fully
              // SOLID card instead (no transparency); the dimmed backdrop provides the depth.
              <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF" }]} />
            ) : (
              <>
                <BlurView intensity={70} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
                {/* Translucent wash over the blur for the frosted "liquid glass" body (iOS). */}
                <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "rgba(28,28,30,0.55)" : "rgba(250,250,252,0.55)" }]} />
              </>
            )}

            <View style={styles.content}>
              {icon ? (
                <View
                  style={[
                    styles.icon,
                    { backgroundColor: destructive ? "rgba(239,68,68,0.14)" : "rgba(37,99,235,0.14)" },
                  ]}
                >
                  <Feather name={icon} size={24} color={destructive ? COLORS.error : COLORS.primary} />
                </View>
              ) : null}

              {/* The content column is `alignItems:"stretch"`, so every text fills the
                  full card width WITHOUT relying on width:"100%" (which resolves
                  unreliably inside the Modal portal). Then textAlign pins each line:
                  title centered, body to the right in Arabic. */}
              <Text style={[styles.title, { color: colors.text, writingDirection: direction }]}>{title}</Text>
              <Text
                style={[styles.body, { color: colors.textSecondary, textAlign: "center", writingDirection: direction }]}
              >
                {message}
              </Text>

              <View style={styles.actions}>
                <Pressable
                  onPress={onCancel}
                  style={({ pressed }) => [
                    styles.button,
                    styles.cancelButton,
                    {
                      backgroundColor: pressed
                        ? isDark
                          ? "rgba(255,255,255,0.16)"
                          : "rgba(255,255,255,0.75)"
                        : isDark
                          ? "rgba(255,255,255,0.10)"
                          : "rgba(255,255,255,0.92)",
                      borderColor: isDark ? "rgba(255,255,255,0.18)" : "rgba(15,23,42,0.10)",
                    },
                  ]}
                >
                  <Text style={[styles.buttonText, { color: colors.text }]}>{cancelLabel}</Text>
                </Pressable>
                <Pressable
                  onPress={onConfirm}
                  style={({ pressed }) => [
                    styles.button,
                    { backgroundColor: destructive ? COLORS.error : COLORS.primary, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Text style={[styles.buttonText, { color: "#FFFFFF" }]}>{confirmLabel}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  cardShadow: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 30,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.22,
    shadowRadius: 30,
  },
  card: { borderRadius: 30, borderWidth: 1, overflow: "hidden" },
  // alignItems:"stretch" → children fill the full width by default (no width:"100%"
  // needed), which is the reliable way to get textAlign to show inside a Modal portal.
  content: { paddingTop: 24, paddingBottom: 18, paddingHorizontal: 22, alignItems: "stretch", gap: 12 },
  // The icon has a fixed size, so it must opt back into centering on its own.
  icon: { width: 56, height: 56, borderRadius: 20, alignSelf: "center", alignItems: "center", justifyContent: "center" },
  title: { ...FONT.bold, fontSize: 18, lineHeight: 28, textAlign: "center" },
  body: { ...FONT.regular, fontSize: 14, lineHeight: 23 },
  // Each action on its own full-width row (stacked), not side by side.
  actions: { width: "100%", flexDirection: "column", gap: 10, marginTop: 8 },
  button: { width: "100%", minHeight: 50, borderRadius: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  cancelButton: { borderWidth: 1 },
  buttonText: { ...FONT.bold, fontSize: 15, lineHeight: 22 },
});
