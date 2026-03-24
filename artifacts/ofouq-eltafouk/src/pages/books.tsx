import { useState } from "react";
import { motion } from "framer-motion";
import { useListBooks, useReserveBook, usePurchaseBook, useGetPoints } from "@workspace/api-client-react";
import { BookOpen, Search, Coins, Library } from "lucide-react";

const stagger = {
  container: { animate: { transition: { staggerChildren: 0.06 } } },
  item: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] } },
  },
};

export default function Books() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | undefined>();

  const { data: books = [], isLoading } = useListBooks({ search: search || undefined, category });
  const { data: pointsData } = useGetPoints();

  const reserveBook = useReserveBook();
  const purchaseBook = usePurchaseBook();

  const handleReserve = (id: number) => {
    reserveBook.mutate({ id }, { onSuccess: () => alert("تم حجز الكتاب بنجاح!") });
  };

  const handlePurchase = (id: number, price: number) => {
    if ((pointsData?.balance || 0) < price) { alert("رصيد النقاط غير كافٍ"); return; }
    if (confirm("هل أنت متأكد من شراء هذا الكتاب باستخدام النقاط؟")) {
      purchaseBook.mutate({ id }, { onSuccess: () => alert("تم شراء الكتاب بنجاح!") });
    }
  };

  const categories = ["الكل", "علوم", "رياضيات", "لغات", "تاريخ", "برمجة"];

  return (
    <motion.div variants={stagger.container} initial="initial" animate="animate" className="space-y-8">
      {/* Header */}
      <motion.div variants={stagger.item} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-5">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white shadow-lg shadow-primary/25">
              <Library className="w-5 h-5" />
            </div>
            <h1 className="text-3xl font-display font-black text-foreground">المكتبة الرقمية</h1>
          </div>
          <p className="text-muted-foreground font-medium">تصفح أحدث الكتب، احجز نسختك أو اشتريها بنقاطك.</p>
        </div>
        {/* Search */}
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

      {/* Category pills */}
      <motion.div variants={stagger.item} className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat === "الكل" ? undefined : cat)}
            className={`px-5 py-2 rounded-full font-semibold whitespace-nowrap transition-all text-sm ${
              (category === cat || (!category && cat === "الكل"))
                ? "bg-primary text-white shadow-md shadow-primary/30"
                : "bg-white/60 backdrop-blur text-muted-foreground border border-white/60 hover:bg-white/90 hover:text-foreground"
            }`}
          >
            {cat}
          </button>
        ))}
      </motion.div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-card h-80 animate-pulse bg-white/40" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {books.map((book) => (
            <motion.div
              key={book.id}
              variants={stagger.item}
              whileHover={{ y: -5 }}
              className="glass-card overflow-hidden flex flex-col"
            >
              {/* Cover */}
              <div className="h-44 relative overflow-hidden">
                {book.coverUrl ? (
                  <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col items-center justify-center text-primary/30">
                    <BookOpen className="w-12 h-12 mb-2" />
                  </div>
                )}
                <div className="absolute top-3 right-3 bg-white/85 backdrop-blur text-primary px-3 py-1 rounded-full text-xs font-bold shadow-sm">
                  {book.category}
                </div>
              </div>
              {/* Info */}
              <div className="p-5 flex-1 flex flex-col">
                <h3 className="font-bold text-foreground mb-1 line-clamp-1 text-base">{book.title}</h3>
                <p className="text-muted-foreground text-xs mb-4">{book.author}</p>
                <div className="flex items-center gap-1.5 text-amber-500 font-bold text-sm mb-4 mt-auto">
                  <Coins className="w-4 h-4" />
                  {book.pointsPrice} نقطة
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePurchase(book.id, book.pointsPrice)}
                    disabled={purchaseBook.isPending}
                    className="flex-1 bg-primary text-white py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 transition-all shadow-sm shadow-primary/20 disabled:opacity-60"
                  >
                    شراء
                  </button>
                  <button
                    onClick={() => handleReserve(book.id)}
                    disabled={reserveBook.isPending}
                    className="flex-1 bg-primary/8 text-primary py-2.5 rounded-xl text-sm font-bold hover:bg-primary/15 transition-all disabled:opacity-60"
                  >
                    حجز
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
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
