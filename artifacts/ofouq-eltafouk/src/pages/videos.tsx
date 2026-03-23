import { useState } from "react";
import { motion } from "framer-motion";
import { useListVideos } from "@workspace/api-client-react";
import { Play, Clock, User, Search, Video as VideoIcon } from "lucide-react";

export default function Videos() {
  const [search, setSearch] = useState("");
  const { data: videos = [], isLoading } = useListVideos({ search: search || undefined });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground mb-2">الدروس المرئية</h1>
          <p className="text-muted-foreground">شاهد وتعلم من خلال مكتبة غنية بالدروس التعليمية.</p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input 
            type="text"
            placeholder="ابحث عن درس..."
            className="w-full pl-4 pr-12 py-3 rounded-xl bg-card border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3].map(i => (
            <div key={i} className="bg-card rounded-2xl h-72 animate-pulse border border-border/50"></div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {videos.map((video) => (
            <motion.div 
              key={video.id}
              whileHover={{ y: -5 }}
              className="bg-card rounded-2xl overflow-hidden border border-border/50 shadow-lg group cursor-pointer"
            >
              <div className="relative h-48 bg-muted overflow-hidden">
                {video.thumbnailUrl ? (
                  <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center transition-transform duration-500 group-hover:scale-105">
                    <VideoIcon className="w-16 h-16 text-primary/30" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transform scale-50 group-hover:scale-100 transition-all duration-300">
                    <Play className="w-6 h-6 ml-1" />
                  </div>
                </div>
                <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur text-white px-2 py-1 rounded text-xs font-bold flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {video.duration} دقيقة
                </div>
                <div className="absolute top-3 left-3 bg-primary text-white px-3 py-1 rounded-full text-xs font-bold shadow-md">
                  {video.subject}
                </div>
              </div>
              <div className="p-5">
                <h3 className="text-xl font-bold text-foreground mb-2 line-clamp-2">{video.title}</h3>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-4">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                    <User className="w-3 h-3 text-primary" />
                  </div>
                  <span className="font-semibold">{video.instructor}</span>
                </div>
              </div>
            </motion.div>
          ))}
          {videos.length === 0 && (
            <div className="col-span-full py-20 text-center text-muted-foreground">
              <p className="text-xl font-bold">لا توجد دروس مطابقة للبحث</p>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
