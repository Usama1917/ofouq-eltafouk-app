// Mobile-style page scrollbar: the native document scrollbar is hidden in CSS
// (zero reserved space, so the fixed sidebar sits flush to the screen edge), and we
// draw a slim floating thumb instead. It appears while the page is scrolling and
// fades out shortly after scrolling stops — exactly like a phone's overlay scrollbar.
// The page still scrolls natively; this only paints an indicator, so no scroll
// behaviour is hijacked. The thumb sits on the LEFT edge (the natural side in RTL).

const MIN_THUMB_HEIGHT = 28;
const TRACK_PADDING = 4;
const IDLE_HIDE_MS = 900;

export function installFloatingScrollbar(): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  if (document.getElementById("__floating_scrollbar_thumb")) return; // install once

  const thumb = document.createElement("div");
  thumb.id = "__floating_scrollbar_thumb";
  thumb.setAttribute("aria-hidden", "true");
  Object.assign(thumb.style, {
    position: "fixed",
    top: "0",
    left: "2px",
    width: "6px",
    borderRadius: "9999px",
    backgroundColor: "hsl(215 16% 47% / 0.5)",
    opacity: "0",
    transition: "opacity 280ms ease",
    pointerEvents: "none",
    zIndex: "2147483646",
    willChange: "transform, opacity",
  } as CSSStyleDeclaration);
  document.body.appendChild(thumb);

  let hideTimer: number | undefined;

  const measure = () => {
    const doc = document.documentElement;
    const viewH = window.innerHeight;
    const scrollH = doc.scrollHeight;
    const maxScroll = scrollH - viewH;
    if (maxScroll <= 1) return null; // page doesn't scroll

    const trackH = viewH - TRACK_PADDING * 2;
    const thumbH = Math.max(MIN_THUMB_HEIGHT, (viewH / scrollH) * trackH);
    const scrollY = window.scrollY || doc.scrollTop || 0;
    const top = TRACK_PADDING + (scrollY / maxScroll) * (trackH - thumbH);
    return { thumbH, top };
  };

  const reposition = () => {
    const m = measure();
    if (!m) {
      thumb.style.opacity = "0";
      return;
    }
    thumb.style.height = `${m.thumbH}px`;
    thumb.style.transform = `translateY(${m.top}px)`;
  };

  const onScroll = () => {
    const m = measure();
    if (!m) return;
    thumb.style.height = `${m.thumbH}px`;
    thumb.style.transform = `translateY(${m.top}px)`;
    thumb.style.opacity = "1";
    if (hideTimer) window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      thumb.style.opacity = "0";
    }, IDLE_HIDE_MS);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", reposition, { passive: true });
  reposition();
}
