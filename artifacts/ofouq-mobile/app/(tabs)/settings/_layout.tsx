import { Stack } from "expo-router";
import { FONT } from "@/constants/typography";
import { usePreferences } from "@/contexts/PreferencesContext";

export default function SettingsLayout() {
  const { colors, strings } = usePreferences();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { ...FONT.bold, fontSize: 18 },
        headerBackTitle: strings.common.back,
        contentStyle: { backgroundColor: colors.background },
        headerTitleAlign: "center",
        // Open: new screen enters from the right and slides left (right→left).
        // Close: the screen slides back out toward the right.
        animation: "slide_from_right",
      }}
    />
  );
}
