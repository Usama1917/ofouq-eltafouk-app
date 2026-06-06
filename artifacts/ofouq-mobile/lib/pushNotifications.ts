import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import { useEffect, useRef } from "react";
import { Alert, Platform } from "react-native";

import { SHOULD_SHOW_PREVIEW_API_DEBUG } from "@/constants/api";
import { apiFetch } from "@/lib/api";
import { openNotificationTarget, type AppNotification, type NotificationActionData } from "@/lib/notifications";

const PUSH_TOKEN_STORAGE_KEY = "ofouq_expo_push_token";
const PUSH_CHANNEL_ID = "default";
let lastPushAlertAt = 0;
let notificationHandlerConfigured = false;
let notificationsModule: typeof import("expo-notifications") | null | undefined;

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
  return cleanText(Device.deviceName) ?? cleanText(Constants.deviceName) ?? cleanText(Constants.sessionId);
}

function getDeviceInfo() {
  return {
    brand: cleanText(Device.brand),
    manufacturer: cleanText(Device.manufacturer),
    modelName: cleanText(Device.modelName),
    osName: cleanText(Device.osName),
    osVersion: cleanText(Device.osVersion),
    deviceType: Device.deviceType,
    deviceYearClass: Device.deviceYearClass,
  };
}

function isAndroidExpoGo() {
  return Platform.OS === "android" && Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

function getNotificationsModule() {
  if (Platform.OS === "web" || isAndroidExpoGo()) return null;

  if (notificationsModule !== undefined) {
    return notificationsModule;
  }

  try {
    notificationsModule = require("expo-notifications") as typeof import("expo-notifications");
  } catch (err) {
    notificationsModule = null;
    pushWarn("expo-notifications is unavailable in this runtime.", {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return notificationsModule;
}

function configureNotificationHandler(Notifications: typeof import("expo-notifications")) {
  if (notificationHandlerConfigured) return;
  notificationHandlerConfigured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
    }),
  });
}

function pushDebug(message: string, data?: Record<string, unknown>) {
  if (!SHOULD_SHOW_PREVIEW_API_DEBUG) return;
  console.info(`[Push] ${message}`, data ?? {});
}

function pushWarn(message: string, data?: Record<string, unknown>) {
  console.warn(`[Push] ${message}`, data ?? {});
}

function maskToken(token: string) {
  return `${token.slice(0, 18)}…`;
}

function showPushAlert(title: string, message: string) {
  if (Platform.OS === "web") return;

  const now = Date.now();
  if (now - lastPushAlertAt < 60 * 1000) return;
  lastPushAlertAt = now;
  Alert.alert(title, message);
}

function warnUnsupportedAndroidExpoGo() {
  pushWarn(
    "Android remote push notifications are unavailable in Expo Go on SDK 53+. Install a development or preview build to receive notifications outside the app.",
  );
}

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;

  const Notifications = getNotificationsModule();
  if (!Notifications) return;
  configureNotificationHandler(Notifications);

  const channel = await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
    name: "أفق التفوق",
    description: "تنبيهات الدروس والدعم والرسائل المهمة",
    importance: Notifications.AndroidImportance.MAX,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    enableVibrate: true,
    showBadge: true,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#0A84FF",
    sound: "default",
  });
  pushDebug("Android notification channel ensured.", {
    id: channel?.id ?? PUSH_CHANNEL_ID,
    importance: channel?.importance ?? Notifications.AndroidImportance.MAX,
  });
}

async function requestPermissions() {
  const Notifications = getNotificationsModule();
  if (!Notifications) return false;
  configureNotificationHandler(Notifications);

  const existing = await Notifications.getPermissionsAsync();
  pushDebug("Existing notification permission status.", {
    status: existing.status,
    granted: existing.granted,
    canAskAgain: existing.canAskAgain,
  });
  if (existing.granted || existing.status === "granted") return true;

  const requested = await Notifications.requestPermissionsAsync({
    android: {},
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });
  const granted = requested.granted || requested.status === "granted";
  pushDebug("Requested notification permission status.", {
    status: requested.status,
    granted,
    canAskAgain: requested.canAskAgain,
  });
  if (!granted) {
    pushWarn("Notification permission was not granted.", {
      status: requested.status,
      canAskAgain: requested.canAskAgain,
    });
    showPushAlert(
      "الإشعارات متوقفة / Notifications disabled",
      "لن تصلك تنبيهات الدروس أو الدعم على هذا الجهاز إلا إذا سمحت بالإشعارات من إعدادات التطبيق.\n\nYou will not receive lesson or support notifications on this device unless notifications are allowed in system settings.",
    );
  }
  return granted;
}

async function registerForPushNotifications(authToken: string) {
  if (Platform.OS === "web") return null;

  if (!Device.isDevice) {
    pushWarn("Remote push notifications require a physical device.");
    return null;
  }
  if (isAndroidExpoGo()) {
    warnUnsupportedAndroidExpoGo();
    return null;
  }

  const Notifications = getNotificationsModule();
  if (!Notifications) return null;
  configureNotificationHandler(Notifications);

  await ensureAndroidChannel();

  const hasPermission = await requestPermissions();
  if (!hasPermission) {
    return null;
  }

  const projectId = getProjectId();
  if (!projectId) {
    pushWarn(
      "Missing EAS projectId. Set EXPO_PUBLIC_EAS_PROJECT_ID or extra.eas.projectId, then run the app in a development build.",
    );
    showPushAlert(
      "إعداد الإشعارات غير مكتمل",
      "لم يتم العثور على EAS projectId داخل التطبيق، لذلك لا يمكن إنشاء Expo push token.\n\nMissing EAS projectId, so the app cannot create an Expo push token.",
    );
    return null;
  }
  pushDebug("Using EAS projectId for push token.", {
    projectId,
  });

  let nativePushTokenType: string | null = null;
  try {
    nativePushTokenType = (await Notifications.getDevicePushTokenAsync()).type;
    pushDebug("Native device push token available.", { nativePushTokenType });
  } catch (err) {
    pushWarn("Native device push token is unavailable.", {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  let expoToken: string;
  try {
    expoToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    pushDebug("Expo push token obtained.", {
      tokenPrefix: maskToken(expoToken),
      platform: Platform.OS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    pushWarn("Failed to obtain Expo push token.", { message });
    showPushAlert(
      "تعذر تفعيل إشعارات الجهاز",
      "لم يستطع التطبيق إنشاء Expo push token. في أندرويد يحدث هذا غالبا إذا كانت FCM credentials غير مكتملة في EAS/Firebase.\n\nCould not create an Expo push token. On Android this often means FCM credentials are missing or invalid in EAS/Firebase.",
    );
    return null;
  }

  const response = await apiFetch<{ id: number | null }>("/api/notifications/push-token", {
    method: "POST",
    token: authToken,
    body: JSON.stringify({
      token: expoToken,
      platform: Platform.OS,
      deviceName: getDeviceName(),
      deviceInfo: getDeviceInfo(),
    }),
  });
  await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, expoToken);
  pushDebug("Registered Expo push token with backend.", {
    platform: Platform.OS,
    registrationId: response.id,
    nativePushTokenType,
    tokenPrefix: maskToken(expoToken),
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

function openPushNotification(
  response: import("expo-notifications").NotificationResponse,
  Notifications: typeof import("expo-notifications"),
) {
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
    if (isAndroidExpoGo()) return;

    const Notifications = getNotificationsModule();
    if (!Notifications) return;
    configureNotificationHandler(Notifications);

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      openPushNotification(response, Notifications);
    });
    try {
      const lastResponse = Notifications.getLastNotificationResponse();
      if (lastResponse) {
        openPushNotification(lastResponse, Notifications);
        Notifications.clearLastNotificationResponse();
      }
    } catch {
      // Native notification response history is unavailable in some runtimes.
    }

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!authToken || !userId) {
      registeredKeyRef.current = null;
      return;
    }

    const registerKey = `${userId}:${authToken.slice(-12)}`;
    if (registeredKeyRef.current === registerKey) return;
    registeredKeyRef.current = registerKey;

    let cancelled = false;
    registerForPushNotifications(authToken)
      .then((expoToken) => {
        if (!cancelled && !expoToken) {
          registeredKeyRef.current = null;
        }
      })
      .catch((err) => {
        if (!cancelled) {
          registeredKeyRef.current = null;
        }
        pushWarn("Failed to register push notifications.", {
          message: err instanceof Error ? err.message : String(err),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [authToken, userId]);
}
