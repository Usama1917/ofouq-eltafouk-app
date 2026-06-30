import type { MouseEvent } from "react";

// Shared "click outside to close" behaviour for the dashboard's hand-rolled modal
// dialogs. Attach the returned handler to the modal's full-screen backdrop element
// (the `fixed inset-0 …` overlay). A click registers as "outside" only when it
// lands on the backdrop itself, not on a child — so clicks inside the dialog card
// never close it. For dialogs that contain unsaved input, pass `isDirty` and the
// user is asked to confirm before the content is discarded.
//
// Usage:
//   const onBackdrop = makeBackdropClose(() => setOpen(false), { isDirty: () => hasInput });
//   <div className="fixed inset-0 … flex items-center justify-center" onClick={onBackdrop}>
//     <div className="card" onClick={stopInside}>…</div>
//   </div>

export const DISCARD_CONFIRM_MESSAGE = "فيه تعديلات لم تُحفظ. تقفل من غير ما تحفظ؟";

export function makeBackdropClose(
  close: () => void,
  opts: { isDirty?: () => boolean } = {},
): (event: MouseEvent) => void {
  return (event: MouseEvent) => {
    // Only the backdrop itself counts as an "outside" click; bubbled clicks from
    // children carry a different target and are ignored.
    if (event.target !== event.currentTarget) return;
    if (opts.isDirty?.() && !window.confirm(DISCARD_CONFIRM_MESSAGE)) return;
    close();
  };
}

// Stop a click inside the dialog card from bubbling up to a backdrop handler. Use
// on the card wrapper when the card is NOT a direct child of the element that owns
// the backdrop handler (i.e. when the `target === currentTarget` guard isn't enough).
export function stopInside(event: MouseEvent): void {
  event.stopPropagation();
}

// Imperative variant for non-React close paths (e.g. an Escape handler) where you
// just need the dirty guard. Returns true when it's safe to close.
export function confirmDiscardIfDirty(isDirty: boolean): boolean {
  return !isDirty || window.confirm(DISCARD_CONFIRM_MESSAGE);
}
