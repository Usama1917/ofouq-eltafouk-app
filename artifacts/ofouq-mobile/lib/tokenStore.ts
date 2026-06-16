import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// review F-08: the 30-day session token is stored in the OS secure enclave
// (Keychain on iOS / Keystore on Android) instead of plaintext AsyncStorage, so a
// stolen device / backup can't read a long-lived bearer token. SecureStore has no
// web implementation, so web (react-native-web) falls back to AsyncStorage.
const TOKEN_KEY = "ofouq_token";
const canUseSecureStore = Platform.OS === "ios" || Platform.OS === "android";

export async function getStoredToken(): Promise<string | null> {
  if (!canUseSecureStore) {
    return AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
  }
  try {
    const secure = await SecureStore.getItemAsync(TOKEN_KEY);
    if (secure) return secure;
    // One-time migration from an older AsyncStorage-based build.
    const legacy = await AsyncStorage.getItem(TOKEN_KEY);
    if (legacy) {
      await SecureStore.setItemAsync(TOKEN_KEY, legacy);
      await AsyncStorage.removeItem(TOKEN_KEY).catch(() => undefined);
      return legacy;
    }
    return null;
  } catch {
    return AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
  }
}

export async function setStoredToken(token: string): Promise<void> {
  if (canUseSecureStore) {
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      return;
    } catch {
      // fall through to AsyncStorage if the secure store is unavailable
    }
  }
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearStoredToken(): Promise<void> {
  if (canUseSecureStore) {
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
  }
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => undefined);
}
