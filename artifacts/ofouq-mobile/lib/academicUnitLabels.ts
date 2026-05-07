export type AcademicUnitLabel = "unit" | "chapter" | "section";

type AcademicUnitLabelCopy = {
  value: AcademicUnitLabel;
  plural: string;
  choose: string;
  noPublished: string;
  needsSubscription: string;
};

const AR_COPIES: Record<AcademicUnitLabel, AcademicUnitLabelCopy> = {
  unit: {
    value: "unit",
    plural: "الوحدات",
    choose: "اختر الوحدة الدراسية",
    noPublished: "لا توجد وحدات منشورة",
    needsSubscription: "تحتاج إلى اشتراك قبل مشاهدة الوحدات.",
  },
  chapter: {
    value: "chapter",
    plural: "الفصول",
    choose: "اختر الفصل",
    noPublished: "لا توجد فصول منشورة",
    needsSubscription: "تحتاج إلى اشتراك قبل مشاهدة الفصول.",
  },
  section: {
    value: "section",
    plural: "الأبواب",
    choose: "اختر الباب",
    noPublished: "لا توجد أبواب منشورة",
    needsSubscription: "تحتاج إلى اشتراك قبل مشاهدة الأبواب.",
  },
};

const EN_COPIES: Record<AcademicUnitLabel, AcademicUnitLabelCopy> = {
  unit: {
    value: "unit",
    plural: "Units",
    choose: "Choose a unit",
    noPublished: "No published units",
    needsSubscription: "You need a subscription before viewing units.",
  },
  chapter: {
    value: "chapter",
    plural: "Chapters",
    choose: "Choose a chapter",
    noPublished: "No published chapters",
    needsSubscription: "You need a subscription before viewing chapters.",
  },
  section: {
    value: "section",
    plural: "Sections",
    choose: "Choose a section",
    noPublished: "No published sections",
    needsSubscription: "You need a subscription before viewing sections.",
  },
};

export function normalizeAcademicUnitLabel(value: unknown): AcademicUnitLabel {
  return value === "chapter" || value === "section" ? value : "unit";
}

export function getAcademicUnitLabelCopy(value: unknown, locale: string) {
  const copies = locale.startsWith("ar") ? AR_COPIES : EN_COPIES;
  return copies[normalizeAcademicUnitLabel(value)];
}
