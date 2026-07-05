// The admin pages the OWNER can toggle on/off per admin. Ids must match the
// admin-panel `TABS` ids and the server's CONTROLLABLE_TABS set. The dashboard is
// always visible and globally-hidden pages aren't listed here.
export const CONTROLLABLE_PAGES: { id: string; label: string }[] = [
  { id: "users", label: "المستخدمون" },
  { id: "academic", label: "المحتوى الأكاديمي" },
  { id: "subscriptionRequests", label: "طلبات الاشتراك" },
  { id: "supportMessages", label: "رسائل المستخدمين" },
  { id: "broadcastMessages", label: "إرسال الإشعارات" },
  { id: "moralReviews", label: "مراجعات أخلاقية" },
];

export const pageLabel = (id: string): string => CONTROLLABLE_PAGES.find((p) => p.id === id)?.label ?? id;
