import { useState } from "react";
import { motion } from "framer-motion";
import { useListBooks, useReserveBook, usePurchaseBook, useGetPoints } from "@workspace/api-client-react";
import { BookOpen, Search, Coins, AlertCircle } from "lucide-react";

export default function Books() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | undefined>();
  
  const { data: books = [], isLoading } = useListBooks({ search: search || undefined, category });
  const { data: pointsData } = useGetPoints();
  
  const reserveBook = useReserveBook();
  const purchaseBook = usePurchaseBook();

  const handleReserve = (id: number) => {
    reserveBook.mutate({ id }, {
      onSuccess: () => alert("تم حجز الكتاب بنجاح!")
    });
  };

  const handlePurchase = (id: number, price: number) => {
    if ((pointsData?.balance || 0) < price) {
      alert("رصيد النقاط غير كافٍ");
      return;
    }
    if (confirm("هل أنت متأكد من شراء هذا الكتاب باستخدام النقاط؟")) {
      purchaseBook.mutate({ id }, {
        onSuccess: () => alert("تم شراء الكتاب بنجاح!")
      });
    }
  };

  const categories = ["الكل", "علوم", "رياضيات", "لغات", "تاريخ", "برمجة"];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground mb-2">المكتبة الرقمية</h1>
          <p className="text-muted-foreground">تصفح أحدث الكتب، احجز نسختك أو اشتريها بنقاطك.</p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input 
            type="text"
            placeholder="ابحث عن كتاب..."
            className="w-full pl-4 pr-12 py-3 rounded-xl bg-card border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat === "الكل" ? undefined : cat)}
            className={`px-5 py-2 rounded-full font-bold whitespace-nowrap transition-all ${
              (category === cat || (!category && cat === "الكل"))
                ? "bg-primary text-white shadow-md"
                : "bg-card text-foreground hover:bg-muted border border-border"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-card rounded-2xl h-80 animate-pulse border border-border/50"></div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {books.map((book) => (
            <motion.div 
              key={book.id}
              whileHover={{ y: -5 }}
              className="bg-card rounded-2xl overflow-hidden border border-border/50 shadow-lg flex flex-col"
            >
              <div className="h-48 bg-muted relative">
                {book.coverUrl ? (
                  <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-indigo-100 to-primary/20 flex flex-col items-center justify-center text-primary">
                    <BookOpen className="w-12 h-12 mb-2 opacity-50" />
                    <span className="font-bold opacity-50">{book.category}</span>
                  </div>
                )}
                <div className="absolute top-3 right-3 bg-white/90 backdrop-blur text-primary px-3 py-1 rounded-full text-sm font-bold shadow-sm">
                  {book.category}
                </div>
              </div>
              <div className="p-5 flex-1 flex flex-col">
                <h3 className="text-xl font-bold text-foreground mb-1 line-clamp-1">{book.title}</h3>
                <p className="text-muted-foreground text-sm mb-3">{book.author}</p>
                <div className="flex items-center gap-1.5 text-accent font-bold mb-4 mt-auto">
                  <Coins className="w-5 h-5" />
                  {book.pointsPrice} نقطة
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handlePurchase(book.id, book.pointsPrice)}
                    disabled={purchaseBook.isPending}
                    className="flex-1 bg-gradient-to-r from-accent to-orange-500 text-white py-2.5 rounded-xl font-bold hover:shadow-lg transition-all"
                  >
                    شراء
                  </button>
                  <button 
                    onClick={() => handleReserve(book.id)}
                    disabled={reserveBook.isPending}
                    className="flex-1 bg-primary/10 text-primary py-2.5 rounded-xl font-bold hover:bg-primary/20 transition-all"
                  >
                    حجز
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
          {books.length === 0 && (
            <div className="col-span-full py-20 text-center text-muted-foreground flex flex-col items-center">
              <AlertCircle className="w-16 h-16 mb-4 text-muted" />
              <p className="text-xl font-bold">لا توجد كتب مطابقة للبحث</p>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
