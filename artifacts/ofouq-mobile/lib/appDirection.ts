// Single source of truth for the app's current text direction, readable from
// non-React code (e.g. the global Text patch in app/_layout.tsx). PreferencesContext
// keeps this in sync with the resolved app language so it is correct even on a
// fresh launch where native I18nManager.isRTL hasn't been applied yet.
let appIsRTL = false;

export function setAppIsRTL(value: boolean) {
  appIsRTL = value;
}

export function getAppIsRTL() {
  return appIsRTL;
}
