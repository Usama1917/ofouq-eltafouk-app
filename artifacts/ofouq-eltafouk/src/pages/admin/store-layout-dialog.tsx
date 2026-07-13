import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Smartphone, Tablet, X, Save, GripVertical, BookOpen, RotateCcw, LayoutGrid, RefreshCw, ChevronUp, ChevronDown, Trash2 } from "lucide-react";

// ── shared web helpers (mirror products-tab) ──────────────────────────────────
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const apiPath = (p: string) => `${BASE}${p}`;
const authHeader = (): Record<string, string> => {
  const t = localStorage.getItem("ofouq_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const imgSrc = (url: string | null) => (!url ? "" : url.startsWith("http") ? url : apiPath(url));

type LBook = {
  id: number;
  title: string;
  coverUrl: string | null;
  coverPortraitUrl: string | null;
  coverLandscapeUrl: string | null;
  priceEgp: number;
  originalPriceEgp: number | null;
  stockQuantity: number;
  available: boolean;
};
type RowType = "normal" | "carousel";
type LayoutRow = { type: RowType; title?: string; titleEn?: string; books: number[] };

// Device silhouettes (phone & iPad share the SAME 2-per-row layout — only the frame
// size differs). The LEFT panel shows a read-only preview; editing is on the RIGHT.
const DEVICES = {
  phone: { label: "فون", icon: Smartphone, w: 390, h: 844, frameW: 300, radius: 44, bezel: 11 },
  ipad: { label: "آيباد", icon: Tablet, w: 820, h: 1180, frameW: 600, radius: 26, bezel: 14 },
} as const;
type DeviceKey = keyof typeof DEVICES;

const MAX_NORMAL = 2; // a normal row shows at most 2 books; a carousel is unlimited
const PREVIEW_H = 520; // scaled display height of the device preview

const P = { bg: "#0a0a0b", card: "#1b1b1e", card2: "#242427", text: "#f4f4f5", muted: "#8b8b90", primary: "#3b82f6" };

const chunkPairs = (ids: number[]): number[][] => {
  const out: number[][] = [];
  for (let i = 0; i < ids.length; i += 2) out.push(ids.slice(i, i + 2));
  return out;
};

// Normalise the saved layout to typed rows (legacy number[] rows → normal), then make
// sure every in-stock book appears — new books get appended as normal pairs.
function buildInitialRows(layout: unknown, books: LBook[]): LayoutRow[] {
  const valid = new Set(books.map((b) => b.id));
  const placed = new Set<number>(); // books shown in ANY row (drives the "missing" append)
  let rows: LayoutRow[] = [];
  if (Array.isArray(layout) && layout.length) {
    for (const r of layout) {
      const type: RowType = !Array.isArray(r) && r?.type === "carousel" ? "carousel" : "normal";
      const rawTitle = !Array.isArray(r) && typeof r?.title === "string" ? (r.title as string) : undefined;
      const title = rawTitle && rawTitle.trim() ? rawTitle.trim() : undefined;
      const rawTitleEn = !Array.isArray(r) && typeof r?.titleEn === "string" ? (r.titleEn as string) : undefined;
      const titleEn = rawTitleEn && rawTitleEn.trim() ? rawTitleEn.trim() : undefined;
      const src: unknown[] = Array.isArray(r) ? r : Array.isArray(r?.books) ? r.books : [];
      const rowSeen = new Set<number>();
      const bookIds = src
        .map((v) => Number(v))
        .filter((n) => Number.isInteger(n) && valid.has(n) && !rowSeen.has(n) && (rowSeen.add(n), placed.add(n), true));
      const capped = type === "normal" ? bookIds.slice(0, MAX_NORMAL) : bookIds;
      if (capped.length) rows.push({ type, title, titleEn, books: capped });
    }
  }
  const missing = books.filter((b) => !placed.has(b.id)).map((b) => b.id);
  rows = [...rows, ...chunkPairs(missing).map((ids) => ({ type: "normal" as RowType, books: ids }))];
  return rows;
}

type Drop =
  | { kind: "card"; rowIndex: number; cardIndex: number }
  | { kind: "rowEnd"; rowIndex: number }
  | { kind: "newRow"; atIndex: number; rowType: RowType };

type DragSrc = { rowIndex: number; cardIndex: number };

// Move or COPY the dragged card. Dropping a book into a CAROUSEL row that isn't its own
// row COPIES it (the original stays put). Every other drop MOVES the dragged instance.
// A normal row is capped at MAX_NORMAL; a carousel row has no cap. Row titles survive.
function applyDrop(rows: LayoutRow[], dragId: number, src: DragSrc, drop: Drop): LayoutRow[] {
  // Any drop into a carousel (existing OR a brand-new one) COPIES the book — it stays
  // in its original row too. Everything else moves the dragged instance.
  const destIsCarousel = drop.kind === "newRow" ? drop.rowType === "carousel" : rows[drop.rowIndex]?.type === "carousel";
  const sameRow = drop.kind !== "newRow" && drop.rowIndex === src.rowIndex;
  const isCopy = destIsCarousel && !sameRow;

  const next: LayoutRow[] = rows.map((r) => ({ type: r.type, title: r.title, titleEn: r.titleEn, books: [...r.books] }));

  let insRow: number;
  let insIdx: number;
  if (drop.kind === "newRow") {
    const at = Math.max(0, Math.min(drop.atIndex, next.length));
    next.splice(at, 0, { type: drop.rowType, books: [dragId] });
    insRow = at;
    insIdx = 0;
  } else if (drop.kind === "rowEnd") {
    const r = next[drop.rowIndex];
    if (!r) return rows;
    r.books.push(dragId);
    insRow = drop.rowIndex;
    insIdx = r.books.length - 1;
  } else {
    const r = next[drop.rowIndex];
    if (!r) return rows;
    const at = Math.max(0, Math.min(drop.cardIndex, r.books.length));
    r.books.splice(at, 0, dragId);
    insRow = drop.rowIndex;
    insIdx = at;
  }

  if (isCopy) {
    const r = next[insRow];
    if (r && r.books.filter((x) => x === dragId).length > 1) return rows; // reject exact double
  } else {
    let sr = src.rowIndex;
    let sc = src.cardIndex;
    if (drop.kind === "newRow") {
      if (insRow <= sr) sr += 1;
    } else if (insRow === sr && insIdx <= sc) {
      sc += 1;
    }
    const r = next[sr];
    if (r && r.books[sc] === dragId) {
      r.books.splice(sc, 1);
    } else if (r) {
      for (let i = 0; i < r.books.length; i++) {
        if (r.books[i] === dragId && !(sr === insRow && i === insIdx)) { r.books.splice(i, 1); break; }
      }
    }
  }

  for (const r of next) {
    if (r.type === "normal" && r.books.length > MAX_NORMAL) return rows;
  }
  // Keep empty rows (an owner can create one via the +buttons then fill it, or empty a
  // row and refill it). Empties are skipped in the preview and dropped on save.
  return next;
}

export default function StoreLayoutDialog({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [books, setBooks] = useState<LBook[]>([]);
  const [rows, setRows] = useState<LayoutRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dragId = useRef<number | null>(null);
  const dragSrc = useRef<DragSrc | null>(null);
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState<string>("");

  const bookMap = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(apiPath("/api/admin/store/layout"), { headers: authHeader() });
        if (!res.ok) throw new Error("تعذّر تحميل بيانات العرض");
        const data: { layout: unknown; books: LBook[] } = await res.json();
        if (cancel) return;
        setBooks(data.books);
        setRows(buildInitialRows(data.layout, data.books));
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : "حدث خطأ");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    const onEnd = () => { dragId.current = null; dragSrc.current = null; setDragging(false); setOver(""); };
    document.addEventListener("dragend", onEnd);
    return () => document.removeEventListener("dragend", onEnd);
  }, []);

  function onDrop(drop: Drop) {
    const id = dragId.current;
    const src = dragSrc.current;
    dragId.current = null;
    dragSrc.current = null;
    setDragging(false);
    setOver("");
    if (id == null || src == null) return;
    setRows((r) => applyDrop(r, id, src, drop));
    setSaved(false);
  }
  function endDrag() {
    dragId.current = null;
    dragSrc.current = null;
    setDragging(false);
    setOver("");
  }

  // A row's type is fixed at creation (owner request). Rows reorder up/down.
  function moveRow(ri: number, dir: -1 | 1) {
    setRows((prev) => {
      const j = ri + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[ri], next[j]] = [next[j], next[ri]];
      return next;
    });
    setSaved(false);
  }
  function setRowTitle(ri: number, title: string) {
    setRows((prev) => prev.map((r, i) => (i === ri ? { ...r, title: title.trimStart() || undefined } : r)));
    setSaved(false);
  }
  function setRowTitleEn(ri: number, titleEn: string) {
    setRows((prev) => prev.map((r, i) => (i === ri ? { ...r, titleEn: titleEn.trimStart() || undefined } : r)));
    setSaved(false);
  }
  function addEmptyRow(rowType: RowType) {
    setRows((prev) => [...prev, { type: rowType, books: [] }]);
    setSaved(false);
  }
  function deleteRow(ri: number) {
    setRows((prev) => prev.filter((_, i) => i !== ri));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(apiPath("/api/admin/store/layout"), {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ layout: rows.filter((r) => r.books.length > 0) }),
      });
      if (!res.ok) throw new Error("تعذّر حفظ الترتيب");
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  }

  const dev = DEVICES.phone; // preview is phone-only; the app adapts other sizes itself
  const frameOuterW = dev.frameW + dev.bezel * 2;
  const frameOuterH = Math.round((dev.frameW * dev.h) / dev.w) + dev.bezel * 2;
  const previewScale = PREVIEW_H / frameOuterH;
  const pad = Math.round(dev.frameW * 0.045);
  const gap = Math.round(dev.frameW * 0.035);
  const carouselCardW = Math.round((dev.frameW - pad * 2 - gap) / 2);

  // ── read-only preview card (device frame) ───────────────────────────────────
  const previewCard = (id: number, single: boolean, basis: string) => {
    const b = bookMap.get(id);
    if (!b) return null;
    const cover = single ? b.coverLandscapeUrl || b.coverUrl || b.coverPortraitUrl : b.coverPortraitUrl || b.coverUrl || b.coverLandscapeUrl;
    const discounted = b.originalPriceEgp && b.originalPriceEgp > b.priceEgp;
    return (
      <div key={id} style={{ flexGrow: 0, flexShrink: 0, flexBasis: basis, minWidth: 0, background: P.card, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ width: "100%", aspectRatio: single ? "16 / 9" : "3 / 4", background: P.card2 }}>
          {cover ? (
            <img src={imgSrc(cover)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} draggable={false} />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><BookOpen size={24} color={P.primary} /></div>
          )}
        </div>
        <div style={{ padding: pad * 0.6 }}>
          <div style={{ color: P.text, fontSize: Math.max(10, dev.frameW * 0.033), fontWeight: 800, textAlign: "right", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.title}</div>
          <div style={{ display: "flex", flexDirection: "row-reverse", direction: "ltr", alignItems: "center", gap: 6, marginTop: 3, justifyContent: "flex-start" }}>
            <span style={{ color: P.primary, fontSize: Math.max(10, dev.frameW * 0.034), fontWeight: 800 }}>{b.priceEgp} ج</span>
            {discounted ? <span style={{ color: P.muted, fontSize: Math.max(9, dev.frameW * 0.028), textDecoration: "line-through" }}>{b.originalPriceEgp}</span> : null}
          </div>
        </div>
      </div>
    );
  };

  // ── draggable editor chip (right panel) ─────────────────────────────────────
  const editorChip = (id: number, rowIndex: number, cardIndex: number, basis: string) => {
    const b = bookMap.get(id);
    if (!b) return null;
    const cover = b.coverPortraitUrl || b.coverUrl || b.coverLandscapeUrl;
    const key = `c-${rowIndex}-${cardIndex}`;
    const active = over === key;
    return (
      <div
        key={key}
        draggable
        onDragStart={(e) => { dragId.current = id; dragSrc.current = { rowIndex, cardIndex }; setDragging(true); e.dataTransfer.effectAllowed = "copyMove"; }}
        onDragEnd={endDrag}
        onDragOver={(e) => { if (dragging) { e.preventDefault(); e.stopPropagation(); setOver(key); } }}
        onDragLeave={() => setOver((o) => (o === key ? "" : o))}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop({ kind: "card", rowIndex, cardIndex }); }}
        style={{
          flexGrow: 0, flexShrink: 0, flexBasis: basis, minWidth: 0,
          background: "var(--card, #f8f8f9)", borderRadius: 12, overflow: "hidden", cursor: "grab",
          outline: active ? `2px solid ${P.primary}` : "2px solid transparent",
          opacity: dragging && dragId.current === id && dragSrc.current?.rowIndex === rowIndex && dragSrc.current?.cardIndex === cardIndex ? 0.4 : 1,
          border: "1px solid rgba(0,0,0,0.08)",
        }}
        className="bg-muted"
      >
        <div style={{ width: "100%", aspectRatio: "3 / 4", background: "rgba(0,0,0,0.06)", position: "relative" }}>
          {cover ? (
            <img src={imgSrc(cover)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} draggable={false} />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><BookOpen size={22} className="text-primary" /></div>
          )}
          <div style={{ position: "absolute", top: 4, insetInlineStart: 4, background: "rgba(0,0,0,0.55)", borderRadius: 6, padding: 2, display: "flex" }}><GripVertical size={12} color="#fff" /></div>
        </div>
        <div className="p-1.5">
          <div className="text-[11px] font-bold text-foreground text-right truncate">{b.title}</div>
          <div className="text-[11px] font-black text-primary text-right">{b.priceEgp} ج</div>
        </div>
      </div>
    );
  };

  // one create drop-zone (render helper, not a component → reconciles in place)
  const addZone = (rowType: RowType, label: string, icon: ReactNode) => {
    const key = `add-${rowType}`;
    const active = over === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => addEmptyRow(rowType)}
        onDragOver={(e) => { if (dragging) { e.preventDefault(); setOver(key); } }}
        onDragLeave={() => setOver((o) => (o === key ? "" : o))}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop({ kind: "newRow", atIndex: rows.length, rowType }); }}
        className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-3 text-xs font-black border-2 border-dashed transition cursor-pointer hover:bg-muted ${active ? "border-primary bg-primary/10 text-primary" : rowType === "carousel" ? "border-primary/40 text-primary/80" : "border-border text-muted-foreground"}`}
      >
        {icon} {label}
      </button>
    );
  };

  // ── device preview (LEFT), read-only ────────────────────────────────────────
  const previewRows = (
    <div style={{ width: dev.frameW, background: P.bg, height: Math.round((dev.frameW * dev.h) / dev.w), borderRadius: dev.radius - dev.bezel, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: `${pad}px ${pad}px ${Math.round(pad * 0.6)}px`, display: "flex", flexDirection: "row-reverse", direction: "ltr", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ color: P.text, fontWeight: 900, fontSize: Math.max(15, dev.frameW * 0.055) }}>المتجر</span>
        <div style={{ display: "flex", gap: 6 }}>{[0, 1, 2].map((i) => <div key={i} style={{ width: Math.max(22, dev.frameW * 0.085), height: Math.max(22, dev.frameW * 0.085), borderRadius: 999, background: P.card }} />)}</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: `${Math.round(pad * 0.4)}px ${pad}px ${pad}px` }}>
        {rows.filter((r) => r.books.length > 0).map((rowObj, ri) => {
          const isCarousel = rowObj.type === "carousel";
          const single = !isCarousel && rowObj.books.length === 1;
          const cols = Math.min(rowObj.books.length, MAX_NORMAL);
          return (
            <div key={ri} style={{ marginBottom: gap }}>
              {rowObj.title || rowObj.titleEn ? <div style={{ color: P.text, fontWeight: 800, fontSize: Math.max(11, dev.frameW * 0.04), textAlign: "right", marginBottom: 5, paddingInlineEnd: 2 }}>{rowObj.title || rowObj.titleEn}</div> : null}
              <div style={{ display: "flex", flexDirection: "row-reverse", direction: "ltr", flexWrap: isCarousel ? "nowrap" : "wrap", overflowX: isCarousel ? "auto" : "visible", gap }}>
                {rowObj.books.map((id) => {
                  const basis = isCarousel ? `${carouselCardW}px` : single ? "100%" : `calc((100% - ${(cols - 1) * gap}px) / ${cols})`;
                  return previewCard(id, single, basis);
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div dir="rtl" onClick={(e) => e.stopPropagation()} className="w-full max-w-6xl h-[92vh] overflow-hidden rounded-3xl bg-background shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border p-4 shrink-0">
          <div>
            <h2 className="font-display text-lg font-black">معاينة وترتيب المتجر</h2>
            <p className="text-xs text-muted-foreground mt-0.5">رتّب من اللوحة على اليمين — والجهاز على الشمال بيوريك الشكل النهائي للطلاب (معاينة بس).</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-foreground/5"><X className="w-5 h-5" /></button>
        </div>

        {/* Body: preview (LEFT) + editor (RIGHT) */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">جاري التحميل…</div>
        ) : books.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center text-sm text-muted-foreground px-6">مفيش كتب متاحة (لازم يكون فيه كتب ظاهرة في المتجر ومخزونها أكبر من صفر).</div>
        ) : (
          <div className="flex-1 min-h-0 flex" style={{ direction: "ltr" }}>
            {/* LEFT — read-only device preview */}
            <div className="shrink-0 border-e border-border bg-muted/40 flex items-start justify-center overflow-auto p-5" style={{ width: Math.round(frameOuterW * previewScale) + 40 }}>
              <div style={{ width: Math.round(frameOuterW * previewScale), height: PREVIEW_H, flexShrink: 0 }}>
                <div style={{ width: frameOuterW, height: frameOuterH, transform: `scale(${previewScale})`, transformOrigin: "top left", background: "#000", borderRadius: dev.radius, padding: dev.bezel, boxShadow: "0 12px 40px rgba(0,0,0,0.4)" }}>
                  {previewRows}
                </div>
              </div>
            </div>

            {/* RIGHT — editor */}
            <div dir="rtl" className="flex-1 min-w-0 overflow-y-auto p-5 space-y-3">
              {rows.map((rowObj, ri) => {
                const isCarousel = rowObj.type === "carousel";
                const single = !isCarousel && rowObj.books.length === 1;
                const cols = Math.min(rowObj.books.length, MAX_NORMAL);
                return (
                  <div key={ri} className="rounded-2xl border border-border p-3 bg-muted/20">
                    {/* header: name input (right) + type badge + move arrows */}
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 min-w-0 flex flex-col">
                        <input
                          value={rowObj.title ?? ""}
                          onChange={(e) => setRowTitle(ri, e.target.value)}
                          placeholder="اسم السطر بالعربي (اختياري)"
                          dir="rtl"
                          className="w-full min-w-0 bg-transparent text-sm font-bold text-right outline-none placeholder:text-muted-foreground/60 placeholder:font-normal"
                        />
                        <input
                          value={rowObj.titleEn ?? ""}
                          onChange={(e) => setRowTitleEn(ri, e.target.value)}
                          placeholder="Row name in English (optional)"
                          dir="ltr"
                          className="w-full min-w-0 bg-transparent text-xs font-semibold text-left text-muted-foreground outline-none placeholder:text-muted-foreground/50 placeholder:font-normal"
                        />
                      </div>
                      <span className={`shrink-0 flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full ${isCarousel ? "bg-primary text-white" : "bg-foreground/10 text-muted-foreground"}`}>
                        {isCarousel ? <RefreshCw className="w-3 h-3" /> : <LayoutGrid className="w-3 h-3" />}
                        {isCarousel ? `متحرك · ${rowObj.books.length}` : "عادي"}
                      </span>
                      <div className="shrink-0 flex gap-1">
                        <button onClick={() => moveRow(ri, -1)} disabled={ri === 0} className="p-1 rounded-lg hover:bg-foreground/10 disabled:opacity-30" title="حرّك لفوق"><ChevronUp className="w-4 h-4" /></button>
                        <button onClick={() => moveRow(ri, 1)} disabled={ri === rows.length - 1} className="p-1 rounded-lg hover:bg-foreground/10 disabled:opacity-30" title="حرّك لتحت"><ChevronDown className="w-4 h-4" /></button>
                        <button onClick={() => deleteRow(ri)} className="p-1 rounded-lg hover:bg-red-500/10 text-red-500" title="حذف الصف"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                    {/* books (draggable) */}
                    <div
                      onDragOver={(e) => { if (dragging) { e.preventDefault(); setOver(`re-${ri}`); } }}
                      onDrop={(e) => { e.preventDefault(); onDrop({ kind: "rowEnd", rowIndex: ri }); }}
                      className={`flex gap-2 rounded-xl p-1.5 min-h-[40px] ${over === `re-${ri}` ? "bg-primary/10" : ""}`}
                      style={{ flexDirection: "row-reverse", flexWrap: isCarousel ? "nowrap" : "wrap", overflowX: isCarousel ? "auto" : "visible" }}
                    >
                      {rowObj.books.length === 0 ? (
                        <span className="w-full text-center text-[11px] text-muted-foreground py-3 rounded-lg border border-dashed border-border">اسحب كتب هنا</span>
                      ) : (
                        rowObj.books.map((id, ci) => {
                          const basis = isCarousel ? "104px" : single ? "62%" : `calc((100% - 8px) / ${cols})`;
                          return editorChip(id, ri, ci, basis);
                        })
                      )}
                    </div>
                  </div>
                );
              })}

              {/* create zones */}
              <div className="flex gap-2 pt-1">
                {addZone("normal", "+ صف عادي", <LayoutGrid className="w-3.5 h-3.5" />)}
                {addZone("carousel", "+ صف متحرك", <RefreshCw className="w-3.5 h-3.5" />)}
              </div>

              <div className="text-[11px] text-muted-foreground leading-relaxed pt-1 space-y-1">
                <p>صف فيه كتاب = بعرض كامل · كتابين = جنب بعض. الحد الأقصى للصف العادي كتابين.</p>
                <p><b>سطر متحرك</b> = يظهر ٢ ويتبدّلوا كل ٣ ثواني (والطالب يمرّره بإيده) — يستحمل أي عدد كتب.</p>
                <p>عشان تعمل صف: <b>اضغط</b> «+ صف عادي» أو «+ صف متحرك» (أو اسحب عليه كتاب) → يتعمل صف تسحب فيه الكتب. رتّب الصفوف بالأسهم (▲ ▼) وامسح أي صف بسلة المهملات 🗑️. اكتب <b>اسم السطر</b> فوق كل صف مرة بالعربي ومرة بالإنجليزي (اختياري) — الطالب اللي جهازه عربي يشوف الاسم العربي (على اليمين)، واللي جهازه إنجليزي يشوف الإنجليزي (على الشمال).</p>
                <p>الصف <b>المتحرك بينسخ</b> الكتاب — يفضل في صفه العادي كمان، وتقدر تكرّر نفس الكتب في أكتر من صف متحرك. لحذف كتاب من صف متحرك اسحبه منه لأي صف عادي.</p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border p-4 shrink-0">
          <div className="text-sm">
            {error ? <span className="text-red-500 font-bold">{error}</span> : saved ? <span className="text-emerald-600 font-bold">تم الحفظ ✓</span> : <span className="text-muted-foreground">{rows.length} صف · {rows.reduce((s, r) => s + r.books.length, 0)} كتاب</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setRows(chunkPairs(books.map((b) => b.id)).map((ids) => ({ type: "normal" as RowType, books: ids }))); setSaved(false); }} disabled={loading || saving} className="text-sm py-2.5 px-4 rounded-2xl border border-border font-bold flex items-center gap-2 hover:bg-muted transition disabled:opacity-50">
              <RotateCcw className="w-4 h-4" /> ترتيب افتراضي
            </button>
            <button onClick={save} disabled={loading || saving || books.length === 0} className="btn-primary text-sm py-2.5 px-6 flex items-center gap-2 disabled:opacity-60">
              <Save className="w-4 h-4" /> {saving ? "جاري الحفظ…" : "حفظ الترتيب"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
