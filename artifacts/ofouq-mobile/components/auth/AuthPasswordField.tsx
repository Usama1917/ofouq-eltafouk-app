import { Feather } from "@expo/vector-icons";
import React, { forwardRef, useState } from "react";
import { Pressable, StyleSheet, type TextInput } from "react-native";

import { COLORS } from "@/constants/colors";
import { usePreferences } from "@/contexts/PreferencesContext";
import { AuthTextField, type AuthTextFieldProps } from "@/components/auth/AuthTextField";

type AuthPasswordFieldProps = Omit<AuthTextFieldProps, "trailingAccessory" | "secureTextEntry" | "icon"> & {
  icon?: AuthTextFieldProps["icon"];
};

/** Password input with an accessible show/hide toggle that respects RTL/LTR placement. */
export const AuthPasswordField = forwardRef<TextInput, AuthPasswordFieldProps>(
  function AuthPasswordField({ icon = "lock", error, ...props }, ref) {
    const { colors, strings } = usePreferences();
    const [visible, setVisible] = useState(false);

    return (
      <AuthTextField
        ref={ref}
        icon={icon}
        error={error}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="password"
        trailingAccessory={
          <Pressable
            onPress={() => setVisible((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={visible ? strings.auth.hidePassword : strings.auth.showPassword}
            hitSlop={10}
            style={styles.toggle}
          >
            <Feather
              name={visible ? "eye-off" : "eye"}
              size={18}
              color={error ? COLORS.error : colors.textTertiary}
            />
          </Pressable>
        }
        {...props}
      />
    );
  },
);

const styles = StyleSheet.create({
  toggle: { padding: 2 },
});
