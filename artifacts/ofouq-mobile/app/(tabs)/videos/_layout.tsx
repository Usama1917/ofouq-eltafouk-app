import { Stack } from "expo-router";
import { usePreferences } from "@/contexts/PreferencesContext";

export default function VisualLessonsLayout() {
  const { colors, strings } = usePreferences();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: "Cairo_700Bold", fontSize: 18 },
        headerBackTitle: strings.common.back,
        contentStyle: { backgroundColor: colors.background },
        headerTitleAlign: "center",
        animation: "slide_from_right",
      }}
    />
  );
}
