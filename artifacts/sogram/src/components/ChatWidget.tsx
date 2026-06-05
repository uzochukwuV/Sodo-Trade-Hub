import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "What's the market vibe right now?",
  "Who are the top traders?",
  "Any open signals I should know about?",
  "What's BTC doing today?",
];

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-muted-foreground"
          style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
    </div>
  );
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [displayedLast, setDisplayedLast] = useState("");
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typeTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      if (messages.length === 0) {
        setMessages([{
          role: "assistant",
          content: "Hey, I'm SOGRAM — your AI trading assistant. I have live access to market prices, trader data, signals, and community intents. What do you want to know?",
        }]);
      }
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, displayedLast, typing]);

  function typewriterEffect(text: string) {
    setTyping(true);
    setDisplayedLast("");
    let i = 0;
    function tick() {
      if (i <= text.length) {
        setDisplayedLast(text.slice(0, i));
        i++;
        typeTimerRef.current = setTimeout(tick, 12);
      } else {
        setTyping(false);
        setDisplayedLast("");
      }
    }
    tick();
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");

    const newMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });

      const data = await res.json();
      const response = data.response ?? "Sorry, I couldn't process that.";

      setMessages(prev => [...prev, { role: "assistant", content: response }]);
      typewriterEffect(response);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Connection error. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  const allMessages = messages;
  const lastAssistantIdx = allMessages.map(m => m.role).lastIndexOf("assistant");

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-accent text-background font-black text-lg flex items-center justify-center shadow-2xl hover:bg-accent/90 transition-all"
        style={{ boxShadow: "0 0 30px rgba(212,255,0,0.3)" }}
        title="Chat with SOGRAM AI"
      >
        {open ? "✕" : "◈"}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 w-[380px] flex flex-col bg-card border border-border shadow-2xl"
          style={{ height: 520, boxShadow: "0 0 40px rgba(0,0,0,0.8)" }}
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border shrink-0">
            <div
              className="w-8 h-8 flex items-center justify-center border border-accent/40 text-accent text-[10px] font-black tracking-wider"
              style={{ background: "rgba(212,255,0,0.08)" }}
            >
              AI
            </div>
            <div className="flex-1">
              <div className="text-white font-extrabold text-xs tracking-wide">SOGRAM AI</div>
              <div className="text-muted-foreground text-[9px] font-bold tracking-wider">
                {loading ? (
                  <span className="text-accent">THINKING...</span>
                ) : (
                  "LIVE MARKET + TRADER DATA"
                )}
              </div>
            </div>
            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3" style={{ scrollbarWidth: "thin" }}>
            {/* Suggestions (show only at start) */}
            {allMessages.length <= 1 && (
              <div className="flex flex-wrap gap-1.5 mb-1">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-[9px] font-bold tracking-wider text-muted-foreground border border-border/50 px-2 py-1 hover:border-accent/50 hover:text-accent transition-colors bg-background"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {allMessages.map((msg, i) => {
              const isLastAssistant = i === lastAssistantIdx;
              const isUser = msg.role === "user";

              if (isUser) {
                return (
                  <div key={i} className="flex justify-end">
                    <div className="bg-accent text-background text-[12px] font-bold px-3 py-2 max-w-[80%] leading-relaxed">
                      {msg.content}
                    </div>
                  </div>
                );
              }

              const content = isLastAssistant && typing ? displayedLast : msg.content;

              return (
                <div key={i} className="flex gap-2 items-start">
                  <div className="w-5 h-5 shrink-0 border border-accent/30 flex items-center justify-center text-accent text-[7px] font-black mt-0.5">
                    AI
                  </div>
                  <div className="text-[12px] text-white/90 leading-relaxed flex-1">
                    {content}
                    {isLastAssistant && typing && (
                      <span className="inline-block w-1 h-3.5 bg-accent ml-0.5 align-middle" style={{ animation: "pulse 0.8s infinite" }} />
                    )}
                  </div>
                </div>
              );
            })}

            {loading && !typing && (
              <div className="flex gap-2 items-start">
                <div className="w-5 h-5 shrink-0 border border-accent/30 flex items-center justify-center text-accent text-[7px] font-black mt-0.5">
                  AI
                </div>
                <TypingDots />
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border px-3 py-3 shrink-0 flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
              placeholder="Ask about markets, traders, signals..."
              disabled={loading}
              className="flex-1 bg-background border border-border text-white text-[12px] px-3 py-2 focus:outline-none focus:border-accent disabled:opacity-50 placeholder:text-muted-foreground/50"
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              className="bg-accent text-background px-3 py-2 font-black text-xs disabled:opacity-40 hover:bg-accent/90 transition-colors"
            >
              →
            </button>
          </div>
        </div>
      )}
    </>
  );
}
