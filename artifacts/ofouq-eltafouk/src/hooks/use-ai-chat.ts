import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useChatStream(conversationId: number) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const sendMessage = async (content: string) => {
    setIsStreaming(true);
    setStreamedText('');
    setError(null);

    let received = '';
    try {
      // Attach the bearer token (review F-01): the AI endpoint is now authenticated
      // server-side. The shared 401 interceptor (session.ts) still applies.
      const token = localStorage.getItem('ofouq_token');
      const res = await fetch(`/api/openai/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        // Surface server errors (503 AI disabled, 400 too long, etc.) instead of
        // silently doing nothing (review F-15).
        let message = 'تعذّر إرسال الرسالة. حاول مرة أخرى.';
        try {
          const data = await res.json();
          if (data?.error) message = data.error;
        } catch {
          /* non-JSON body */
        }
        setError(message);
        return;
      }

      if (!res.body) throw new Error('No readable stream returned');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      let streamError = false;
      let streamLoop = true;
      while (streamLoop) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const dataStr = line.slice(6);
          if (!dataStr.trim()) continue;

          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.error) {
              streamError = true;
              continue;
            }
            if (parsed.done) {
              streamLoop = false;
              break;
            }
            if (parsed.content) {
              received += parsed.content;
              setStreamedText((prev) => prev + parsed.content);
            }
          } catch (e) {
            console.error('Failed to parse SSE chunk:', e);
          }
        }
      }

      if (streamError && !received) {
        setError('حدث خطأ أثناء توليد الرد. حاول مرة أخرى.');
        return;
      }

      // Success: refresh the conversation so the saved messages render, then clear
      // the transient streamed buffer (no flicker because the saved message is shown).
      await queryClient.invalidateQueries({ queryKey: [`/api/openai/conversations/${conversationId}`] });
      setStreamedText('');
    } catch (err) {
      console.error('Chat stream failed:', err);
      // Keep any partial answer visible and tell the user (review F-15).
      if (!received) {
        setError('تعذّر الاتصال بالمساعد. تحقق من اتصالك وحاول مرة أخرى.');
      }
    } finally {
      setIsStreaming(false);
    }
  };

  return { sendMessage, isStreaming, streamedText, error };
}
