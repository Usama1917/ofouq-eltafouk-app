import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useListPosts, useCreatePost, useLikePost, useListComments, useCreateComment } from "@workspace/api-client-react";
import { MessageSquare, Heart, Send, MessageCircle, Users, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

function PostCard({ post, onCommentClick }: { post: any; onCommentClick: (id: number) => void }) {
  const likePost = useLikePost();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-6"
    >
      <div className="flex items-center gap-3.5 mb-4">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-md shadow-primary/20 flex-shrink-0">
          {post.authorName.charAt(0)}
        </div>
        <div>
          <h4 className="font-bold text-foreground text-sm">{post.authorName}</h4>
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: ar })}
          </p>
        </div>
      </div>
      <p className="text-foreground leading-relaxed mb-5 whitespace-pre-wrap text-sm">{post.content}</p>
      <div className="flex items-center gap-5 pt-4 border-t border-white/50">
        <button
          onClick={() => likePost.mutate({ id: post.id })}
          className={`flex items-center gap-2 text-sm font-semibold transition-all hover:scale-105 ${
            post.isLiked ? "text-red-500" : "text-muted-foreground hover:text-red-400"
          }`}
        >
          <Heart className={`w-4.5 h-4.5 ${post.isLiked ? "fill-current" : ""}`} />
          {post.likesCount}
        </button>
        <button
          onClick={() => onCommentClick(post.id)}
          className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary transition-colors"
        >
          <MessageCircle className="w-4.5 h-4.5" />
          {post.commentsCount} تعليق
        </button>
      </div>
    </motion.div>
  );
}

function CommentsModal({ postId, onClose }: { postId: number; onClose: () => void }) {
  const { data: comments = [] } = useListComments(postId);
  const createComment = useCreateComment();
  const [content, setContent] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    createComment.mutate(
      { id: postId, data: { content, authorName: "الطالب المتفوق" } },
      { onSuccess: () => setContent("") }
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
        className="glass-float w-full max-w-lg flex flex-col max-h-[80vh] overflow-hidden"
      >
        <div className="px-6 py-4 flex justify-between items-center border-b border-white/40">
          <h3 className="font-bold text-lg text-foreground">التعليقات</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {comments.length === 0 ? (
            <p className="text-center text-muted-foreground py-10 text-sm">لا توجد تعليقات بعد. كن أول من يعلق!</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="bg-white/50 backdrop-blur p-3.5 rounded-2xl border border-white/60">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                    {c.authorName.charAt(0)}
                  </div>
                  <span className="font-bold text-sm">{c.authorName}</span>
                </div>
                <p className="text-sm text-foreground pr-10 leading-relaxed">{c.content}</p>
              </div>
            ))
          )}
        </div>
        <div className="p-4 border-t border-white/40">
          <form onSubmit={handleSubmit} className="flex gap-2.5">
            <input
              type="text"
              className="flex-1 bg-white/60 backdrop-blur border border-white/70 rounded-full px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 text-sm font-medium transition-all"
              placeholder="اكتب تعليقاً..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <button
              disabled={createComment.isPending || !content.trim()}
              className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center disabled:opacity-50 shadow-md shadow-primary/25 hover:bg-primary/90 transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

export default function Social() {
  const { data: posts = [], isLoading } = useListPosts({});
  const createPost = useCreatePost();
  const [content, setContent] = useState("");
  const [activeCommentPost, setActiveCommentPost] = useState<number | null>(null);

  const handlePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    createPost.mutate(
      { data: { content, authorName: "الطالب المتميز" } },
      { onSuccess: () => setContent("") }
    );
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center text-white shadow-lg shadow-orange-500/25">
          <Users className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-black text-foreground">مجتمع التفوق</h1>
          <p className="text-sm text-muted-foreground font-medium">شارك أفكارك وإنجازاتك مع زملائك</p>
        </div>
      </div>

      {/* Composer */}
      <div className="glass-card p-5">
        <form onSubmit={handlePost} className="space-y-3">
          <textarea
            className="w-full bg-white/50 backdrop-blur border border-white/60 rounded-2xl p-4 outline-none focus:ring-2 focus:ring-primary/20 resize-none transition-all font-medium text-sm leading-relaxed"
            rows={3}
            placeholder="شارك أفكارك وإنجازاتك مع زملائك..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={createPost.isPending || !content.trim()}
              className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
              نشر
            </button>
          </div>
        </form>
      </div>

      {/* Feed */}
      <div className="space-y-4">
        {isLoading
          ? [1, 2, 3].map((i) => (
              <div key={i} className="glass-card h-36 animate-pulse bg-white/40" />
            ))
          : posts.map((post) => (
              <PostCard key={post.id} post={post} onCommentClick={setActiveCommentPost} />
            ))}
      </div>

      <AnimatePresence>
        {activeCommentPost && (
          <CommentsModal postId={activeCommentPost} onClose={() => setActiveCommentPost(null)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
