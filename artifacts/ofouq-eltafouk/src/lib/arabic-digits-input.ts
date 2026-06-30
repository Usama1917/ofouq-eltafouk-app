import { toEnglishDigits } from "./format";

// Lets staff type Arabic-Indic (٠-٩) or Persian (۰-۹) digits in ANY input/textarea
// and have the app read them as Western digits — so the keyboard language never has
// to be switched for numbers. Installed once at startup as a single capture-phase
// `input` listener: it rewrites the value BEFORE React's onChange (which runs in the
// bubble phase) reads it, so controlled inputs receive the already-converted value.
// The conversion is a 1:1 character replacement, so the caret position is preserved.
// Password fields are skipped (an Arabic digit there may be intentional).
const ARABIC_OR_PERSIAN_DIGIT = /[٠-٩۰-۹]/;

export function installArabicDigitNormalizer(): void {
  if (typeof document === "undefined") return;

  document.addEventListener(
    "input",
    (event) => {
      const el = event.target;
      if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return;
      if (el instanceof HTMLInputElement && el.type === "password") return;

      const { value } = el;
      if (!ARABIC_OR_PERSIAN_DIGIT.test(value)) return;
      const converted = toEnglishDigits(value);
      if (converted === value) return;

      // Remember the caret so a same-length rewrite doesn't jump it to the end.
      let start: number | null = null;
      let end: number | null = null;
      try {
        start = el.selectionStart;
        end = el.selectionEnd;
      } catch {
        // Some input types (e.g. number) don't expose selection — ignore.
      }

      el.value = converted;

      if (start !== null && end !== null) {
        try {
          el.setSelectionRange(start, end);
        } catch {
          // ignore inputs that don't support selection range
        }
      }
    },
    true, // capture: run before React's bubble-phase onChange reads the value
  );
}
