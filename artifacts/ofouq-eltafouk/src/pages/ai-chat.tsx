import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { getGetOpenaiConversationQueryKey, useListOpenaiConversations, useCreateOpenaiConversation, useGetOpenaiConversation } from "@workspace/api-client-react";
import { useChatStream } from "@/hooks/use-ai-chat";
import { Bot, User, Send, Plus, MessageSquare, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";

export default function AiChat() {
  const { data: conversationsData, refetch: refetchConvos } = useListOpenaiConversations();
  const conversations = Array.isArray(conversationsData) ? conversationsData : [];
  const createConvo = useCreateOpenaiConversation();
  const [activeId, setActiveId] = useState<number | null>(null);

  useEffect(() => {
    if (conversations.length > 0 && !activeId) {
      setActiveId(conversations[0].id);
    }
  }, [conversations, activeId]);

  const handleNewChat = () => {
    createConvo.mutate(
      { data: { title: "محادثة جديدة" } },
      { onSuccess: (data) => { setActiveId(data.id); refetchConvos(); } }
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-[calc(100vh-8rem)] md:h-[calc(100vh-6rem)] flex gap-5"
    >
      {/* Sidebar */}
      <div className="w-64 glass-panel rounded-3xl hidden lg:flex flex-col overflow-hidden border border-white/60">
        <div className="p-4 border-b border-white/40">
          <button
            onClick={handleNewChat}
            disabled={createConvo.isPending}
            className="w-full btn-primary text-sm justify-center py-3"
          >
            <Plus className="w-4 h-4" />
            محادثة جديدة
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1 hide-scrollbar">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setActiveId(conv.id)}
              className={`w-full text-right px-3.5 py-3 rounded-2xl transition-all flex items-center gap-3 text-sm ${
                activeId === conv.id
                  ? "bg-primary/12 text-primary font-bold"
                  : "hover:bg-white/60 text-muted-foreground font-medium"
              }`}
            >
              <MessageSquare className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{conv.title}</span>
            </button>
          ))}
          {conversations.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-6">لا توجد محادثات</p>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 glass-panel rounded-3xl border border-white/60 flex flex-col overflow-hidden">
        {activeId ? (
          <ActiveChat conversationId={activeId} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center gap-5">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white shadow-xl shadow-primary/30">
              <Bot className="w-10 h-10" />
            </div>
            <div className="space-y-1">
              <h2 className="text-2xl font-display font-bold text-foreground">Ai التفوق</h2>
              <p className="max-w-sm text-sm leading-relaxed">
                أنا هنا لمساعدتك في فهم الدروس، حل المسائل، والإجابة على أي استفسارات تعليمية.
              </p>
            </div>
            <button
              onClick={handleNewChat}
              className="btn-primary text-sm"
            >
              <Sparkles className="w-4 h-4" />
              ابدأ محادثة جديدة
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ActiveChat({ conversationId }: { conversationId: number }) {
  const { data: conversation, refetch } = useGetOpenaiConversation(conversationId, {
    query: { queryKey: getGetOpenaiConversationQueryKey(conversationId), refetchInterval: false },
  });
  const { sendMessage, isStreaming, streamedText } = useChatStream(conversationId);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages, streamedText]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    const content = input;
    setInput("");
    await sendMessage(content);
    refetch();
  };

  return (
    <>
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/40 flex items-center gap-3 flex-shrink-0">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white shadow-md shadow-primary/25">
          <Bot className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold text-foreground text-sm">المساعد التعليمي</h3>
          <p className="text-xs text-emerald-500 font-semibold">متصل</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
        {conversation?.messages.map((msg, i) => (
          <div key={i} className={`flex gap-3.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm ${
              msg.role === "user"
                ? "bg-gradient-to-br from-amber-400 to-orange-500 text-white"
                : "bg-gradient-to-br from-primary to-blue-600 text-white"
            }`}>
              {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>
            <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === "user"
                ? "bg-primary text-white rounded-tr-sm shadow-md shadow-primary/20"
                : "bg-white/70 backdrop-blur border border-white/70 text-foreground rounded-tl-sm shadow-sm"
            }`}>
              {msg.role === "assistant" ? (
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {/* Streaming bubble */}
        {isStreaming && streamedText && (
          <div className="flex gap-3.5">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-primary to-blue-600 text-white shadow-sm">
              <Bot className="w-4 h-4" />
            </div>
            <div className="max-w-[78%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed bg-white/70 backdrop-blur border border-white/70 text-foreground shadow-sm">
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown>{streamedText}</ReactMarkdown>
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="px-5 pb-5 pt-3 border-t border-white/40 flex-shrink-0">
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <input
            type="text"
            className="flex-1 bg-white/60 backdrop-blur border border-white/70 focus:border-primary/40 focus:ring-4 focus:ring-primary/10 rounded-full px-5 py-3.5 outline-none transition-all font-medium text-sm pr-14"
            placeholder="اسألني أي سؤال تعليمي..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isStreaming}
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="absolute left-1.5 top-1.5 bottom-1.5 aspect-square rounded-full bg-primary text-white flex items-center justify-center shadow-md shadow-primary/25 disabled:opacity-50 hover:bg-primary/90 transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </>
  );
}
