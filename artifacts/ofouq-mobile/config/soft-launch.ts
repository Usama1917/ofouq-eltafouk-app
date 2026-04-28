export const SOFT_LAUNCH_MODE = true;

export const visibleFeatures = {
  home: true,
  videoLessons: true,
  academic: true,
  account: true,

  books: false,
  aiAssistant: false,
} as const;

export type AppFeature = keyof typeof visibleFeatures;

export function isFeatureVisible(feature: AppFeature): boolean {
  return !SOFT_LAUNCH_MODE || visibleFeatures[feature];
}
