import type { AppLanguage } from "@/lib/i18n";

export type Governorate = {
  /** Stable key persisted to the server. Kept equal to the Arabic label for backward compatibility. */
  value: string;
  ar: string;
  en: string;
};

export const EGYPT_GOVERNORATES: readonly Governorate[] = [
  { value: "القاهرة", ar: "القاهرة", en: "Cairo" },
  { value: "الجيزة", ar: "الجيزة", en: "Giza" },
  { value: "الإسكندرية", ar: "الإسكندرية", en: "Alexandria" },
  { value: "الدقهلية", ar: "الدقهلية", en: "Dakahlia" },
  { value: "البحر الأحمر", ar: "البحر الأحمر", en: "Red Sea" },
  { value: "البحيرة", ar: "البحيرة", en: "Beheira" },
  { value: "الفيوم", ar: "الفيوم", en: "Faiyum" },
  { value: "الغربية", ar: "الغربية", en: "Gharbia" },
  { value: "الإسماعيلية", ar: "الإسماعيلية", en: "Ismailia" },
  { value: "المنوفية", ar: "المنوفية", en: "Monufia" },
  { value: "المنيا", ar: "المنيا", en: "Minya" },
  { value: "القليوبية", ar: "القليوبية", en: "Qalyubia" },
  { value: "الوادي الجديد", ar: "الوادي الجديد", en: "New Valley" },
  { value: "السويس", ar: "السويس", en: "Suez" },
  { value: "أسوان", ar: "أسوان", en: "Aswan" },
  { value: "أسيوط", ar: "أسيوط", en: "Asyut" },
  { value: "بني سويف", ar: "بني سويف", en: "Beni Suef" },
  { value: "بورسعيد", ar: "بورسعيد", en: "Port Said" },
  { value: "دمياط", ar: "دمياط", en: "Damietta" },
  { value: "الشرقية", ar: "الشرقية", en: "Sharqia" },
  { value: "جنوب سيناء", ar: "جنوب سيناء", en: "South Sinai" },
  { value: "كفر الشيخ", ar: "كفر الشيخ", en: "Kafr El Sheikh" },
  { value: "مطروح", ar: "مطروح", en: "Matrouh" },
  { value: "الأقصر", ar: "الأقصر", en: "Luxor" },
  { value: "قنا", ar: "قنا", en: "Qena" },
  { value: "شمال سيناء", ar: "شمال سيناء", en: "North Sinai" },
  { value: "سوهاج", ar: "سوهاج", en: "Sohag" },
] as const;

/**
 * Resolve the display label for a stored governorate value in the given app language.
 * Falls back to the Arabic label, then to the raw value itself (so legacy/unknown
 * stored values still render instead of disappearing).
 */
export function governorateLabel(value: string | null | undefined, language: AppLanguage): string {
  if (!value) return "";
  const match = EGYPT_GOVERNORATES.find((item) => item.value === value);
  if (!match) return value;
  return language === "en" ? match.en : match.ar;
}
