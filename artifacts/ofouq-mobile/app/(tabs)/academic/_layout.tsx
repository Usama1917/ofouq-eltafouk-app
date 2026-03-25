import { Stack } from "expo-router";
import { useColorScheme } from "react-native";
import { COLORS } from "@/constants/colors";

export default function AcademicLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: "Cairo_700Bold", fontSize: 18 },
        headerBackTitle: "رجوع",
        contentStyle: { backgroundColor: colors.background },
        headerTitleAlign: "center",
        animation: "slide_from_right",
      }}
    />
  );
}
