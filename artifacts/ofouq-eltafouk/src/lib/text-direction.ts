// Per-message text direction detection. The app is Arabic-first, but chat
// messages can be Arabic OR English — each bubble should align itself based on
// its own content (like WhatsApp). We look at the FIRST strong-directional
// character and pick RTL for Arabic/Hebrew, LTR for Latin, defaulting to RTL.
const STRONG = /[A-Za-z֐-׿؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const RTL = /[֐-׿؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

export function isRTLText(text: string | null | undefined): boolean {
  const match = String(text ?? "").match(STRONG);
  return match ? RTL.test(match[0]) : true; // default RTL for an Arabic-first app
}

export function dirOf(text: string | null | undefined): "rtl" | "ltr" {
  return isRTLText(text) ? "rtl" : "ltr";
}
