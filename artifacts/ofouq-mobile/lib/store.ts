import { apiFetch } from "@/lib/api";
import { resolveMediaUrl } from "@/lib/media";

// v2 Phase 5 — bookstore. Feature-lib mirroring lib/engagement.ts: every fn takes
// the bearer `token` first; the SCREEN passes useAuth().token in. Writes are plain
// async calls the screen follows with queryClient.invalidateQueries (no useMutation).

export type StoreBook = {
  id: number;
  title: string;
  author: string;
  description: string;
  category: string;
  subject: string;
  coverUrl: string | null;
  // v2 — orientation-specific card art. Landscape (16:9) for a full-width card,
  // portrait (3:4) for a grid card; dark variants optional (fall back to light).
  coverPortraitUrl: string | null;
  coverLandscapeUrl: string | null;
  coverPortraitDarkUrl: string | null;
  coverLandscapeDarkUrl: string | null;
  priceEgp: number;
  originalPriceEgp: number | null;
  freeShipping: boolean;
  stockQuantity: number;
  imageUrls: string[] | null;
  unlocksSubjectId: number | null;
  favorite?: boolean;
};

// Pick the best cover for a slot. `landscape` = full-width card, else grid card;
// `dark` prefers the dark variant when present. Everything falls back down to
// the other orientation and finally `coverUrl`, so old books still show art.
export function pickBookCover(
  book: Pick<StoreBook, "coverUrl" | "coverPortraitUrl" | "coverLandscapeUrl" | "coverPortraitDarkUrl" | "coverLandscapeDarkUrl">,
  opts: { landscape: boolean; dark: boolean },
): string | null {
  if (opts.landscape) {
    return (
      (opts.dark ? book.coverLandscapeDarkUrl : null) ||
      book.coverLandscapeUrl ||
      book.coverPortraitUrl ||
      book.coverUrl ||
      null
    );
  }
  return (
    (opts.dark ? book.coverPortraitDarkUrl : null) ||
    book.coverPortraitUrl ||
    book.coverLandscapeUrl ||
    book.coverUrl ||
    null
  );
}

export type StoreBookDetail = StoreBook & {
  unlocksSubject: { id: number; name: string } | null;
  related: StoreBook[];
};

export type CartLine = {
  id: number;
  bookId: number;
  title: string;
  author: string;
  coverUrl: string | null;
  priceEgp: number;
  stockQuantity: number;
  quantity: number;
};
export type CartData = { items: CartLine[]; subtotal: number };

// Wishlist rows return the BOOK id as `id` (not a cart-line id) — distinct shape.
export type WishlistBook = {
  id: number;
  title: string;
  author: string;
  coverUrl: string | null;
  priceEgp: number;
  stockQuantity: number;
};

function resolveImageUrls(urls: string[] | null) {
  if (!urls) return urls;
  return urls.map((url) => resolveMediaUrl(url)).filter((url): url is string => Boolean(url));
}

function resolveCoverUrl<T extends { coverUrl: string | null }>(item: T): T {
  return { ...item, coverUrl: resolveMediaUrl(item.coverUrl) };
}

function resolveBookMedia<T extends StoreBook>(book: T): T {
  return {
    ...book,
    coverUrl: resolveMediaUrl(book.coverUrl),
    coverPortraitUrl: resolveMediaUrl(book.coverPortraitUrl),
    coverLandscapeUrl: resolveMediaUrl(book.coverLandscapeUrl),
    coverPortraitDarkUrl: resolveMediaUrl(book.coverPortraitDarkUrl),
    coverLandscapeDarkUrl: resolveMediaUrl(book.coverLandscapeDarkUrl),
    imageUrls: resolveImageUrls(book.imageUrls),
  };
}

function resolveBookDetailMedia(book: StoreBookDetail): StoreBookDetail {
  return {
    ...resolveBookMedia(book),
    related: book.related.map(resolveBookMedia),
  };
}

export type StoreAddress = {
  id: number;
  recipientName: string;
  phone: string;
  governorate: string;
  city: string;
  street: string;
  notes: string | null;
};

export type ShippingQuote = {
  governorate: string;
  subtotal: number;
  shippingEgp: number;
  freeShipping: boolean;
  freeShippingThreshold: number | null;
};

export type StoreOrderSummary = {
  id: number;
  orderNumber: string | null;
  status: string;
  totalEgp: number;
  paymentMethod: string;
  createdAt: string;
  itemCount: number;
};
export type StoreOrderItem = { id: number; titleSnapshot: string; unitPriceEgp: number; quantity: number };
export type StoreTimelineEntry = { id: number; status: string; note: string | null; createdAt: string };
export type StoreOrderDetail = {
  id: number;
  orderNumber: string | null;
  status: string;
  recipientName: string;
  phone: string;
  governorate: string;
  city: string;
  street: string;
  addressNotes: string | null;
  subtotalEgp: number;
  shippingEgp: number;
  discountEgp: number;
  totalEgp: number;
  voucherCode: string | null;
  paymentMethod: string;
  createdAt: string;
  items: StoreOrderItem[];
  timeline: StoreTimelineEntry[];
};

// ── query keys ───────────────────────────────────────────────────────────────
export const storeBooksKey = (subjectId?: number, yearId?: number, q?: string) =>
  ["store", "books", subjectId ?? 0, yearId ?? 0, q ?? ""] as const;
export const storeBookKey = (id: number | string) => ["store", "book", String(id)] as const;
export const cartKey = ["store", "cart"] as const;
export const addressKey = ["store", "address"] as const;
export const ordersKey = ["store", "orders"] as const;
export const orderKey = (id: number | string) => ["store", "order", String(id)] as const;
export const wishlistKey = ["store", "wishlist"] as const;
export const shippingQuoteKey = ["store", "shipping-quote"] as const;
export const storeLayoutKey = ["store", "layout"] as const;

// Owner-curated display rows. A normal row shows 1–2 books; a carousel row holds
// any number and auto-rotates 2 at a time. null = no custom layout.
export type LayoutRow = { type: "normal" | "carousel"; title?: string; titleEn?: string; books: number[] };
export function getStoreLayout(token: string | null) {
  return apiFetch<{ layout: LayoutRow[] | null }>("/api/store/layout", { token });
}

// ── catalog ──────────────────────────────────────────────────────────────────
export function listBooks(token: string | null, opts?: { subjectId?: number; yearId?: number; q?: string }) {
  const p = new URLSearchParams();
  if (opts?.subjectId) p.set("subjectId", String(opts.subjectId));
  if (opts?.yearId) p.set("yearId", String(opts.yearId));
  if (opts?.q) p.set("q", opts.q);
  const qs = p.toString();
  return apiFetch<StoreBook[]>(`/api/store/books${qs ? `?${qs}` : ""}`, { token }).then((books) =>
    books.map(resolveBookMedia),
  );
}
export function getBook(token: string | null, id: number | string) {
  return apiFetch<StoreBookDetail>(`/api/store/books/${id}`, { token }).then(resolveBookDetailMedia);
}

// ── cart ─────────────────────────────────────────────────────────────────────
export function getCart(token: string | null) {
  return apiFetch<CartData>("/api/store/cart", { token }).then((cart) => ({
    ...cart,
    items: cart.items.map(resolveCoverUrl),
  }));
}
export function addToCart(token: string | null, bookId: number, quantity = 1) {
  return apiFetch<CartData>("/api/store/cart", { method: "POST", token, body: JSON.stringify({ bookId, quantity }) });
}
export function updateCartItem(token: string | null, id: number, quantity: number) {
  return apiFetch<CartData>(`/api/store/cart/${id}`, { method: "PATCH", token, body: JSON.stringify({ quantity }) });
}
export function removeCartItem(token: string | null, id: number) {
  return apiFetch<CartData>(`/api/store/cart/${id}`, { method: "DELETE", token });
}

// ── address ──────────────────────────────────────────────────────────────────
export function getAddress(token: string | null) {
  return apiFetch<StoreAddress | null>("/api/store/address", { token });
}
export function saveAddress(token: string | null, address: Omit<StoreAddress, "id">) {
  return apiFetch<StoreAddress>("/api/store/address", { method: "PUT", token, body: JSON.stringify(address) });
}

// ── shipping + coupon ────────────────────────────────────────────────────────
export function getShippingQuote(token: string | null, governorate?: string) {
  const qs = governorate ? `?governorate=${encodeURIComponent(governorate)}` : "";
  return apiFetch<ShippingQuote>(`/api/store/shipping/quote${qs}`, { token });
}
export function checkCoupon(token: string | null, code: string) {
  return apiFetch<{ ok: boolean; discountEgp: number; freeShipping: boolean; code: string }>("/api/store/coupon/check", {
    method: "POST",
    token,
    body: JSON.stringify({ code }),
  });
}

// ── checkout + orders ────────────────────────────────────────────────────────
export function checkout(token: string | null, paymentMethod: string, voucherCode?: string) {
  return apiFetch<StoreOrderDetail>("/api/store/checkout", {
    method: "POST",
    token,
    body: JSON.stringify({ paymentMethod, voucherCode: voucherCode || undefined }),
  });
}
export function listOrders(token: string | null) {
  return apiFetch<StoreOrderSummary[]>("/api/store/orders", { token });
}
export function getOrder(token: string | null, id: number | string) {
  return apiFetch<StoreOrderDetail>(`/api/store/orders/${id}`, { token });
}
export function cancelOrder(token: string | null, id: number | string) {
  return apiFetch<{ ok: boolean }>(`/api/store/orders/${id}/cancel`, { method: "POST", token });
}

// ── wishlist ─────────────────────────────────────────────────────────────────
export function getWishlist(token: string | null) {
  return apiFetch<WishlistBook[]>("/api/store/wishlist", { token }).then((books) => books.map(resolveCoverUrl));
}
export function addWishlist(token: string | null, bookId: number) {
  return apiFetch<{ ok: boolean; favorite: boolean }>(`/api/store/wishlist/${bookId}`, { method: "POST", token });
}
export function removeWishlist(token: string | null, bookId: number) {
  return apiFetch<{ ok: boolean; favorite: boolean }>(`/api/store/wishlist/${bookId}`, { method: "DELETE", token });
}

// Order status → localized label + emoji, for the tracking timeline.
export const ORDER_STATUS_FLOW = ["placed", "confirmed", "packed", "shipped", "out_for_delivery", "delivered"] as const;
export function orderStatusLabel(status: string, en: boolean): string {
  const map: Record<string, [string, string]> = {
    placed: ["تم الطلب", "Placed"],
    confirmed: ["تم التأكيد", "Confirmed"],
    packed: ["بيتجهّز", "Packing"],
    shipped: ["اتشحن", "Shipped"],
    out_for_delivery: ["خرج للتوصيل", "Out for delivery"],
    delivered: ["اتسلّم", "Delivered"],
    cancelled: ["ملغي", "Cancelled"],
  };
  const pair = map[status] ?? [status, status];
  return en ? pair[1] : pair[0];
}
