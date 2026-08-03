import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Rasterise a PDF's pages to JPEG images IN THE BROWSER.
//
// Why here and not on the server: turning a PDF into images server-side needs
// either a native module or a system binary (poppler / ImageMagick), which we'd
// then have to guarantee exists on the production host. The dashboard already
// runs in a browser with a real canvas, so we split here and upload plain images
// — the API keeps its simple "images only" upload path and the mobile reader
// never has to render a PDF at all.
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// Rendered width in CSS pixels. This is a phone reader, not a print job: nearly
// every phone is ≤1290 physical pixels wide, so rendering past ~1200 buys no
// visible sharpness and costs real download time. The first cut of this used
// 1400px at quality 0.85 and produced ~2.3 MB PER PAGE — an 11-page sample was a
// ~25 MB download, which is exactly why pages showed up blank for seconds.
const TARGET_WIDTH = 1200;
const IMAGE_QUALITY = 0.72;
// WebP is roughly a third smaller than JPEG at the same visual quality and is
// supported by every browser that can run this dashboard and by both mobile
// platforms. Falls back to JPEG if the browser refuses to encode it.
const PREFERRED_TYPE = "image/webp";
const FALLBACK_TYPE = "image/jpeg";

export type PdfProgress = { page: number; total: number };

/**
 * Renders every page of `file` to a JPEG File, in page order.
 * `onProgress` fires per page so the caller can show a real counter — a 40-page
 * book takes a few seconds and silent UI reads as a freeze.
 */
export async function pdfToImageFiles(file: File, onProgress?: (p: PdfProgress) => void): Promise<File[]> {
  const buffer = await file.arrayBuffer();
  // Hold the loading task: tearing THAT down is what releases the worker.
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const doc = await loadingTask.promise;
  const out: File[] = [];

  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: TARGET_WIDTH / base.width });

      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("تعذّر تجهيز الصفحة");

      // White base: PDF pages are transparent where nothing is drawn, and JPEG has
      // no alpha — without this those areas come out black.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      page.cleanup();

      const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, IMAGE_QUALITY));
      // A browser that can't encode WebP returns null (or silently hands back a
      // PNG), so verify the type actually came back as asked before trusting it.
      let blob = await encode(PREFERRED_TYPE);
      if (!blob || blob.type !== PREFERRED_TYPE) blob = await encode(FALLBACK_TYPE);
      // Free the bitmap immediately — a long book would otherwise hold every
      // page's canvas in memory at once.
      canvas.width = 0;
      canvas.height = 0;
      if (!blob) throw new Error("تعذّر تحويل الصفحة لصورة");

      const ext = blob.type === PREFERRED_TYPE ? "webp" : "jpg";
      out.push(new File([blob], `page-${String(n).padStart(3, "0")}.${ext}`, { type: blob.type }));
      onProgress?.({ page: n, total: doc.numPages });
    }
  } finally {
    await loadingTask.destroy();
  }

  return out;
}
