import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useListGames, useGetGame, useSubmitGameAnswers } from "@workspace/api-client-react";
import { Gamepad2, Trophy, Clock, Target, ArrowRight } from "lucide-react";

export default function Games() {
  const { data: games = [], isLoading } = useListGames();
  const [activeGameId, setActiveGameId] = useState<number | null>(null);

  if (activeGameId) {
    return <ActiveGame gameId={activeGameId} onBack={() => setActiveGameId(null)} />;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground mb-2 flex items-center gap-3">
          <div className="p-2 bg-purple-500/10 text-purple-600 rounded-xl">
            <Gamepad2 className="w-8 h-8" />
          </div>
          المسابقات التعليمية
        </h1>
        <p className="text-muted-foreground">اختبر معلوماتك، نافس أصدقائك، واكسب النقاط!</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3].map(i => <div key={i} className="bg-card h-48 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {games.map(game => (
            <motion.div 
              key={game.id}
              whileHover={{ y: -5 }}
              className="bg-card rounded-2xl p-6 border border-border/50 shadow-md hover:shadow-xl transition-all relative overflow-hidden group"
            >
              <div className={`absolute top-0 right-0 w-2 h-full ${
                game.difficulty === 'easy' ? 'bg-emerald-500' : 
                game.difficulty === 'medium' ? 'bg-orange-500' : 'bg-red-500'
              }`} />
              <div className="flex justify-between items-start mb-4">
                <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold">
                  {game.subject}
                </span>
                <span className="flex items-center gap-1 text-accent font-bold text-sm bg-accent/10 px-2 py-1 rounded-lg">
                  <Trophy className="w-4 h-4" />
                  {game.pointsReward} نقطة
                </span>
              </div>
              <h3 className="text-xl font-bold mb-2">{game.title}</h3>
              <p className="text-muted-foreground text-sm mb-6 line-clamp-2">{game.description}</p>
              
              <div className="flex items-center justify-between mt-auto">
                <div className="flex gap-4 text-sm text-muted-foreground font-medium">
                  <span className="flex items-center gap-1"><Target className="w-4 h-4"/> {game.questionsCount} أسئلة</span>
                </div>
                <button 
                  onClick={() => setActiveGameId(game.id)}
                  className="bg-primary text-white px-5 py-2 rounded-xl font-bold shadow-md hover:bg-primary/90 transition-all flex items-center gap-2 group-hover:gap-3"
                >
                  ابدأ اللعب
                  <ArrowRight className="w-4 h-4 rotate-180" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function ActiveGame({ gameId, onBack }: { gameId: number, onBack: () => void }) {
  const { data: game, isLoading } = useGetGame(gameId);
  const submitAnswers = useSubmitGameAnswers();
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<{questionId: number, selectedIndex: number}[]>([]);
  const [result, setResult] = useState<any>(null);

  if (isLoading) return <div className="text-center py-20 animate-pulse font-bold text-xl">جاري تحميل الأسئلة...</div>;
  if (!game || !game.questions) return <div>عفواً، حدث خطأ ما.</div>;

  const currentQuestion = game.questions[currentIndex];
  const isFinished = currentIndex >= game.questions.length;

  const handleSelect = (idx: number) => {
    const newAnswers = [...answers, { questionId: currentQuestion.id, selectedIndex: idx }];
    setAnswers(newAnswers);
    
    if (currentIndex + 1 < game.questions.length) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // Finished
      submitAnswers.mutate({ id: gameId, data: { answers: newAnswers } }, {
        onSuccess: (data) => setResult(data)
      });
      setCurrentIndex(currentIndex + 1); // trigger finish view
    }
  };

  if (result) {
    return (
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="max-w-md mx-auto mt-10 bg-card rounded-3xl p-8 text-center shadow-2xl border border-border/50">
        <div className="w-24 h-24 bg-gradient-to-br from-accent to-orange-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg text-white">
          <Trophy className="w-12 h-12" />
        </div>
        <h2 className="text-3xl font-display font-extrabold mb-2">انتهت المسابقة!</h2>
        <p className="text-lg text-muted-foreground mb-8">لقد أجبت بشكل صحيح على {result.correctCount} من أصل {result.totalQuestions}</p>
        
        <div className="bg-primary/5 rounded-2xl p-6 mb-8 border border-primary/10">
          <p className="text-sm font-bold text-primary mb-1">النقاط المكتسبة</p>
          <p className="text-5xl font-display font-black text-primary">+{result.pointsEarned}</p>
        </div>
        
        <button onClick={onBack} className="w-full bg-foreground text-background py-4 rounded-xl font-bold hover:bg-foreground/90 transition-all">
          العودة لقائمة المسابقات
        </button>
      </motion.div>
    );
  }

  if (submitAnswers.isPending) {
    return <div className="text-center py-20 font-bold text-xl text-primary animate-pulse">جاري حساب النتيجة...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto pt-8">
      <button onClick={onBack} className="text-muted-foreground hover:text-foreground mb-6 flex items-center gap-2 font-bold">
        <ArrowRight className="w-5 h-5" /> خروج من المسابقة
      </button>

      <div className="mb-8 flex justify-between items-center bg-card p-4 rounded-2xl shadow-sm border border-border/50">
        <div className="font-bold text-primary">السؤال {currentIndex + 1} من {game.questions.length}</div>
        <div className="w-1/2 bg-muted h-3 rounded-full overflow-hidden">
          <div 
            className="bg-primary h-full transition-all duration-500"
            style={{ width: `${((currentIndex) / game.questions.length) * 100}%` }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div 
          key={currentIndex}
          initial={{ x: -50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 50, opacity: 0 }}
          className="bg-card rounded-3xl p-6 md:p-10 shadow-xl border border-border/50"
        >
          <h2 className="text-2xl font-bold leading-relaxed mb-8 text-foreground text-center">
            {currentQuestion.text}
          </h2>

          <div className="space-y-4">
            {currentQuestion.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => handleSelect(i)}
                className="w-full p-4 rounded-xl text-right border-2 border-border/50 hover:border-primary hover:bg-primary/5 font-semibold text-lg transition-all"
              >
                {opt}
              </button>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
