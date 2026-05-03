const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function toEnglishDigits(value: unknown): string {
  return String(value ?? "").replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabicIndex = ARABIC_DIGITS.indexOf(digit);
    if (arabicIndex >= 0) return String(arabicIndex);
    const persianIndex = PERSIAN_DIGITS.indexOf(digit);
    return persianIndex >= 0 ? String(persianIndex) : digit;
  });
}

export function formatNumber(value: number): string {
  return toEnglishDigits(new Intl.NumberFormat("en-US").format(value));
}

export function formatDate(value: string | number | Date, locale = "en-US"): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return toEnglishDigits(date.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" }));
}

export function formatShortDate(value: string | number | Date, locale = "en-US"): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return toEnglishDigits(date.toLocaleDateString(locale));
}
