import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useListGames, useGetGame, useSubmitGameAnswers } from "@workspace/api-client-react";
import { Gamepad2, Trophy, Target, ArrowRight, Star, Zap } from "lucide-react";

const difficultyConfig: Record<string, { label: string; color: string; dot: string }> = {
  easy: { label: "سهل", color: "text-emerald-600", dot: "bg-emerald-400" },
  medium: { label: "متوسط", color: "text-amber-600", dot: "bg-amber-400" },
  hard: { label: "صعب", color: "text-rose-600", dot: "bg-rose-400" },
};

const stagger = {
  container: { animate: { transition: { staggerChildren: 0.07 } } },
  item: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] } },
  },
};

export default function Games() {
  const { data: games = [], isLoading } = useListGames();
  const [activeGameId, setActiveGameId] = useState<number | null>(null);

  if (activeGameId) {
    return <ActiveGame gameId={activeGameId} onBack={() => setActiveGameId(null)} />;
  }

  return (
    <motion.div variants={stagger.container} initial="initial" animate="animate" className="space-y-8">
      <motion.div variants={stagger.item}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/25">
            <Gamepad2 className="w-5 h-5" />
          </div>
          <h1 className="text-3xl font-display font-black text-foreground">المسابقات التعليمية</h1>
        </div>
        <p className="text-muted-foreground font-medium">اختبر معلوماتك، نافس أصدقائك، واكسب النقاط!</p>
      </motion.div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-card h-52 animate-pulse bg-white/40" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {games.map((game) => {
            const diff = difficultyConfig[game.difficulty] ?? difficultyConfig.easy;
            return (
              <motion.div
                key={game.id}
                variants={stagger.item}
                whileHover={{ y: -5 }}
                className="glass-card p-6 flex flex-col"
              >
                <div className="flex items-start justify-between mb-4">
                  <span className="inline-flex items-center gap-1.5 bg-white/60 text-foreground border border-white/70 px-3 py-1 rounded-full text-xs font-bold">
                    {game.subject}
                  </span>
                  <span className="inline-flex items-center gap-1.5 bg-amber-400/15 text-amber-600 px-2.5 py-1 rounded-lg text-xs font-bold">
                    <Trophy className="w-3.5 h-3.5" />
                    {game.pointsReward} نقطة
                  </span>
                </div>

                <h3 className="text-lg font-bold text-foreground mb-2">{game.title}</h3>
                <p className="text-muted-foreground text-sm mb-5 line-clamp-2 leading-relaxed flex-1">
                  {game.description}
                </p>

                <div className="flex items-center justify-between mt-auto">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground font-medium">
                    <span className="flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5" />
                      {game.questionsCount} أسئلة
                    </span>
                    <span className={`flex items-center gap-1.5 ${diff.color}`}>
                      <span className={`w-2 h-2 rounded-full ${diff.dot}`} />
                      {diff.label}
                    </span>
                  </div>
                  <button
                    onClick={() => setActiveGameId(game.id)}
                    className="flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md shadow-primary/25 hover:bg-primary/90 transition-all group"
                  >
                    ابدأ
                    <ArrowRight className="w-3.5 h-3.5 rotate-180 group-hover:-translate-x-0.5 transition-transform" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

function ActiveGame({ gameId, onBack }: { gameId: number; onBack: () => void }) {
  const { data: game, isLoading } = useGetGame(gameId);
  const submitAnswers = useSubmitGameAnswers();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<{ questionId: number; selectedIndex: number }[]>([]);
  const [result, setResult] = useState<any>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto animate-pulse">
            <Zap className="w-7 h-7 text-primary" />
          </div>
          <p className="font-bold text-muted-foreground">جاري تحميل الأسئلة...</p>
        </div>
      </div>
    );
  }

  if (!game?.questions) return <div>عفواً، حدث خطأ ما.</div>;

  const currentQuestion = game.questions[currentIndex];

  const handleSelect = (idx: number) => {
    const newAnswers = [...answers, { questionId: currentQuestion.id, selectedIndex: idx }];
    setAnswers(newAnswers);
    if (currentIndex + 1 < game.questions.length) {
      setCurrentIndex(currentIndex + 1);
    } else {
      submitAnswers.mutate(
        { id: gameId, data: { answers: newAnswers } },
        { onSuccess: (data) => setResult(data) }
      );
      setCurrentIndex(currentIndex + 1);
    }
  };

  if (submitAnswers.isPending) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-amber-400/20 flex items-center justify-center mx-auto animate-bounce">
            <Star className="w-7 h-7 text-amber-500" />
          </div>
          <p className="font-bold text-muted-foreground">جاري حساب النتيجة...</p>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-md mx-auto mt-10"
      >
        <div className="glass-float p-8 text-center space-y-6">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto text-white shadow-xl shadow-amber-500/30">
            <Trophy className="w-12 h-12" />
          </div>
          <div>
            <h2 className="text-3xl font-display font-black mb-2">انتهت المسابقة!</h2>
            <p className="text-muted-foreground text-sm">
              أجبت بشكل صحيح على <strong className="text-foreground">{result.correctCount}</strong> من أصل{" "}
              <strong className="text-foreground">{result.totalQuestions}</strong> سؤال
            </p>
          </div>
          <div className="bg-white/60 backdrop-blur border border-white/70 rounded-2xl p-6">
            <p className="text-xs font-semibold text-muted-foreground mb-1">النقاط المكتسبة</p>
            <p className="font-display font-black text-5xl text-primary">+{result.pointsEarned}</p>
          </div>
          <button
            onClick={onBack}
            className="w-full py-4 rounded-2xl font-bold bg-foreground text-background hover:bg-foreground/90 transition-all"
          >
            العودة لقائمة المسابقات
          </button>
        </div>
      </motion.div>
    );
  }

  const progress = ((currentIndex) / game.questions.length) * 100;

  return (
    <div className="max-w-2xl mx-auto pt-4 space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-semibold text-sm transition-colors"
      >
        <ArrowRight className="w-4 h-4" />
        خروج من المسابقة
      </button>

      {/* Progress */}
      <div className="glass-card p-4 flex items-center gap-4">
        <span className="font-bold text-primary text-sm whitespace-nowrap">
          {currentIndex + 1} / {game.questions.length}
        </span>
        <div className="flex-1 bg-white/50 border border-white/60 h-2.5 rounded-full overflow-hidden">
          <motion.div
            className="bg-primary h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ x: -30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 30, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
          className="glass-float p-7 md:p-10"
        >
          <h2 className="text-xl md:text-2xl font-bold leading-relaxed mb-8 text-foreground text-center">
            {currentQuestion.text}
          </h2>
          <div className="space-y-3">
            {currentQuestion.options.map((opt, i) => (
              <motion.button
                key={i}
                onClick={() => handleSelect(i)}
                whileHover={{ x: -4 }}
                whileTap={{ scale: 0.98 }}
                className="w-full p-4 rounded-2xl text-right text-sm font-semibold border-2 border-white/60 bg-white/50 backdrop-blur hover:border-primary/40 hover:bg-primary/5 transition-all"
              >
                {opt}
              </motion.button>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
