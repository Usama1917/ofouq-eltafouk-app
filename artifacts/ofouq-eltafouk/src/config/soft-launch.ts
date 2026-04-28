export const SOFT_LAUNCH_MODE = true;

export const visibleStudentFeatures = {
  home: true,
  videoLessons: true,
  account: true,

  points: false,
  rewards: false,
  competitions: false,
  community: false,
  aiAssistant: false,
  library: false,
  gamification: false,
} as const;

export type StudentFeature = keyof typeof visibleStudentFeatures;

export function isStudentFeatureVisible(feature: StudentFeature) {
  return !SOFT_LAUNCH_MODE || visibleStudentFeatures[feature];
}

export const hiddenStudentRouteRedirects = {
  "/books/cart": "/videos",
  "/books/tracking": "/videos",
  "/books/orders": "/videos",
  "/books": "/videos",
  "/social": "/",
  "/ai-chat": "/",
  "/points": "/",
  "/games": "/",
  "/rewards": "/",
} as const;
