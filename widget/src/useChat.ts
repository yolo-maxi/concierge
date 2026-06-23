import { useCallback, useEffect, useRef, useState } from "react";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

interface UseChatOpts {
  endpoint: string;
  pageId?: string;
  greeting?: string;
}

/**
 * A stable per-visitor session id, persisted for the tab. The server turns
 * this into a tracking emoji so one conversation is easy to follow in the logs.
 */
function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const KEY = "cc_sid";
    let sid = window.sessionStorage.getItem(KEY);
    if (!sid) {
      sid = "s_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      window.sessionStorage.setItem(KEY, sid);
    }
    return sid;
  } catch {
    return "s_anon";
  }
}

const TRANSCRIPT_KEY = "cc_transcript";

/** Restore a saved transcript for this tab so the chat survives page changes. */
function restore(greeting?: string): Message[] {
  if (typeof window !== "undefined") {
    try {
      const raw = window.sessionStorage.getItem(TRANSCRIPT_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Message[];
        // Drop a trailing empty assistant turn (an interrupted stream).
        const clean = saved.filter(
          (m) => m && typeof m.content === "string" && (m.content !== "" || m.role === "user")
        );
        if (clean.length) return clean;
      }
    } catch {
      /* ignore corrupt storage */
    }
  }
  return greeting ? [{ role: "assistant", content: greeting }] : [];
}

/**
 * Streaming chat against the Concierge server's /chat SSE endpoint.
 * Keeps the whole transcript client-side; the server stays stateless. The
 * transcript is mirrored to sessionStorage so it persists across navigations
 * within the same tab/site.
 */
export function useChat({ endpoint, pageId, greeting }: UseChatOpts) {
  const sessionId = useRef(getSessionId());
  const [messages, setMessages] = useState<Message[]>(() => restore(greeting));
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Persist the transcript whenever it changes (skip mid-stream empty turns).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(TRANSCRIPT_KEY, JSON.stringify(messages));
    } catch {
      /* storage full / disabled — non-fatal */
    }
  }, [messages]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      const history: Message[] = [...messages, { role: "user", content: trimmed }];
      // assistant placeholder we stream into
      setMessages([...history, { role: "assistant", content: "" }]);
      setBusy(true);

      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ac.signal,
          body: JSON.stringify({
            pageId,
            sessionId: sessionId.current,
            pageUrl: typeof window !== "undefined" ? window.location.href : undefined,
            // only send real turns, not the greeting placeholder logic above
            messages: history,
          }),
        });

        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const pump = async (): Promise<void> => {
          const { done, value } = await reader.read();
          if (done) return;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith("data:")) continue;
            const data = t.slice(5).trim();
            if (data === "[DONE]") return;
            try {
              const json = JSON.parse(data);
              if (json.delta) {
                setMessages((prev) => {
                  const next = [...prev];
                  next[next.length - 1] = {
                    role: "assistant",
                    content: next[next.length - 1].content + json.delta,
                  };
                  return next;
                });
              } else if (json.error) {
                setMessages((prev) => {
                  const next = [...prev];
                  next[next.length - 1] = { role: "assistant", content: json.error };
                  return next;
                });
              }
            } catch {
              /* ignore partial frames */
            }
          }
          return pump();
        };
        await pump();
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant" && last.content === "") {
              next[next.length - 1] = {
                role: "assistant",
                content: "Sorry — I couldn't reach the server. Try again in a moment.",
              };
            }
            return next;
          });
        }
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [messages, busy, endpoint, pageId]
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { messages, send, busy, stop };
}
