import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

import { SHOULD_SHOW_PREVIEW_API_DEBUG } from "@/constants/api";

type PickImageSource = "register-avatar" | "profile-avatar" | "subscription-code";

type PickImageResult =
  | { status: "selected"; asset: ImagePicker.ImagePickerAsset }
  | { status: "canceled" }
  | { status: "denied" }
  | { status: "error"; error: unknown };

type PickImageOptions = Omit<ImagePicker.ImagePickerOptions, "mediaTypes"> & {
  source: PickImageSource;
};

const EXTENSION_TO_MIME_TYPE: Record<string, string> = {
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const MIME_TYPE_TO_EXTENSION: Record<string, string> = {
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function logImagePickerDebug(source: PickImageSource, event: string, details?: Record<string, unknown>) {
  if (!SHOULD_SHOW_PREVIEW_API_DEBUG) return;
  console.info("[ImagePicker]", {
    source,
    event,
    platform: Platform.OS,
    ...(details ?? {}),
  });
}

function getUriScheme(uri?: string | null) {
  return uri?.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase() ?? "unknown";
}

function getFileExtension(value?: string | null) {
  const clean = value?.split("?")[0]?.split("#")[0]?.trim();
  const extension = clean?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  return extension && EXTENSION_TO_MIME_TYPE[extension] ? extension : null;
}

export function getImageAssetMimeType(asset: ImagePicker.ImagePickerAsset) {
  if (asset.mimeType?.startsWith("image/")) return asset.mimeType;

  const extension = getFileExtension(asset.fileName) ?? getFileExtension(asset.uri);
  return extension ? EXTENSION_TO_MIME_TYPE[extension] : "image/jpeg";
}

export function createImageFormDataFile(asset: ImagePicker.ImagePickerAsset, fallbackFileName: string) {
  const type = getImageAssetMimeType(asset);
  const extension = MIME_TYPE_TO_EXTENSION[type] ?? "jpg";
  const fallbackBaseName = fallbackFileName.replace(/\.[a-z0-9]+$/i, "") || "image";
  const name = asset.fileName?.trim() || `${fallbackBaseName}.${extension}`;

  return {
    uri: asset.uri,
    name,
    type,
  };
}

export function logImageUploadDebug(
  source: PickImageSource,
  event: "upload_start" | "upload_success" | "upload_error",
  asset?: ImagePicker.ImagePickerAsset | null,
) {
  logImagePickerDebug(source, event, {
    uriScheme: getUriScheme(asset?.uri),
    mimeType: asset ? getImageAssetMimeType(asset) : null,
    hasFileName: Boolean(asset?.fileName),
  });
}

export async function pickImageFromLibrary(options: PickImageOptions): Promise<PickImageResult> {
  const { source, ...pickerOptions } = options;

  if (Platform.OS === "ios") {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    logImagePickerDebug(source, "permission_result", {
      status: permission.status,
      granted: permission.granted,
      canAskAgain: permission.canAskAgain,
      accessPrivileges: permission.accessPrivileges,
    });

    if (!permission.granted) {
      return { status: "denied" };
    }
  } else {
    logImagePickerDebug(source, "permission_skipped", {
      reason: "android_system_picker_does_not_need_media_permission",
    });
  }

  try {
    logImagePickerDebug(source, "open");
    const result = await ImagePicker.launchImageLibraryAsync({
      ...pickerOptions,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });

    if (result.canceled) {
      logImagePickerDebug(source, "canceled");
      return { status: "canceled" };
    }

    const asset = result.assets[0];
    if (!asset) {
      logImagePickerDebug(source, "canceled", { assetCount: 0 });
      return { status: "canceled" };
    }

    logImagePickerDebug(source, "selected", {
      assetCount: result.assets.length,
      uriScheme: getUriScheme(asset.uri),
      mimeType: getImageAssetMimeType(asset),
      hasFileName: Boolean(asset.fileName),
      fileSize: asset.fileSize ?? null,
    });

    return { status: "selected", asset };
  } catch (error) {
    logImagePickerDebug(source, "error", {
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
    });
    return { status: "error", error };
  }
}
