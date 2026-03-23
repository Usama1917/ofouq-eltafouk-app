import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useListOpenaiConversations, useCreateOpenaiConversation, useGetOpenaiConversation } from "@workspace/api-client-react";
import { useChatStream } from "@/hooks/use-ai-chat";
import { Bot, User, Send, Plus, MessageSquare } from "lucide-react";
import ReactMarkdown from "react-markdown";

export default function AiChat() {
  const { data: conversations = [], refetch: refetchConvos } = useListOpenaiConversations();
  const createConvo = useCreateOpenaiConversation();
  
  const [activeId, setActiveId] = useState<number | null>(null);
  
  // Set first conversation as active initially
  useEffect(() => {
    if (conversations.length > 0 && !activeId) {
      setActiveId(conversations[0].id);
    }
  }, [conversations, activeId]);

  const handleNewChat = () => {
    createConvo.mutate({ data: { title: "محادثة جديدة" } }, {
      onSuccess: (data) => {
        setActiveId(data.id);
        refetchConvos();
      }
    });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-[calc(100vh-8rem)] md:h-[calc(100vh-6rem)] flex gap-6">
      
      {/* Sidebar - Chat History */}
      <div className="w-72 bg-card rounded-2xl shadow-lg border border-border/50 hidden lg:flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border/50">
          <button 
            onClick={handleNewChat}
            disabled={createConvo.isPending}
            className="w-full bg-primary text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-all shadow-md"
          >
            <Plus className="w-5 h-5" />
            محادثة جديدة
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => setActiveId(conv.id)}
              className={`w-full text-right p-3 rounded-xl transition-all flex items-center gap-3 ${
                activeId === conv.id ? "bg-primary/10 text-primary font-bold" : "hover:bg-muted text-muted-foreground"
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span className="truncate">{conv.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 bg-card rounded-2xl shadow-lg border border-border/50 flex flex-col overflow-hidden relative">
        {activeId ? (
          <ActiveChat conversationId={activeId} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-4 text-primary">
              <Bot className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-display font-bold text-foreground mb-2">المساعد الذكي</h2>
            <p className="max-w-md">أنا هنا لمساعدتك في فهم الدروس، حل المسائل، والإجابة على أي استفسارات تعليمية.</p>
            <button 
              onClick={handleNewChat}
              className="mt-6 bg-accent text-white px-8 py-3 rounded-full font-bold shadow-md hover:shadow-lg transition-all"
            >
              ابدأ محادثة جديدة
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ActiveChat({ conversationId }: { conversationId: number }) {
  const { data: conversation, refetch } = useGetOpenaiConversation(conversationId, { query: { refetchInterval: false }});
  const { sendMessage, isStreaming, streamedText } = useChatStream(conversationId);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages, streamedText]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    
    const content = input;
    setInput("");
    await sendMessage(content);
    refetch(); // Refresh to ensure backend DB messages are loaded
  };

  return (
    <>
      <div className="p-4 border-b border-border/50 bg-white/50 backdrop-blur-sm sticky top-0 z-10 flex items-center gap-3">
        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
          <Bot className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-bold text-foreground">المساعد التعليمي</h3>
          <p className="text-xs text-emerald-500 font-medium">متصل</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        {conversation?.messages.map((msg, i) => (
          <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
              msg.role === 'user' ? 'bg-accent/20 text-accent' : 'bg-primary/20 text-primary'
            }`}>
              {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
            </div>
            <div className={`max-w-[80%] rounded-2xl p-4 ${
              msg.role === 'user' 
                ? 'bg-accent text-white rounded-tr-sm' 
                : 'bg-muted/50 border border-border/50 text-foreground rounded-tl-sm'
            }`}>
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm rtl:prose-invert max-w-none">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        
        {/* Streaming message bubble */}
        {isStreaming && streamedText && (
          <div className="flex gap-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-primary/20 text-primary">
              <Bot className="w-5 h-5" />
            </div>
            <div className="max-w-[80%] rounded-2xl p-4 bg-muted/50 border border-border/50 text-foreground rounded-tl-sm">
              <div className="prose prose-sm rtl:prose-invert max-w-none">
                <ReactMarkdown>{streamedText}</ReactMarkdown>
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="p-4 bg-white border-t border-border/50">
        <form onSubmit={handleSubmit} className="flex gap-3 max-w-4xl mx-auto relative">
          <input
            type="text"
            className="flex-1 bg-muted border-2 border-transparent focus:border-primary/50 focus:bg-white rounded-full px-6 py-4 outline-none transition-all pr-14 shadow-inner"
            placeholder="اسألني أي سؤال..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isStreaming}
          />
          <button 
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="absolute left-2 top-2 bottom-2 aspect-square rounded-full bg-primary text-white flex items-center justify-center shadow-md disabled:opacity-50 hover:bg-primary/90 transition-all"
          >
            <Send className="w-5 h-5 mr-1" />
          </button>
        </form>
      </div>
    </>
  );
}
