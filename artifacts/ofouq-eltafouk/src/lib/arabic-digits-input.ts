import { toEnglishDigits } from "./format";

// Lets staff type Arabic-Indic (٠-٩) or Persian (۰-۹) digits in ANY input/textarea
// and have the app read them as Western digits — so the keyboard language never has
// to be switched for numbers. Installed once at startup as a single capture-phase
// `input` listener: it rewrites the value BEFORE React's onChange (which runs in the
// bubble phase) reads it, so controlled inputs receive the already-converted value.
// The conversion is a 1:1 character replacement, so the caret position is preserved.
// Password fields are skipped (an Arabic digit there may be intentional).
const ARABIC_OR_PERSIAN_DIGIT = /[٠-٩۰-۹]/;

// Input types whose `value` must never be rewritten. A file input in particular
// exposes the picked filename as its value but THROWS on any assignment other
// than "" — so picking a file whose name contains Arabic-Indic digits (e.g.
// "الفيزياء ٣.pdf") used to blow up inside this capture-phase listener and could
// take the upload's change event down with it. The rest simply have no text to
// normalise.
const SKIPPED_INPUT_TYPES = new Set(["password", "file", "checkbox", "radio", "range", "color", "button", "submit", "reset", "image"]);

export function installArabicDigitNormalizer(): void {
  if (typeof document === "undefined") return;

  document.addEventListener(
    "input",
    (event) => {
      const el = event.target;
      if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return;
      if (el instanceof HTMLInputElement && SKIPPED_INPUT_TYPES.has(el.type)) return;

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
