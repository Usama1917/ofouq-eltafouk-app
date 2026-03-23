import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useChatStream(conversationId: number) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const queryClient = useQueryClient();

  const sendMessage = async (content: string) => {
    setIsStreaming(true);
    setStreamedText('');
    
    try {
      const res = await fetch(`/api/openai/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });

      if (!res.body) throw new Error('No readable stream returned');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (!dataStr.trim()) continue;
            
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.done) {
                break;
              }
              if (parsed.content) {
                setStreamedText((prev) => prev + parsed.content);
              }
            } catch (e) {
              console.error("Failed to parse SSE chunk:", e);
            }
          }
        }
      }
      
      // Once complete, refresh the conversation to show the saved messages
      await queryClient.invalidateQueries({ queryKey: [`/api/openai/conversations/${conversationId}`] });
    } catch (error) {
      console.error('Chat stream failed:', error);
    } finally {
      setIsStreaming(false);
      setStreamedText('');
    }
  };

  return { sendMessage, isStreaming, streamedText };
}
