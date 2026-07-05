import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { FONT } from "@/constants/typography";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { ThemeGlassToggle } from "@/components/ThemeGlassToggle";
import {
  type AppLanguage,
  type AppThemePreference,
  usePreferences,
} from "@/contexts/PreferencesContext";

export default function GeneralSettingsScreen() {
  const {
    colors,
    resolvedScheme,
    themePreference,
    language,
    strings,
    isRTL,
    reduceMotion,
    textAlign,
    direction,
    rowDirection,
    alignStart,
    setLanguage,
    setThemePreference,
  } = usePreferences();
  const insets = useSafeAreaInsets();
  const englishHeaderDrop = isRTL ? 0 : 42;
  const headerOverlayHeight = insets.top + 104 + englishHeaderDrop;
  const headerTopPadding = insets.top + 34 + englishHeaderDrop;
  const isDark = resolvedScheme === "dark";
  const isSystemAppearance = themePreference === "system";
  const [languageDialogVisible, setLanguageDialogVisible] = React.useState(false);
  const [languageRestartPending, setLanguageRestartPending] = React.useState(false);
  const [pendingLanguage, setPendingLanguage] = React.useState<AppLanguage | null>(null);
  const themeMotion = React.useRef(new Animated.Value(isDark ? 1 : 0)).current;

  React.useEffect(() => {
    // review F-10: skip the cross-fade when the OS "reduce motion" setting is on —
    // snap the theme values to their target instead of animating between them.
    if (reduceMotion) {
      themeMotion.setValue(isDark ? 1 : 0);
      return;
    }
    Animated.timing(themeMotion, {
      toValue: isDark ? 1 : 0,
      duration: 280,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: false,
    }).start();
  }, [isDark, reduceMotion, themeMotion]);

  const lightGradientOpacity = themeMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const manualTheme = themePreference === "system" ? resolvedScheme : themePreference;
  const cardBackgroundColor = themeMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.light.card, COLORS.dark.card],
  });
  const surfaceSecondaryBackgroundColor = themeMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.light.surfaceSecondary, COLORS.dark.surfaceSecondary],
  });
  const borderColor = themeMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.light.border, COLORS.dark.border],
  });
  const textColor = themeMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.light.text, COLORS.dark.text],
  });
  const secondaryTextColor = themeMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.light.textSecondary, COLORS.dark.textSecondary],
  });
  const topBarVeilColor = themeMotion.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(248,251,255,0.92)", "rgba(0,0,0,0.92)"],
  });

  const languageOptions: Array<{
    value: AppLanguage;
    title: string;
    mark: string;
  }> = [
    { value: "ar", title: strings.settings.languages.ar, mark: "ع" },
    { value: "en", title: strings.settings.languages.en, mark: "E" },
  ];
  function handleLanguageChange(nextLanguage: AppLanguage) {
    const selectedLanguage = pendingLanguage ?? language;
    if (nextLanguage === selectedLanguage) return;

    void setLanguage(nextLanguage)
      .then(() => {
        setPendingLanguage(nextLanguage === language ? null : nextLanguage);
        setLanguageRestartPending(true);
        setLanguageDialogVisible(true);
      })
      .catch(() => undefined);
  }

  function handleSystemAppearanceChange(enabled: boolean) {
    const nextThemePreference = enabled ? "system" : resolvedScheme;
    if (nextThemePreference === themePreference) return;
    void setThemePreference(nextThemePreference).catch(() => undefined);
  }

  function handleManualThemeChange(nextThemePreference: Exclude<AppThemePreference, "system">) {
    if (isSystemAppearance || nextThemePreference === themePreference) return;
    void setThemePreference(nextThemePreference).catch(() => undefined);
  }

  const useDeviceSettingsLabel = (
    <View style={[styles.automaticTextBlock, { alignItems: isRTL ? "flex-end" : "flex-start" }]}>
      <Animated.Text
        style={[styles.automaticTitle, { color: textColor, textAlign, writingDirection: direction }]}
      >
        {strings.settings.themeUseDeviceSettings}
      </Animated.Text>
    </View>
  );

  const useDeviceSettingsSwitch = (
    <View style={styles.automaticSwitchSlot}>
      <Switch
        value={isSystemAppearance}
        onValueChange={handleSystemAppearanceChange}
        accessibilityRole="switch"
        accessibilityLabel={strings.settings.themeUseDeviceSettings}
        trackColor={{
          false: isDark ? "rgba(120,120,128,0.34)" : "rgba(120,120,128,0.24)",
          true: "#34C759",
        }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={isDark ? "rgba(120,120,128,0.34)" : "rgba(120,120,128,0.24)"}
        style={styles.automaticSwitch}
      />
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: lightGradientOpacity }]}>
        <LinearGradient
          colors={["#EEF5FF", "#F8FBFF", "#F5F2FF"]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: themeMotion }]}>
        <LinearGradient
          colors={["#000000", "#000000", "#000000"]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <View style={[styles.pageBackWrap, { top: insets.top + 12 }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={({ pressed }) => [
            styles.pageBackButton,
            { backgroundColor: pressed ? colors.surfaceSecondary : colors.card, borderColor: colors.border },
          ]}
          accessibilityRole="button"
          accessibilityLabel={strings.common.back}
        >
          <Feather name="arrow-left" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View
        style={[
          styles.topBar,
          {
            height: headerOverlayHeight,
            paddingTop: headerTopPadding,
            flexDirection: rowDirection,
            direction,
          },
        ]}
      >
        <BlurView
          intensity={isDark ? 62 : 92}
          tint={isDark ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: topBarVeilColor }]}
        />
        <View style={[styles.topBarContent, { paddingHorizontal: 18, flexDirection: rowDirection, direction }]}>
          <View
            style={[
              styles.titleIcon,
              isDark && {
                backgroundColor: COLORS.darkIconFrame.background,
                borderColor: COLORS.darkIconFrame.border,
              },
            ]}
          >
            <Feather
              name="sliders"
              size={25}
              color={isDark ? COLORS.darkIconFrame.foreground : COLORS.primary}
            />
          </View>
          <View style={[styles.titleBlock, { direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }]}>
            <Animated.Text style={[styles.title, { color: textColor, textAlign, writingDirection: direction }]}>
              {strings.settings.generalSettings}
            </Animated.Text>
            <Animated.Text
              style={[styles.subtitle, { color: secondaryTextColor, textAlign, writingDirection: direction }]}
            >
              {strings.settings.generalSettingsSubtitle}
            </Animated.Text>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: headerOverlayHeight + 18,
          paddingHorizontal: 18,
          paddingBottom: insets.bottom + 118,
          gap: 18,
        }}
      >
        <Animated.View
          style={[
            styles.sectionCard,
            {
              backgroundColor: cardBackgroundColor,
              borderColor,
              shadowColor: isDark ? "#000000" : "#1E3A8A",
              shadowOpacity: isDark ? 0.24 : 0.08,
            },
          ]}
        >
          <View style={[styles.sectionTitleRow, { alignSelf: alignStart, flexDirection: rowDirection, direction }]}>
            <View
              style={[
                styles.sectionIcon,
                isDark && {
                  backgroundColor: COLORS.darkIconFrame.background,
                  borderColor: COLORS.darkIconFrame.border,
                },
              ]}
            >
              <Feather name="globe" size={19} color={isDark ? COLORS.darkIconFrame.foreground : COLORS.primary} />
            </View>
            <Animated.Text style={[styles.sectionTitle, { color: textColor, textAlign, writingDirection: direction }]}>
              {strings.settings.languageSettings}
            </Animated.Text>
          </View>

          <View style={styles.optionStack}>
            {languageOptions.map((option) => {
              const selected = option.value === (pendingLanguage ?? language);

              return (
                <Pressable
                  key={option.value}
                  onPress={() => handleLanguageChange(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  style={({ pressed }) => [
                    styles.optionRow,
                    {
                      backgroundColor: selected
                        ? isDark
                          ? "rgba(37,99,235,0.24)"
                          : COLORS.primary + "12"
                        : pressed
                          ? colors.surfaceSecondary
                          : colors.surface,
                      borderColor: selected ? COLORS.primary + "88" : colors.border,
                      flexDirection: rowDirection,
                      direction,
                    },
                  ]}
                >
                  <View style={[styles.optionLeading, { flexDirection: rowDirection, direction }]}>
                    <View
                      style={[
                        styles.optionIcon,
                        selected && styles.optionIconSelected,
                        isDark && {
                          backgroundColor: selected ? COLORS.darkIconFrame.background : "rgba(255,255,255,0.07)",
                          borderColor: selected ? COLORS.darkIconFrame.border : "rgba(255,255,255,0.10)",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.languageIconText,
                          {
                            color: selected || isDark ? COLORS.darkIconFrame.foreground : COLORS.primary,
                            writingDirection: option.value === "ar" ? "rtl" : "ltr",
                          },
                        ]}
                      >
                        {option.mark}
                      </Text>
                    </View>
                    <View style={[styles.optionTextBlock, { direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }]}>
                      <Text style={[styles.optionTitle, { color: colors.text, textAlign, writingDirection: direction }]}>
                        {option.title}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.radio, selected && styles.radioActive]}>
                    {selected ? <View style={styles.radioDot} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {languageRestartPending ? (
            <Animated.Text
              style={[styles.restartNote, { color: secondaryTextColor, textAlign, writingDirection: direction }]}
            >
              {strings.settings.languageRestartInlineNote}
            </Animated.Text>
          ) : null}
        </Animated.View>

        <Animated.View
          style={[
            styles.sectionCard,
            {
              backgroundColor: cardBackgroundColor,
              borderColor,
              shadowColor: isDark ? "#000000" : "#1E3A8A",
              shadowOpacity: isDark ? 0.24 : 0.08,
            },
          ]}
        >
          <View style={[styles.sectionTitleRow, { alignSelf: alignStart, flexDirection: rowDirection, direction }]}>
            <View
              style={[
                styles.sectionIcon,
                isDark && {
                  backgroundColor: COLORS.darkIconFrame.background,
                  borderColor: COLORS.darkIconFrame.border,
                },
              ]}
            >
              <Feather name="sun" size={19} color={isDark ? COLORS.darkIconFrame.foreground : COLORS.primary} />
            </View>
            <Animated.Text style={[styles.sectionTitle, { color: textColor, textAlign, writingDirection: direction }]}>
              {strings.settings.appearance}
            </Animated.Text>
          </View>

          <Animated.View
            style={[
              styles.automaticRow,
              {
                backgroundColor: surfaceSecondaryBackgroundColor,
                borderColor,
                flexDirection: "row",
              },
            ]}
          >
            {isRTL ? useDeviceSettingsSwitch : useDeviceSettingsLabel}
            {isRTL ? useDeviceSettingsLabel : useDeviceSettingsSwitch}
          </Animated.View>

          <ThemeGlassToggle
            isDark={manualTheme === "dark"}
            disabled={isSystemAppearance}
            onToggle={() => handleManualThemeChange(manualTheme === "dark" ? "light" : "dark")}
            lightLabel={strings.settings.themeLight}
            darkLabel={strings.settings.themeDark}
            direction={direction}
            accessibilityLabel={strings.settings.appearance}
          />
        </Animated.View>
      </ScrollView>

      <Modal
        visible={languageDialogVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLanguageDialogVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                direction,
              },
            ]}
          >
            <View style={[styles.modalIcon, isDark && styles.modalIconDark]}>
              <Feather name="globe" size={22} color={isDark ? COLORS.darkIconFrame.foreground : COLORS.primary} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.text, writingDirection: direction }]}>
              {strings.settings.languageSettings}
            </Text>
            <Text style={[styles.modalMessage, { color: colors.textSecondary, writingDirection: direction }]}>
              {strings.settings.languageRestartMessage}
            </Text>
            <Pressable
              onPress={() => setLanguageDialogVisible(false)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.modalButton,
                { opacity: pressed ? 0.82 : 1 },
              ]}
            >
              <Text style={styles.modalButtonText}>{strings.common.ok}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    overflow: "hidden",
  },
  topBarContent: {
    zIndex: 1,
    width: "100%",
    flex: 1,
    alignItems: "center",
    gap: 13,
    paddingBottom: 14,
  },
  pageBackWrap: {
    position: "absolute",
    left: 18,
    zIndex: 20,
  },
  pageBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  titleIcon: {
    width: 56,
    height: 56,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.primary + "18",
    backgroundColor: COLORS.primary + "12",
  },
  titleBlock: { flex: 1, alignItems: "flex-end", justifyContent: "center" },
  title: {
    ...FONT.bold,
    fontSize: 27,
    lineHeight: 38,
    textAlign: "right",
  },
  subtitle: {
    ...FONT.regular,
    fontSize: 15,
    lineHeight: 24,
    textAlign: "right",
  },
  sectionCard: {
    borderRadius: 26,
    borderWidth: 1,
    padding: 12,
    gap: 12,
    shadowOffset: { width: 0, height: 14 },
    shadowRadius: 24,
  },
  sectionTitleRow: {
    alignItems: "center",
    gap: 8,
  },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.primary + "18",
    backgroundColor: COLORS.primary + "12",
  },
  sectionTitle: {
    ...FONT.bold,
    fontSize: 17,
    lineHeight: 28,
    textAlign: "right",
  },
  optionStack: {
    gap: 10,
  },
  optionRow: {
    minHeight: 64,
    borderRadius: 18,
    borderWidth: 1,
    padding: 10,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  optionLeading: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 12,
  },
  optionIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.primary + "18",
    backgroundColor: COLORS.primary + "10",
  },
  optionIconSelected: {
    backgroundColor: COLORS.primary + "18",
    borderColor: COLORS.primary + "24",
  },
  languageIconText: {
    ...FONT.extraBold,
    fontSize: 19,
    lineHeight: 24,
    textAlign: "center",
  },
  optionTextBlock: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  optionTitle: {
    ...FONT.bold,
    fontSize: 15,
    lineHeight: 25,
    textAlign: "right",
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: {
    borderColor: COLORS.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },
  restartNote: {
    ...FONT.medium,
    fontSize: 13,
    lineHeight: 22,
  },
  automaticRow: {
    height: 66,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 0,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  automaticTextBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  automaticTitle: {
    ...FONT.bold,
    fontSize: 16,
    lineHeight: 26,
  },
  automaticSwitch: {
    flexShrink: 0,
    alignSelf: "center",
  },
  automaticSwitchSlot: {
    width: 58,
    height: 46,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.56)",
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 26,
    borderWidth: 1,
    padding: 20,
    alignItems: "stretch",
    gap: 13,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.24,
    shadowRadius: 28,
  },
  modalIcon: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.primary + "18",
    backgroundColor: COLORS.primary + "12",
  },
  modalIconDark: {
    backgroundColor: COLORS.darkIconFrame.background,
    borderColor: COLORS.darkIconFrame.border,
  },
  modalTitle: {
    ...FONT.bold,
    fontSize: 18,
    lineHeight: 29,
    textAlign: "center",
  },
  modalMessage: {
    ...FONT.regular,
    fontSize: 15,
    lineHeight: 25,
    textAlign: "center",
  },
  modalButton: {
    minHeight: 48,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    backgroundColor: COLORS.primary,
  },
  modalButtonText: {
    ...FONT.bold,
    fontSize: 16,
    color: "#FFFFFF",
  },
});
