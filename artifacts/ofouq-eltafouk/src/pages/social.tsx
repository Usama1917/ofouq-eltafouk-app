import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useListPosts, useCreatePost, useLikePost, useListComments, useCreateComment } from "@workspace/api-client-react";
import { MessageSquare, Heart, Send, MessageCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

function PostCard({ post, onCommentClick }: { post: any, onCommentClick: (id: number) => void }) {
  const likePost = useLikePost();
  
  const handleLike = () => {
    likePost.mutate({ id: post.id });
  };

  return (
    <div className="bg-card p-5 rounded-2xl border border-border/50 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 mb-4">
        {post.authorAvatar ? (
          <img src={post.authorAvatar} alt={post.authorName} className="w-12 h-12 rounded-full object-cover" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-lg shadow-sm">
            {post.authorName.charAt(0)}
          </div>
        )}
        <div>
          <h4 className="font-bold text-foreground">{post.authorName}</h4>
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: ar })}
          </p>
        </div>
      </div>
      <p className="text-foreground leading-relaxed mb-5 whitespace-pre-wrap">{post.content}</p>
      
      <div className="flex items-center gap-6 pt-4 border-t border-border/50">
        <button 
          onClick={handleLike}
          className={`flex items-center gap-2 transition-colors ${post.isLiked ? 'text-red-500' : 'text-muted-foreground hover:text-red-500'}`}
        >
          <Heart className={`w-5 h-5 ${post.isLiked ? 'fill-current' : ''}`} />
          <span className="font-semibold">{post.likesCount}</span>
        </button>
        <button 
          onClick={() => onCommentClick(post.id)}
          className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="font-semibold">{post.commentsCount} تعليق</span>
        </button>
      </div>
    </div>
  );
}

function CommentsModal({ postId, onClose }: { postId: number, onClose: () => void }) {
  const { data: comments = [] } = useListComments(postId);
  const createComment = useCreateComment();
  const [content, setContent] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    createComment.mutate({
      id: postId,
      data: { content, authorName: "الطالب المتفوق" } // Simulated logged in user
    }, {
      onSuccess: () => setContent("")
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
      >
        <div className="p-4 border-b flex justify-between items-center bg-muted/30">
          <h3 className="font-bold text-lg">التعليقات</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {comments.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا توجد تعليقات بعد. كن أول من يعلق!</p>
          ) : (
            comments.map(c => (
              <div key={c.id} className="bg-muted/30 p-3 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                    {c.authorName.charAt(0)}
                  </div>
                  <span className="font-bold text-sm">{c.authorName}</span>
                </div>
                <p className="text-sm text-foreground pr-10">{c.content}</p>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t bg-card">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input 
              type="text"
              className="flex-1 bg-muted rounded-full px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="اكتب تعليقاً..."
              value={content}
              onChange={e => setContent(e.target.value)}
            />
            <button 
              disabled={createComment.isPending || !content.trim()}
              className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center disabled:opacity-50"
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
    createPost.mutate({
      data: { content, authorName: "الطالب المتميز" } // Mock author
    }, {
      onSuccess: () => setContent("")
    });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl mx-auto space-y-6">
      
      {/* Composer */}
      <div className="bg-card p-5 rounded-2xl shadow-md border border-border/50">
        <form onSubmit={handlePost}>
          <textarea
            className="w-full bg-muted/50 rounded-xl p-4 outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            rows={3}
            placeholder="شارك أفكارك وإنجازاتك مع زملائك..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex justify-end mt-3">
            <button 
              type="submit"
              disabled={createPost.isPending || !content.trim()}
              className="bg-primary text-white px-6 py-2.5 rounded-full font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              نشر
            </button>
          </div>
        </form>
      </div>

      {/* Feed */}
      <div className="space-y-4">
        {isLoading ? (
          [1,2,3].map(i => <div key={i} className="h-40 bg-card rounded-2xl animate-pulse" />)
        ) : (
          posts.map((post) => (
            <PostCard key={post.id} post={post} onCommentClick={setActiveCommentPost} />
          ))
        )}
      </div>

      {/* Comments Modal */}
      <AnimatePresence>
        {activeCommentPost && (
          <CommentsModal postId={activeCommentPost} onClose={() => setActiveCommentPost(null)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
