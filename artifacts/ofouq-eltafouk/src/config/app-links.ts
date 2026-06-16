// Public store links for the Ofouq Eltafouk mobile app.
//
// The browser site is a marketing + STAFF portal only — students never log in or
// register on the web, they use the mobile app. Every public CTA on the landing page
// points students here.
//
// Fill these in with the real store URLs once the app is published. Until then they
// stay empty and the landing "نزّل التطبيق" buttons fall back to the on-page app
// section (#app) so nothing is broken.
export const ANDROID_APP_URL = "";
export const IOS_APP_URL = "";

// Primary target for the landing "download the app" buttons. Prefers a real store
// link when set; otherwise scrolls to the in-page "التطبيق" (#app) section.
export const APP_DOWNLOAD_HREF: string = ANDROID_APP_URL || IOS_APP_URL || "#app";
