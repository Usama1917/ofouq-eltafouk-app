import { motion } from "framer-motion";
import { useGetPoints, useGetPointsHistory, usePurchasePoints } from "@workspace/api-client-react";
import { Coins, ArrowUpRight, ArrowDownRight, Sparkles, History, TrendingUp } from "lucide-react";
import { formatNumber, toEnglishDigits } from "@/lib/format";

const stagger = {
  container: { animate: { transition: { staggerChildren: 0.08 } } },
  item: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as const } },
  },
};

export default function Points() {
  const { data: pointsData } = useGetPoints();
  const { data: history = [] } = useGetPointsHistory();
  const purchasePoints = usePurchasePoints();

  const handlePurchase = (amount: number, packageName: string) => {
    purchasePoints.mutate(
      { data: { amount, packageName } },
      { onSuccess: () => alert(`تم إضافة ${formatNumber(amount)} نقطة بنجاح!`) }
    );
  };

  const packages = [
    { name: "الأساسية", amount: 100, price: "$5", gradient: "from-sky-400 to-blue-600", glow: "shadow-sky-500/25" },
    { name: "المتقدمة", amount: 500, price: "$20", gradient: "from-violet-500 to-indigo-600", glow: "shadow-violet-500/25", popular: true },
    { name: "الذهبية", amount: 1500, price: "$50", gradient: "from-amber-400 to-orange-500", glow: "shadow-amber-500/25" },
  ];

  return (
    <motion.div variants={stagger.container} initial="initial" animate="animate" className="space-y-8">
      {/* Balance hero */}
      <motion.div variants={stagger.item} className="glass-float relative overflow-hidden p-8 md:p-12">
        <div className="absolute inset-0 bg-gradient-to-bl from-amber-400/10 via-transparent to-primary/10 pointer-events-none" />
        <div className="absolute -top-10 -left-10 w-56 h-56 rounded-full bg-amber-400/15 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-4 text-center md:text-right">
            <div className="inline-flex items-center gap-2 bg-amber-400/15 border border-amber-300/30 text-amber-700 rounded-full px-4 py-1.5 text-sm font-semibold">
              <Coins className="w-3.5 h-3.5" />
              رصيدك الحالي
            </div>
            <div className="flex items-baseline gap-3 justify-center md:justify-start">
              <span className="font-display font-black text-7xl md:text-8xl text-foreground">
                {formatNumber(pointsData?.balance ?? 0)}
              </span>
              <span className="text-xl text-muted-foreground font-medium">نقطة</span>
            </div>
            <p className="text-muted-foreground text-sm max-w-sm leading-relaxed">
              استخدم نقاطك لشراء الكتب، فتح المسابقات، والحصول على مكافآت قيمة.
            </p>
          </div>
          <div className="flex flex-col gap-3 text-sm font-medium">
            {[
              { label: "مكتسبة", value: pointsData?.totalEarned ?? 0, color: "text-emerald-600", bg: "bg-emerald-50/80", icon: TrendingUp },
              { label: "مستخدمة", value: pointsData?.totalSpent ?? 0, color: "text-rose-500", bg: "bg-rose-50/80", icon: ArrowDownRight },
            ].map((s) => (
              <div key={s.label} className={`flex items-center gap-3 ${s.bg} border border-white/70 rounded-2xl px-4 py-3`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className={`font-bold text-lg ${s.color}`}>{formatNumber(s.value)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Packages */}
        <div className="lg:col-span-2 space-y-5">
          <motion.div variants={stagger.item} className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-400/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-amber-500" />
            </div>
            <h2 className="text-xl font-display font-bold text-foreground">شراء النقاط</h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {packages.map((pkg, i) => (
              <motion.div
                key={i}
                variants={stagger.item}
                whileHover={{ y: -4 }}
                className={`glass-card p-6 flex flex-col items-center text-center relative ${
                  pkg.popular ? "ring-2 ring-violet-400/40" : ""
                }`}
              >
                {pkg.popular && (
                  <div className="absolute -top-3 bg-gradient-to-r from-violet-500 to-indigo-600 text-white px-4 py-1 rounded-full text-xs font-bold shadow-md shadow-violet-500/30">
                    الأكثر طلباً
                  </div>
                )}
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${pkg.gradient} flex items-center justify-center text-white mb-4 shadow-lg ${pkg.glow}`}>
                  <Coins className="w-7 h-7" />
                </div>
                <p className="font-semibold text-muted-foreground text-sm mb-1">{pkg.name}</p>
                <p className="font-display font-black text-4xl text-foreground mb-5">{formatNumber(pkg.amount)}</p>
                <button
                  onClick={() => handlePurchase(pkg.amount, pkg.name)}
                  disabled={purchasePoints.isPending}
                  className={`w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-60 ${
                    pkg.popular
                      ? `bg-gradient-to-r ${pkg.gradient} text-white shadow-md ${pkg.glow}`
                      : "bg-white/60 backdrop-blur border border-white/70 text-foreground hover:bg-white/90"
                  }`}
                >
                  {pkg.price}
                </button>
              </motion.div>
            ))}
          </div>
        </div>

        {/* History */}
        <motion.div variants={stagger.item} className="glass-card p-5 flex flex-col">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <History className="w-4 h-4 text-primary" />
            </div>
            <h2 className="text-lg font-display font-bold text-foreground">السجل</h2>
          </div>
          <div className="flex-1 space-y-2 max-h-80 overflow-y-auto hide-scrollbar">
            {history.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-10">لا توجد عمليات سابقة</p>
            ) : (
              history.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-3 rounded-2xl hover:bg-white/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      tx.type === "spend"
                        ? "bg-rose-100 text-rose-500"
                        : "bg-emerald-100 text-emerald-600"
                    }`}>
                      {tx.type === "spend" ? <ArrowDownRight className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="font-semibold text-xs text-foreground line-clamp-1">{toEnglishDigits(tx.description)}</p>
                    </div>
                  </div>
                  <span className={`font-bold text-sm flex-shrink-0 ${tx.type === "spend" ? "text-rose-500" : "text-emerald-600"}`}>
                    {tx.type === "spend" ? "-" : "+"}{formatNumber(tx.amount)}
                  </span>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
