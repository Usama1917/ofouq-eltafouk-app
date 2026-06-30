// Responsive recharts axis sizing.
//
// recharts does NOT auto-size an axis to its labels — a fixed `width` either
// clips long labels (e.g. a 2-digit "12" or a 4-digit "1,240" runs into the
// axis) or wastes plot space. These helpers measure the *actual* pixel width
// of the longest label in the real font — so they adapt to the text size and
// to language (Arabic glyphs are wider than Latin digits) — and reserve just
// enough room plus a small gap from the axis line.

// Single shared canvas 2d context; measuring text is cheap and synchronous.
let _ctx: CanvasRenderingContext2D | null = null;
function measureText(text: string, font: string): number {
  if (typeof document === "undefined") return text.length * 8; // SSR fallback
  if (!_ctx) _ctx = document.createElement("canvas").getContext("2d");
  if (!_ctx) return text.length * 8;
  _ctx.font = font;
  return _ctx.measureText(text).width;
}

// Gap reserved between a label and the axis line (used as tickMargin too, so
// the value and the visual spacing stay in sync). Export it for the JSX.
export const AXIS_GAP = 10;
const PAD = 6; // tiny extra so glyphs never touch the reserved edge

// Shared numeric tick formatter: thousands separators, Western digits — matches
// the dashboard tooltips so the axis and tooltip read the same.
export const numTick = (n: number) => Number(n ?? 0).toLocaleString("en-US");

// Width for a NUMERIC value axis (the vertical axis on a column/area chart, or
// the horizontal axis on a bar chart laid out vertically). Sized against the
// largest value it will render — with headroom because recharts rounds the top
// tick up to a "nice" number that can be one digit longer than the data max.
export function numAxisWidth(
  values: Array<number | null | undefined>,
  font = "11px 'SF Arabic', Cairo, system-ui, sans-serif",
): number {
  const max = values.reduce<number>((m, v) => Math.max(m, Number(v ?? 0)), 0);
  const label = numTick(Math.ceil(Math.max(max, 1) * 1.1)); // headroom for the top tick
  return Math.max(30, Math.ceil(measureText(label, font)) + AXIS_GAP + PAD);
}

// Width for a CATEGORY axis of text labels (Arabic or English). Capped so one
// very long label can't swallow the plot; floored so short labels still breathe.
export function catAxisWidth(
  labels: string[],
  { font = "12px 'SF Arabic', Cairo, system-ui, sans-serif", min = 56, max = 168 } = {},
): number {
  const longest = labels.reduce((a, b) => (b.length > a.length ? b : a), "");
  const w = Math.ceil(measureText(longest, font)) + AXIS_GAP + PAD;
  return Math.min(max, Math.max(min, w));
}
