import { motion } from "framer-motion";
import { useListRewards, useRedeemReward, useListRedemptions, useGetPoints } from "@workspace/api-client-react";
import { Gift, Coins, CheckCircle, BookOpen, Ticket } from "lucide-react";

const stagger = {
  container: { animate: { transition: { staggerChildren: 0.07 } } },
  item: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as const } },
  },
};

export default function Rewards() {
  const { data: rewardsData, isLoading } = useListRewards();
  const rewards = Array.isArray(rewardsData) ? rewardsData : [];
  const { data: redemptionsData } = useListRedemptions();
  const redemptions = Array.isArray(redemptionsData) ? redemptionsData : [];
  const { data: pointsData } = useGetPoints();
  const redeemReward = useRedeemReward();

  const handleRedeem = (id: number, cost: number) => {
    if ((pointsData?.balance || 0) < cost) {
      alert("رصيد النقاط غير كافٍ للحصول على هذه المكافأة.");
      return;
    }
    if (confirm("تأكيد استبدال النقاط بهذه المكافأة؟")) {
      redeemReward.mutate({ id }, { onSuccess: () => alert("تم الاستبدال بنجاح! مبروك!") });
    }
  };

  return (
    <motion.div variants={stagger.container} initial="initial" animate="animate" className="space-y-10">
      {/* Hero */}
      <motion.div variants={stagger.item} className="glass-float relative overflow-hidden p-8 md:p-12">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/12 via-transparent to-teal-400/8 pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 w-48 h-48 rounded-full bg-emerald-400/15 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-6">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white shadow-xl shadow-emerald-500/30 flex-shrink-0">
            <Gift className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-display font-black text-foreground mb-2">متجر المكافآت</h1>
            <p className="text-muted-foreground leading-relaxed text-sm max-w-xl">
              حوّل نقاطك إلى هدايا حقيقية، كتب، وبطاقات هدايا قيمة. كل جهد تبذله في التعلم يستحق التكريم.
            </p>
          </div>
          {pointsData && (
            <div className="flex-shrink-0 mr-auto bg-white/60 backdrop-blur border border-white/70 rounded-2xl px-5 py-4 text-center">
              <p className="text-xs text-muted-foreground font-medium mb-1">رصيدك</p>
              <p className="font-display font-black text-2xl text-amber-500 flex items-center gap-1.5 justify-center">
                <Coins className="w-5 h-5" />
                {pointsData.balance}
              </p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Rewards Grid */}
      <motion.div variants={stagger.item} className="space-y-5">
        <h2 className="text-xl font-display font-bold text-foreground">المكافآت المتاحة</h2>
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="glass-card h-64 animate-pulse bg-white/40" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {rewards.map((reward) => (
              <motion.div
                key={reward.id}
                variants={stagger.item}
                whileHover={{ y: -4 }}
                className={`glass-card p-5 flex flex-col ${!reward.available ? "opacity-55" : ""}`}
              >
                {/* Image / Icon */}
                <div className="w-full aspect-video rounded-2xl mb-4 overflow-hidden bg-gradient-to-br from-muted/50 to-muted/30 flex items-center justify-center text-muted-foreground/30">
                  {reward.imageUrl ? (
                    <img src={reward.imageUrl} alt={reward.title} className="w-full h-full object-cover" />
                  ) : reward.type === "book" ? (
                    <BookOpen className="w-14 h-14" />
                  ) : (
                    <Ticket className="w-14 h-14" />
                  )}
                </div>
                <h3 className="font-bold text-base text-foreground mb-1">{reward.title}</h3>
                <p className="text-xs text-muted-foreground mb-4 line-clamp-2 leading-relaxed flex-1">
                  {reward.description}
                </p>
                <div className="flex items-center justify-between mt-auto">
                  <span className="flex items-center gap-1 font-bold text-sm text-amber-500">
                    <Coins className="w-4 h-4" />
                    {reward.pointsCost}
                  </span>
                  <button
                    onClick={() => handleRedeem(reward.id, reward.pointsCost)}
                    disabled={redeemReward.isPending || !reward.available}
                    className="bg-primary text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm shadow-primary/20 hover:bg-primary/90 transition-all disabled:opacity-50"
                  >
                    استبدال
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Redemption history */}
      {redemptions.length > 0 && (
        <motion.div variants={stagger.item} className="space-y-5">
          <h2 className="text-xl font-display font-bold text-foreground">سجل الاستبدال</h2>
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-white/40">
                    {["المكافأة", "النقاط", "التاريخ", "الحالة"].map((h) => (
                      <th key={h} className="px-5 py-4 font-bold text-muted-foreground text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/30">
                  {redemptions.map((r) => (
                    <tr key={r.id} className="hover:bg-white/30 transition-colors">
                      <td className="px-5 py-4 font-semibold text-foreground">{r.rewardTitle}</td>
                      <td className="px-5 py-4 text-rose-500 font-bold">-{r.pointsSpent}</td>
                      <td className="px-5 py-4 text-muted-foreground">
                        {new Date(r.createdAt).toLocaleDateString("ar-EG")}
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 text-emerald-600 bg-emerald-100/80 border border-emerald-200/60 px-3 py-1 rounded-full text-xs font-bold">
                          <CheckCircle className="w-3 h-3" />
                          تم
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
