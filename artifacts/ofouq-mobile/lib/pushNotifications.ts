import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

import { apiFetch } from "@/lib/api";
import { openNotificationTarget, type AppNotification, type NotificationActionData } from "@/lib/notifications";

const PUSH_TOKEN_STORAGE_KEY = "ofouq_expo_push_token";
const PUSH_CHANNEL_ID = "default";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: Notifications.AndroidNotificationPriority.HIGH,
  }),
});

type ExpoPushExtra = {
  eas?: { projectId?: string };
  projectId?: string;
};

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function getProjectId() {
  const extra = Constants.expoConfig?.extra as ExpoPushExtra | undefined;
  return (
    cleanText(Constants.easConfig?.projectId) ??
    cleanText(extra?.eas?.projectId) ??
    cleanText(extra?.projectId) ??
    cleanText(process.env.EXPO_PUBLIC_EAS_PROJECT_ID)
  );
}

function getDeviceName() {
  return cleanText(Constants.deviceName) ?? cleanText(Constants.sessionId);
}

function warnIfExpoGo() {
  if (Constants.executionEnvironment !== ExecutionEnvironment.StoreClient) return;

  console.warn(
    "[Push] Remote push notifications are not supported reliably in Expo Go on SDK 53+. Use a development build for background/closed-app push notifications.",
  );
}

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
    name: "أفق التفوق",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#0A84FF",
    sound: "default",
  });
}

async function requestPermissions() {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted || existing.status === "granted") return true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted || requested.status === "granted";
}

async function registerForPushNotifications(authToken: string) {
  if (Platform.OS === "web") return null;

  await ensureAndroidChannel();
  warnIfExpoGo();

  const hasPermission = await requestPermissions();
  if (!hasPermission) {
    console.warn("[Push] Notification permission was not granted.");
    return null;
  }

  const projectId = getProjectId();
  if (!projectId) {
    console.warn(
      "[Push] Missing EAS projectId. Set EXPO_PUBLIC_EAS_PROJECT_ID or extra.eas.projectId, then run the app in a development build.",
    );
    return null;
  }

  const expoToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const response = await apiFetch<{ id: number | null }>("/api/notifications/push-token", {
    method: "POST",
    token: authToken,
    body: JSON.stringify({
      token: expoToken,
      platform: Platform.OS,
      deviceName: getDeviceName(),
    }),
  });
  await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, expoToken);
  console.info("[Push] Registered Expo push token.", {
    platform: Platform.OS,
    registrationId: response.id,
  });

  return expoToken;
}

export async function unregisterCurrentPushToken(authToken: string | null) {
  if (!authToken) return;

  const expoToken = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
  if (!expoToken) return;

  await apiFetch("/api/notifications/push-token", {
    method: "DELETE",
    token: authToken,
    body: JSON.stringify({ token: expoToken }),
  }).catch(() => undefined);
  await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
}

function getNumericId(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function openPushNotification(response: Notifications.NotificationResponse) {
  if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;

  const content = response.notification.request.content;
  const data = content.data as NotificationActionData | undefined;
  if (!data?.route) return;

  const notification: AppNotification = {
    id: getNumericId(data.notificationId),
    type: String(data.type ?? ""),
    title: String(content.title ?? ""),
    body: String(content.body ?? ""),
    tone: "primary",
    data,
    availableAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  openNotificationTarget(notification);
}

export function usePushNotifications(authToken: string | null, userId: number | null | undefined) {
  const registeredKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const subscription = Notifications.addNotificationResponseReceivedListener(openPushNotification);
    try {
      const lastResponse = Notifications.getLastNotificationResponse();
      if (lastResponse) {
        openPushNotification(lastResponse);
        Notifications.clearLastNotificationResponse();
      }
    } catch {
      // Native notification response history is unavailable in some runtimes.
    }

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!authToken || !userId) return;

    const registerKey = `${userId}:${authToken.slice(-12)}`;
    if (registeredKeyRef.current === registerKey) return;
    registeredKeyRef.current = registerKey;

    registerForPushNotifications(authToken).catch((err) => {
      registeredKeyRef.current = null;
      console.warn("Failed to register push notifications", err);
    });
  }, [authToken, userId]);
}
