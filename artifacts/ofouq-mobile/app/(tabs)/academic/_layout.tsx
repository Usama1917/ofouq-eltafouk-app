import { Stack } from "expo-router";
import { FONT } from "@/constants/typography";
import { usePreferences } from "@/contexts/PreferencesContext";

export default function AcademicLayout() {
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
        animation: "slide_from_right",
      }}
    />
  );
}
