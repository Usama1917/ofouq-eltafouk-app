import { motion } from "framer-motion";
import { useGetPoints, useGetPointsHistory, usePurchasePoints } from "@workspace/api-client-react";
import { Coins, ArrowUpRight, ArrowDownRight, ShieldCheck, Sparkles, History } from "lucide-react";

export default function Points() {
  const { data: pointsData } = useGetPoints();
  const { data: history = [] } = useGetPointsHistory();
  const purchasePoints = usePurchasePoints();

  const handlePurchase = (amount: number, packageName: string) => {
    purchasePoints.mutate({ data: { amount, packageName } }, {
      onSuccess: () => alert(`تم شراء ${amount} نقطة بنجاح!`)
    });
  };

  const packages = [
    { name: "الباقة الأساسية", amount: 100, price: "$5", color: "from-blue-400 to-blue-600" },
    { name: "الباقة المتقدمة", amount: 500, price: "$20", color: "from-purple-500 to-indigo-600", popular: true },
    { name: "الباقة الذهبية", amount: 1500, price: "$50", color: "from-orange-400 to-amber-600" }
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      {/* Banner */}
      <div className="relative rounded-3xl overflow-hidden shadow-xl bg-gradient-to-r from-accent to-orange-600 p-8 md:p-12 flex flex-col md:flex-row items-center justify-between">
        <div className="text-white space-y-4 z-10">
          <div className="inline-flex items-center gap-2 bg-white/20 px-4 py-2 rounded-full text-sm font-bold backdrop-blur-md">
            <ShieldCheck className="w-4 h-4" />
            رصيدك الحالي
          </div>
          <h1 className="text-5xl md:text-7xl font-display font-extrabold flex items-center gap-4">
            {pointsData?.balance || 0} <span className="text-2xl font-sans font-medium opacity-80">نقطة</span>
          </h1>
          <p className="text-white/90 text-lg">استخدم نقاطك لشراء الكتب، فتح المسابقات، والحصول على مكافآت قيمة.</p>
        </div>
        <img 
          src={`${import.meta.env.BASE_URL}images/points-banner.png`} 
          alt="Coins" 
          className="w-48 h-48 md:w-64 md:h-64 object-contain mt-8 md:mt-0 drop-shadow-2xl z-10" 
        />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Packages */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-accent" />
            شراء النقاط
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {packages.map((pkg, i) => (
              <div key={i} className={`relative bg-card rounded-2xl border-2 p-6 flex flex-col items-center text-center shadow-sm hover:shadow-xl transition-all ${pkg.popular ? 'border-accent' : 'border-border/50'}`}>
                {pkg.popular && (
                  <div className="absolute -top-3 bg-accent text-white px-4 py-1 rounded-full text-xs font-bold shadow-md">
                    الأكثر طلباً
                  </div>
                )}
                <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${pkg.color} flex items-center justify-center text-white mb-4 shadow-lg`}>
                  <Coins className="w-8 h-8" />
                </div>
                <h3 className="font-bold text-lg mb-1">{pkg.name}</h3>
                <div className="text-3xl font-display font-extrabold text-foreground mb-4">{pkg.amount}</div>
                <button 
                  onClick={() => handlePurchase(pkg.amount, pkg.name)}
                  disabled={purchasePoints.isPending}
                  className={`w-full py-3 rounded-xl font-bold transition-all ${
                    pkg.popular ? 'bg-accent text-white hover:bg-accent/90' : 'bg-primary/10 text-primary hover:bg-primary hover:text-white'
                  }`}
                >
                  شراء بـ {pkg.price}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* History */}
        <div className="bg-card rounded-2xl border border-border/50 p-6 shadow-sm">
          <h2 className="text-xl font-display font-bold text-foreground mb-6 flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            سجل العمليات
          </h2>
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {history.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">لا توجد عمليات سابقة</p>
            ) : (
              history.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      tx.type === 'spend' ? 'bg-red-100 text-red-500' : 'bg-emerald-100 text-emerald-500'
                    }`}>
                      {tx.type === 'spend' ? <ArrowDownRight className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-foreground">{tx.description}</p>
                      <p className="text-xs text-muted-foreground">اليوم</p>
                    </div>
                  </div>
                  <div className={`font-bold ${tx.type === 'spend' ? 'text-red-500' : 'text-emerald-500'}`}>
                    {tx.type === 'spend' ? '-' : '+'}{tx.amount}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
