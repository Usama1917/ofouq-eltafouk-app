import { motion } from "framer-motion";
import { useListRewards, useRedeemReward, useListRedemptions, useGetPoints } from "@workspace/api-client-react";
import { Gift, Coins, CheckCircle, Ticket } from "lucide-react";

export default function Rewards() {
  const { data: rewards = [], isLoading } = useListRewards();
  const { data: redemptions = [] } = useListRedemptions();
  const { data: pointsData } = useGetPoints();
  const redeemReward = useRedeemReward();

  const handleRedeem = (id: number, cost: number) => {
    if ((pointsData?.balance || 0) < cost) {
      alert("رصيد النقاط غير كافٍ للحصول على هذه المكافأة.");
      return;
    }
    if (confirm("تأكيد استبدال النقاط بهذه المكافأة؟")) {
      redeemReward.mutate({ id }, {
        onSuccess: () => alert("تم الاستبدال بنجاح! مبروك!")
      });
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-12">
      <div className="bg-gradient-to-br from-emerald-500 to-teal-700 rounded-3xl p-8 md:p-12 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <h1 className="text-4xl md:text-5xl font-display font-extrabold mb-4 flex items-center gap-4">
            <Gift className="w-10 h-10" />
            متجر المكافآت
          </h1>
          <p className="text-lg text-emerald-50">حول نقاطك إلى هدايا حقيقية، كتب، وبطاقات هدايا قيمة. الجهد الذي تبذله في التعلم يستحق التكريم.</p>
        </div>
        <div className="absolute -right-20 -top-20 opacity-20">
          <Gift className="w-96 h-96" />
        </div>
      </div>

      <div className="space-y-6">
        <h2 className="text-2xl font-display font-bold text-foreground">المكافآت المتاحة</h2>
        
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1,2,3,4].map(i => <div key={i} className="bg-card h-64 rounded-2xl animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {rewards.map((reward) => (
              <div key={reward.id} className="bg-card rounded-2xl p-5 border border-border/50 shadow-md hover:shadow-xl transition-all flex flex-col">
                <div className="w-full aspect-video bg-muted rounded-xl mb-4 overflow-hidden flex items-center justify-center text-primary/30">
                  {reward.imageUrl ? (
                    <img src={reward.imageUrl} alt={reward.title} className="w-full h-full object-cover" />
                  ) : (
                    reward.type === 'book' ? <BookOpen className="w-16 h-16" /> : <Ticket className="w-16 h-16" />
                  )}
                </div>
                <h3 className="font-bold text-lg mb-1">{reward.title}</h3>
                <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{reward.description}</p>
                <div className="mt-auto flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-extrabold text-accent">
                    <Coins className="w-5 h-5" />
                    {reward.pointsCost}
                  </div>
                  <button 
                    onClick={() => handleRedeem(reward.id, reward.pointsCost)}
                    disabled={redeemReward.isPending || !reward.available}
                    className="bg-primary text-white px-6 py-2 rounded-xl font-bold shadow-md hover:bg-primary/90 transition-all disabled:opacity-50"
                  >
                    استبدال
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {redemptions.length > 0 && (
        <div className="space-y-6 pt-8 border-t border-border/50">
          <h2 className="text-2xl font-display font-bold text-foreground">سجل استبدال المكافآت</h2>
          <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead className="bg-muted/50 border-b border-border/50">
                  <tr>
                    <th className="p-4 font-bold text-muted-foreground">المكافأة</th>
                    <th className="p-4 font-bold text-muted-foreground">النقاط المستهلكة</th>
                    <th className="p-4 font-bold text-muted-foreground">التاريخ</th>
                    <th className="p-4 font-bold text-muted-foreground">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {redemptions.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                      <td className="p-4 font-bold">{r.rewardTitle}</td>
                      <td className="p-4 text-red-500 font-bold">-{r.pointsSpent}</td>
                      <td className="p-4 text-muted-foreground">
                        {new Date(r.createdAt).toLocaleDateString('ar-EG')}
                      </td>
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-100 px-3 py-1 rounded-full text-xs font-bold">
                          <CheckCircle className="w-3 h-3" /> تم الاستبدال
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// Needed simple stub for BookOpen in rewards fallback
import { BookOpen } from "lucide-react";
