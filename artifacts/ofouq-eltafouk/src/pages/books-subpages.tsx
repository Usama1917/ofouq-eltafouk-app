import { motion } from "framer-motion";
import type { ElementType } from "react";
import { ShoppingCart, Truck, History, Wrench } from "lucide-react";

function PlaceholderCard({
  title,
  subtitle,
  icon: Icon,
}: {
  title: string;
  subtitle: string;
  icon: ElementType;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-8 md:p-10 text-right"
      dir="rtl"
    >
      <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-5">
        <Icon className="w-7 h-7" />
      </div>
      <h1 className="text-3xl font-display font-black text-foreground mb-2">{title}</h1>
      <p className="text-muted-foreground text-base mb-6">{subtitle}</p>
      <div className="rounded-2xl bg-white/65 border border-white/70 p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-400/15 text-amber-600 flex items-center justify-center">
          <Wrench className="w-4.5 h-4.5" />
        </div>
        <p className="text-sm font-semibold text-foreground">الصفحة مضافة مبدئيًا وجاهزة لتجهيز الوظائف بالتفصيل.</p>
      </div>
    </motion.div>
  );
}

export function BooksCartPage() {
  return (
    <PlaceholderCard
      title="سلة الكتب"
      subtitle="هنا ستظهر الكتب التي أضفتها للسلة قبل إتمام الشراء."
      icon={ShoppingCart}
    />
  );
}

export function BooksTrackingPage() {
  return (
    <PlaceholderCard
      title="تتبع الأوردرات"
      subtitle="تابع حالة الشحن والتسليم خطوة بخطوة لكل طلب."
      icon={Truck}
    />
  );
}

export function BooksOrdersHistoryPage() {
  return (
    <PlaceholderCard
      title="سجل الأوردرات"
      subtitle="عرض كل الطلبات السابقة وتفاصيل كل عملية شراء."
      icon={History}
    />
  );
}
