import { motion } from "framer-motion";
import { Link } from "wouter";
import { BookOpen, Video, Award, Coins, TrendingUp, Gamepad2, MessageSquare, Gift } from "lucide-react";
import { useGetPoints } from "@workspace/api-client-react";

export default function Dashboard() {
  const { data: pointsData } = useGetPoints();

  const stats = [
    { title: "النقاط المكتسبة", value: pointsData?.totalEarned || 0, icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { title: "الرصيد الحالي", value: pointsData?.balance || 0, icon: Coins, color: "text-accent", bg: "bg-accent/10" },
    { title: "النقاط المستهلكة", value: pointsData?.totalSpent || 0, icon: Award, color: "text-primary", bg: "bg-primary/10" },
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {/* Hero Section */}
      <div className="relative rounded-3xl overflow-hidden shadow-2xl premium-shadow bg-primary">
        <img 
          src={`${import.meta.env.BASE_URL}images/hero-bg.png`} 
          alt="Hero" 
          className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-overlay"
        />
        <div className="relative z-10 p-8 md:p-12 lg:p-16 flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1 text-white text-right space-y-4">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-extrabold leading-tight">
              مرحباً بك في <span className="text-accent drop-shadow-md">أفق التفوق</span>
            </h1>
            <p className="text-lg md:text-xl text-primary-foreground/90 max-w-2xl font-medium">
              المنصة التعليمية الشاملة التي تجمع بين التعلم الرقمي، الكتب القيمة، والمجتمع التفاعلي. تعلم، شارك، واربح المكافآت!
            </p>
            <div className="pt-4 flex flex-wrap gap-4">
              <Link href="/books" className="px-8 py-3.5 rounded-full bg-accent text-white font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all">
                تصفح المكتبة
              </Link>
              <Link href="/ai-chat" className="px-8 py-3.5 rounded-full bg-white/20 backdrop-blur-md text-white border border-white/30 font-bold hover:bg-white/30 transition-all">
                اسأل المساعد الذكي
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-card rounded-2xl p-6 shadow-lg border border-border/50 flex items-center gap-5 hover:shadow-xl transition-all"
          >
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${stat.bg} ${stat.color}`}>
              <stat.icon className="w-7 h-7" />
            </div>
            <div>
              <p className="text-muted-foreground font-semibold">{stat.title}</p>
              <h3 className="text-3xl font-display font-bold text-foreground">{stat.value}</h3>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Quick Access */}
      <div className="space-y-6">
        <h2 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
          <Award className="w-6 h-6 text-primary" />
          الوصول السريع
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { title: "المسابقات", desc: "اختبر معلوماتك واربح", href: "/games", icon: Gamepad2, color: "from-purple-500 to-indigo-600" },
            { title: "الدروس", desc: "شاهد وتعلم", href: "/videos", icon: Video, color: "from-blue-400 to-cyan-500" },
            { title: "المجتمع", desc: "شارك أفكارك", href: "/social", icon: MessageSquare, color: "from-orange-400 to-red-500" },
            { title: "المكافآت", desc: "استبدل نقاطك", href: "/rewards", icon: Gift, color: "from-emerald-400 to-teal-500" },
          ].map((item, i) => (
            <Link key={i} href={item.href}>
              <div className="group relative overflow-hidden bg-card rounded-2xl p-6 border border-border/50 shadow-md hover:shadow-xl transition-all cursor-pointer">
                <div className={`absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r ${item.color}`} />
                <div className={`w-12 h-12 rounded-xl mb-4 flex items-center justify-center bg-gradient-to-br ${item.color} text-white shadow-lg group-hover:scale-110 transition-transform`}>
                  <item.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-1">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
