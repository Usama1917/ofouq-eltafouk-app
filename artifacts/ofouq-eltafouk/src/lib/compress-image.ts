// Shrink an uploaded picture IN THE BROWSER before it ever reaches the API.
//
// Why this exists: the owner uploads book art straight out of a design tool, so a
// single cover arrives as a 1.5–2.5 MB PNG. The phone then has to pull that whole
// file down before the banner can paint — on mobile data that is several seconds of
// empty box, which is exactly the complaint this fixes. A cover is displayed at
// most ~1300 physical pixels wide on a phone, so everything past that is weight the
// student pays for and never sees.
//
// Browser-side for the same reason `pdf-to-images.ts` is: resizing on the server
// needs a native module (sharp) or a system binary we'd have to guarantee exists on
// the production host. The dashboard already has a real canvas — use it.

// Longest side we keep. A 3x phone at 430pt logical width is ~1290 physical px;
// 1600 leaves headroom for tablets without paying for print resolution.
const MAX_SIDE = 1600;
// Measured on a real cover (1920×1080 PNG, 1.9 MB) against the downscaled source:
//   0.82 → 57 KB @ 39.3 dB · 0.88 → 73 KB @ 40.1 dB · 0.92 → 95 KB @ 40.6 dB
// 0.88 is where it stops paying: it clears the ~40 dB "visually lossless" mark —
// which matters because covers are full of Arabic text, the first thing to smear
// under compression — while 0.92 buys +0.5 dB for another 22 KB.
const QUALITY = 0.88;
// WebP is the ONLY output we accept. Book covers routinely have transparent
// backgrounds and JPEG has no alpha — a JPEG fallback would silently paste a white
// box behind the art, which looks broken in dark mode. If a browser can't encode
// WebP we hand the original file back untouched instead of damaging it.
const OUTPUT_TYPE = "image/webp";

/** Bitmap decode that works with or without `createImageBitmap`. */
async function decode(file: File): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    const bmp = await createImageBitmap(file);
    return {
      width: bmp.width,
      height: bmp.height,
      draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h),
      close: () => bmp.close(),
    };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("تعذّر قراءة الصورة"));
      el.src = url;
    });
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      close: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/**
 * Returns a smaller WebP version of `file`, or the original file when shrinking it
 * would gain nothing (already small, already optimised, or the browser can't encode
 * WebP). NEVER throws for a merely-unshrinkable image: a failed optimisation must
 * not block the owner from uploading a cover.
 */
export async function compressImageFile(file: File, maxSide = MAX_SIDE, quality = QUALITY): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  // An animated GIF would come back as a single frozen frame — leave it alone.
  if (file.type === "image/gif") return file;

  let bitmap: Awaited<ReturnType<typeof decode>> | null = null;
  try {
    bitmap = await decode(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // Keeps downscaled text and line art crisp rather than aliased.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    bitmap.draw(ctx, w, h);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, OUTPUT_TYPE, quality));
    // Release the bitmap memory straight away — a gallery upload runs this in a loop.
    canvas.width = 0;
    canvas.height = 0;
    // A browser that can't encode WebP returns null, or quietly hands back a PNG.
    if (!blob || blob.type !== OUTPUT_TYPE) return file;
    // Re-encoding a small, already-optimised image can come out BIGGER. Only take
    // the new one when it's a genuine win.
    if (blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${base}.webp`, { type: OUTPUT_TYPE });
  } catch {
    // Corrupt file, exotic format, out of memory — upload what the owner picked.
    return file;
  } finally {
    bitmap?.close();
  }
}

/** Human-readable size for the progress text the owner reads while uploading. */
export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} م.ب`;
  if (n >= 1024) return `${Math.round(n / 1024)} ك.ب`;
  return `${n} بايت`;
}
