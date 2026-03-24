import { useState } from "react";
import { motion } from "framer-motion";
import { useListVideos } from "@workspace/api-client-react";
import { Play, Clock, User, Search, Video as VideoIcon } from "lucide-react";

const stagger = {
  container: { animate: { transition: { staggerChildren: 0.07 } } },
  item: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] } },
  },
};

export default function Videos() {
  const [search, setSearch] = useState("");
  const { data: videos = [], isLoading } = useListVideos({ search: search || undefined });

  return (
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

      {/* Grid */}
      {isLoading ? (
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
              className="glass-card overflow-hidden group cursor-pointer"
            >
              {/* Thumbnail */}
              <div className="relative h-48 overflow-hidden">
                {video.thumbnailUrl ? (
                  <img
                    src={video.thumbnailUrl}
                    alt={video.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-sky-50 to-blue-100 flex items-center justify-center">
                    <VideoIcon className="w-16 h-16 text-sky-300" />
                  </div>
                )}
                {/* Play overlay */}
                <div className="absolute inset-0 bg-black/10 group-hover:bg-black/35 transition-colors flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-white/30 backdrop-blur-md flex items-center justify-center text-white opacity-0 group-hover:opacity-100 scale-50 group-hover:scale-100 transition-all duration-300 shadow-xl">
                    <Play className="w-6 h-6 mr-[-2px]" />
                  </div>
                </div>
                {/* Duration badge */}
                <div className="absolute bottom-3 right-3 bg-black/55 backdrop-blur text-white px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {video.duration} د
                </div>
                {/* Subject badge */}
                <div className="absolute top-3 left-3 bg-primary/90 text-white px-3 py-1 rounded-full text-xs font-bold shadow-md">
                  {video.subject}
                </div>
              </div>
              {/* Info */}
              <div className="p-5">
                <h3 className="font-bold text-foreground mb-3 line-clamp-2 leading-snug">{video.title}</h3>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span className="font-semibold">{video.instructor}</span>
                </div>
              </div>
            </motion.div>
          ))}
          {videos.length === 0 && (
            <div className="col-span-full py-24 text-center flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-3xl bg-white/70 flex items-center justify-center">
                <VideoIcon className="w-10 h-10 text-muted-foreground/40" />
              </div>
              <p className="text-lg font-bold text-muted-foreground">لا توجد دروس مطابقة للبحث</p>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
