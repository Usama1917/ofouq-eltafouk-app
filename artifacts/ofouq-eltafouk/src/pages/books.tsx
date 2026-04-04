import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useListBooks } from "@workspace/api-client-react";
import { BookOpen, Search, Library, Truck, TicketPercent } from "lucide-react";

const CART_STORAGE_KEY = "ofouq_books_cart_v1";

type CartItem = {
  id: number;
  title: string;
  subject: string;
  coverUrl: string | null;
  priceEgp: number;
  originalPriceEgp: number;
  freeShipping: boolean;
  quantity: number;
};

const stagger = {
  container: { animate: { transition: { staggerChildren: 0.06 } } },
  item: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as const } },
  },
};

function formatEgp(amount: number) {
  return `${amount.toLocaleString("ar-EG")} ج.م`;
}

export default function Books() {
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState<string | undefined>();
  const [addingToCartId, setAddingToCartId] = useState<number | null>(null);
  const [materialFilters, setMaterialFilters] = useState<string[]>([]);

  const { data: booksData, isLoading } = useListBooks({ search: search || undefined, category: subject });
  const books = Array.isArray(booksData) ? (booksData as any[]) : [];

  useEffect(() => {
    const loadMaterialFilters = async () => {
      try {
        const res = await fetch("/api/materials");
        const data = await res.json().catch(() => []);
        if (res.ok && Array.isArray(data)) {
          const normalized = data.map((item) => String(item).trim()).filter(Boolean);
          setMaterialFilters(Array.from(new Set(normalized)));
        }
      } catch {
        // no-op
      }
    };
    void loadMaterialFilters();
  }, []);

  const handleAddToCart = (book: any) => {
    try {
      setAddingToCartId(book.id);
      const existingRaw = localStorage.getItem(CART_STORAGE_KEY);
      const existingCart: CartItem[] = existingRaw ? JSON.parse(existingRaw) : [];
      const existingIndex = existingCart.findIndex((item) => item.id === book.id);
      if (existingIndex >= 0) {
        existingCart[existingIndex] = {
          ...existingCart[existingIndex],
          quantity: existingCart[existingIndex].quantity + 1,
        };
      } else {
        existingCart.push({
          id: book.id,
          title: String(book.title ?? ""),
          subject: String(book.subject ?? book.category ?? ""),
          coverUrl: book.coverUrl ?? null,
          priceEgp: Number(book.priceEgp ?? book.pointsPrice ?? 0),
          originalPriceEgp: Number(book.originalPriceEgp ?? book.priceEgp ?? book.pointsPrice ?? 0),
          freeShipping: Boolean(book.freeShipping),
          quantity: 1,
        });
      }
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(existingCart));
      alert("تمت إضافة الكتاب إلى السلة");
    } catch (err: any) {
      alert(err?.message || "تعذر إضافة الكتاب إلى السلة");
    } finally {
      setAddingToCartId(null);
    }
  };

  const fallbackFilters = useMemo(
    () =>
      Array.from(
        new Set(
          books
            .map((book) => String(book.subject ?? book.category ?? "").trim())
            .filter(Boolean),
        ),
      ),
    [books],
  );
  const subjects = ["الكل", ...(materialFilters.length > 0 ? materialFilters : fallbackFilters)];

  return (
    <motion.div variants={stagger.container} initial="initial" animate="animate" className="space-y-8">
      <motion.div variants={stagger.item} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-5">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white shadow-lg shadow-primary/25">
              <Library className="w-5 h-5" />
            </div>
            <h1 className="text-3xl font-display font-black text-foreground">شراء الكتب</h1>
          </div>
          <p className="text-muted-foreground font-medium">تصفح الكتب المتاحة وأضف ما يناسبك إلى السلة.</p>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="ابحث عن كتاب..."
            className="w-full pl-4 pr-11 py-3 rounded-2xl bg-white/70 backdrop-blur border border-white/60 focus:border-primary/40 focus:ring-4 focus:ring-primary/10 transition-all outline-none shadow-sm font-medium"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </motion.div>

      <motion.div variants={stagger.item} className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
        {subjects.map((s) => (
          <button
            key={s}
            onClick={() => setSubject(s === "الكل" ? undefined : s)}
            className={`px-5 py-2 rounded-full font-semibold whitespace-nowrap transition-all text-sm ${
              (subject === s || (!subject && s === "الكل"))
                ? "bg-primary text-white shadow-md shadow-primary/30"
                : "bg-white/60 backdrop-blur text-muted-foreground border border-white/60 hover:bg-white/90 hover:text-foreground"
            }`}
          >
            {s}
          </button>
        ))}
      </motion.div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-card h-80 animate-pulse bg-white/40" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {books.map((book) => {
            const currentPrice = Number(book.priceEgp ?? book.pointsPrice ?? 0);
            const originalPrice = Number(book.originalPriceEgp ?? currentPrice);
            const subjectLabel = book.subject || book.category;
            const isAddingToCart = addingToCartId === book.id;

            return (
              <motion.div
                key={book.id}
                variants={stagger.item}
                whileHover={{ y: -5 }}
                className="glass-card overflow-hidden flex flex-col"
              >
                <div className="h-44 relative overflow-hidden">
                  {book.coverUrl ? (
                    <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col items-center justify-center text-primary/30">
                      <BookOpen className="w-12 h-12 mb-2" />
                    </div>
                  )}

                  <div className="absolute top-3 right-3 max-w-[75%] truncate whitespace-nowrap bg-white/90 backdrop-blur text-primary px-3 py-1 rounded-full text-xs font-bold shadow-sm">
                    {subjectLabel}
                  </div>

                  {book.freeShipping && (
                    <div className="absolute bottom-3 left-3 bg-emerald-500 text-white px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1 shadow-md">
                      <Truck className="w-3.5 h-3.5" />
                      شحن مجاني
                    </div>
                  )}
                </div>

                <div className="p-5 flex-1 flex flex-col">
                  <h3 className="font-bold text-foreground mb-2 line-clamp-1 text-base">{book.title}</h3>
                  <p className="text-muted-foreground text-xs mb-4 line-clamp-2">{book.description}</p>

                  <div className="mt-auto mb-4 space-y-1.5">
                    {originalPrice > currentPrice && (
                      <p className="text-xs text-muted-foreground line-through">{formatEgp(originalPrice)}</p>
                    )}
                    <p className="text-amber-600 font-black text-lg">{formatEgp(currentPrice)}</p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAddToCart(book)}
                      disabled={isAddingToCart}
                      className="flex-1 bg-primary text-white py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 transition-all shadow-sm shadow-primary/20 disabled:opacity-60"
                    >
                      {isAddingToCart ? "جاري الإضافة..." : "إضافة إلى السلة"}
                    </button>
                  </div>

                  <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
                    <TicketPercent className="w-3.5 h-3.5" />
                    يمكن تطبيق كود خصم عند إتمام الطلب
                  </p>
                </div>
              </motion.div>
            );
          })}

          {books.length === 0 && (
            <div className="col-span-full py-24 text-center text-muted-foreground flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-3xl bg-white/70 flex items-center justify-center">
                <BookOpen className="w-10 h-10 text-muted-foreground/40" />
              </div>
              <p className="text-lg font-bold text-muted-foreground">لا توجد كتب مطابقة للبحث</p>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
