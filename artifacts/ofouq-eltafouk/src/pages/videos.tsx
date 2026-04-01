import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useListVideos } from "@workspace/api-client-react";
import { Link } from "wouter";
import {
  Play, Clock, User, Search, Video as VideoIcon,
  GraduationCap, ChevronLeft, BookOpen, Users2, Star, X, Maximize2,
} from "lucide-react";

interface AcademicYear { id: number; name: string; description: string; }
interface Subject { id: number; name: string; icon: string; description: string; hasProviders: boolean; }

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

const stagger = {
  container: { animate: { transition: { staggerChildren: 0.07 } } },
  item: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as const } },
  },
};

interface PlayingVideo {
  id: number;
  title: string;
  instructor: string;
  subject: string;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  duration?: number | null;
}

function getYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^&?/\s]{11})/);
  return m ? m[1] : null;
}

function VideoModal({ video, autoPlay, onClose }: { video: PlayingVideo; autoPlay: boolean; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const ytId = video.videoUrl ? getYouTubeId(video.videoUrl) : null;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const ytSrc = ytId
    ? `https://www.youtube.com/embed/${ytId}?autoplay=${autoPlay ? 1 : 0}&rel=0`
    : null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="relative w-full max-w-3xl bg-black rounded-2xl overflow-hidden shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 left-3 z-10 w-9 h-9 rounded-full bg-black/60 backdrop-blur flex items-center justify-center text-white hover:bg-black/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Video area */}
          <div className="relative aspect-video w-full bg-black">
            {ytSrc ? (
              <iframe
                className="w-full h-full"
                src={ytSrc}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={video.title}
              />
            ) : video.videoUrl ? (
              <video
                ref={videoRef}
                src={video.videoUrl}
                autoPlay={autoPlay}
                controls
                className="w-full h-full"
                poster={video.thumbnailUrl ?? undefined}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-white/60">
                <VideoIcon className="w-16 h-16 opacity-30" />
                <p className="text-sm font-medium">رابط الفيديو غير متوفر بعد</p>
              </div>
            )}
          </div>

          {/* Info bar */}
          <div className="p-4 bg-[#111] flex items-start justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-white/60 shrink-0">
              <User className="w-3.5 h-3.5" />
              <span>{video.instructor}</span>
            </div>
            <div className="text-right flex-1 min-w-0">
              <p className="font-bold text-white text-sm line-clamp-1">{video.title}</p>
              <p className="text-xs text-white/50 mt-0.5">{video.subject}</p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default function Videos() {
  const [search, setSearch] = useState("");
  const { data: videosData, isLoading: videosLoading } = useListVideos({ search: search || undefined });
  const videos = Array.isArray(videosData) ? videosData : [];
  const [playingVideo, setPlayingVideo] = useState<{ video: PlayingVideo; autoPlay: boolean } | null>(null);

  const { data: years = [], isLoading: yearsLoading } = useQuery<AcademicYear[]>({
    queryKey: ["academic", "years"],
    queryFn: () => apiFetch("/academic/years"),
  });

  const [selectedYearId, setSelectedYearId] = useState<number | null>(null);

  const { data: subjects = [] } = useQuery<Subject[]>({
    queryKey: ["academic", "subjects", selectedYearId],
    queryFn: () => apiFetch(`/academic/years/${selectedYearId}/subjects`),
    enabled: !!selectedYearId,
  });

  return (
    <>
    {playingVideo && <VideoModal video={playingVideo.video} autoPlay={playingVideo.autoPlay} onClose={() => setPlayingVideo(null)} />}
    <motion.div variants={stagger.container} initial="initial" animate="animate" className="space-y-8">
      {/* Header */}
      <motion.div variants={stagger.item} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-5">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/25">
              <VideoIcon className="w-5 h-5" />
            </div>
            <h1 className="text-3xl font-display font-black text-foreground">الدروس المرئية</h1>
          </div>
          <p className="text-muted-foreground font-medium">شاهد وتعلم من خلال مكتبة غنية بالدروس التعليمية.</p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="ابحث عن درس..."
            className="w-full pl-4 pr-11 py-3 rounded-2xl bg-white/70 backdrop-blur border border-white/60 focus:border-primary/40 focus:ring-4 focus:ring-primary/10 transition-all outline-none shadow-sm font-medium"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </motion.div>

      {/* ── Academic Content Section ──────────────────────────────── */}
      <motion.div variants={stagger.item}>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/10 to-blue-50 flex items-center justify-center">
            <GraduationCap className="w-4.5 h-4.5 text-primary" />
          </div>
          <h2 className="font-display font-bold text-lg text-foreground">المحتوى الأكاديمي</h2>
        </div>

        {/* Academic Years - horizontal scroll */}
        {yearsLoading ? (
          <div className="flex gap-3 overflow-x-auto pb-3 hide-scrollbar">
            {[1, 2, 3].map(i => <div key={i} className="h-20 w-44 rounded-2xl animate-pulse bg-white/40 flex-shrink-0" />)}
          </div>
        ) : years.length === 0 ? (
          <div className="glass-card p-6 text-center text-muted-foreground text-sm">
            <GraduationCap className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>لا توجد سنوات دراسية متاحة بعد</p>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-3 hide-scrollbar">
            {years.map(year => (
              <motion.button
                key={year.id}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setSelectedYearId(selectedYearId === year.id ? null : year.id)}
                className={`
                  flex-shrink-0 flex items-center gap-3 px-5 py-4 rounded-2xl border transition-all cursor-pointer
                  ${selectedYearId === year.id
                    ? "bg-primary text-white border-primary shadow-lg shadow-primary/25"
                    : "glass-card hover:border-primary/30"
                  }
                `}
              >
                <GraduationCap className={`w-6 h-6 ${selectedYearId === year.id ? "text-white/80" : "text-primary"}`} />
                <div className="text-right">
                  <p className={`font-bold text-sm ${selectedYearId === year.id ? "text-white" : "text-foreground"}`}>{year.name}</p>
                  {year.description && (
                    <p className={`text-xs mt-0.5 ${selectedYearId === year.id ? "text-white/70" : "text-muted-foreground"}`}>{year.description}</p>
                  )}
                </div>
              </motion.button>
            ))}
          </div>
        )}

        {/* Subjects grid - shows when a year is selected */}
        {selectedYearId && subjects.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4"
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {subjects.map(subject => {
                const href = subject.hasProviders
                  ? `/videos/years/${selectedYearId}/subjects/${subject.id}/providers`
                  : `/videos/years/${selectedYearId}/subjects/${subject.id}/units`;
                return (
                  <Link key={subject.id} href={href}>
                    <motion.div
                      whileHover={{ y: -3 }}
                      className="glass-card p-4 cursor-pointer hover:border-primary/30 transition-all group text-center"
                    >
                      <div className="text-3xl mb-2">{subject.icon}</div>
                      <p className="font-bold text-foreground text-sm">{subject.name}</p>
                    </motion.div>
                  </Link>
                );
              })}
            </div>
            <Link href={`/videos/years/${selectedYearId}`}>
              <div className="mt-3 text-center">
                <span className="text-sm text-primary font-semibold hover:underline cursor-pointer inline-flex items-center gap-1">
                  عرض كل المواد <ChevronLeft className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>
          </motion.div>
        )}
      </motion.div>

      {/* ── Followed Teachers/Subjects Section ───────────────────── */}
      <motion.div variants={stagger.item}>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-100 to-purple-50 flex items-center justify-center">
            <Star className="w-4.5 h-4.5 text-violet-500" />
          </div>
          <h2 className="font-display font-bold text-lg text-foreground">المواد والمعلمون المتابَعون</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Placeholder items - will be populated from real following data */}
          <div className="glass-card p-5 flex items-center gap-3 hover:border-primary/30 transition-all cursor-pointer group">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-50 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-blue-500" />
            </div>
            <div className="flex-1 text-right">
              <p className="font-bold text-foreground text-sm">الرياضيات</p>
              <p className="text-xs text-muted-foreground">3 دروس جديدة</p>
            </div>
            <ChevronLeft className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <div className="glass-card p-5 flex items-center gap-3 hover:border-primary/30 transition-all cursor-pointer group">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-50 flex items-center justify-center">
              <Users2 className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="flex-1 text-right">
              <p className="font-bold text-foreground text-sm">أ. محمد العتيبي</p>
              <p className="text-xs text-muted-foreground">معلم فيزياء · 12 درس</p>
            </div>
            <ChevronLeft className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <div className="glass-card p-5 flex items-center gap-3 hover:border-primary/30 transition-all cursor-pointer group">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-50 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-amber-500" />
            </div>
            <div className="flex-1 text-right">
              <p className="font-bold text-foreground text-sm">الكيمياء</p>
              <p className="text-xs text-muted-foreground">5 دروس جديدة</p>
            </div>
            <ChevronLeft className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </div>
      </motion.div>

      {/* ── Recent Videos Section ─────────────────────────────────── */}
      <motion.div variants={stagger.item}>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-100 to-blue-50 flex items-center justify-center">
            <Play className="w-4 h-4 text-sky-500" />
          </div>
          <h2 className="font-display font-bold text-lg text-foreground">أحدث الفيديوهات</h2>
        </div>

        {videosLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass-card h-72 animate-pulse bg-white/40" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {videos.map((video) => (
              <motion.div
                key={video.id}
                variants={stagger.item}
                whileHover={{ y: -5 }}
                className="glass-card overflow-hidden group"
              >
                <div className="relative h-48 overflow-hidden cursor-pointer"
                  onClick={() => setPlayingVideo({ video: video as PlayingVideo, autoPlay: true })}
                >
                  {video.thumbnailUrl ? (
                    <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-sky-50 to-blue-100 flex items-center justify-center">
                      <VideoIcon className="w-16 h-16 text-sky-300" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/10 group-hover:bg-black/35 transition-colors flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-white/30 backdrop-blur-md flex items-center justify-center text-white opacity-0 group-hover:opacity-100 scale-50 group-hover:scale-100 transition-all duration-300 shadow-xl">
                      <Play className="w-6 h-6 mr-[-2px]" />
                    </div>
                  </div>
                  <div className="absolute bottom-3 right-3 bg-black/55 backdrop-blur text-white px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {video.duration} د
                  </div>
                  <div className="absolute top-3 left-3 bg-primary/90 text-white px-3 py-1 rounded-full text-xs font-bold shadow-md">
                    {video.subject}
                  </div>
                </div>
                <div className="p-5">
                  <h3 className="font-bold text-foreground mb-3 line-clamp-2 leading-snug">{video.title}</h3>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => setPlayingVideo({ video: video as PlayingVideo, autoPlay: false })}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
                      title="فتح بدون تشغيل تلقائي"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <span className="font-semibold">{video.instructor}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
            {videos.length === 0 && !search && (
              <div className="col-span-full py-16 text-center flex flex-col items-center gap-4">
                <div className="w-20 h-20 rounded-3xl bg-white/70 flex items-center justify-center">
                  <VideoIcon className="w-10 h-10 text-muted-foreground/40" />
                </div>
                <p className="text-lg font-bold text-muted-foreground">لا توجد دروس مرئية بعد</p>
              </div>
            )}
            {videos.length === 0 && search && (
              <div className="col-span-full py-16 text-center flex flex-col items-center gap-4">
                <div className="w-20 h-20 rounded-3xl bg-white/70 flex items-center justify-center">
                  <Search className="w-10 h-10 text-muted-foreground/40" />
                </div>
                <p className="text-lg font-bold text-muted-foreground">لا توجد نتائج لـ "{search}"</p>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
    </>
  );
}
