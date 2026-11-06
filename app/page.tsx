"use client";
import { useState, useRef, useEffect } from "react";

type Msg = { role: string; text: string; image?: string };
type Chat = { id: string; title: string; messages: Msg[]; createdAt: number };

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string>("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [usedVoice, setUsedVoice] = useState(false);
  const [showHistory, setShowHistory] = useState(true); // Desktop ma right ma dekhaune
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Msg[]>([]);
  const currentChatIdRef = useRef<string>("");

  useEffect(() => {
    const saved = localStorage.getItem("sajilo-sathi-chats");
    if (saved) {
      const parsed = JSON.parse(saved) as Chat[];
      setChats(parsed);
      if (parsed.length > 0) {
        setCurrentChatId(parsed[0].id);
        currentChatIdRef.current = parsed[0].id;
        messagesRef.current = parsed[0].messages;
      } else createNewChat();
    } else createNewChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (chats.length > 0) localStorage.setItem("sajilo-sathi-chats", JSON.stringify(chats));
  }, [chats]);

  const currentChat = chats.find((c) => c.id === currentChatId) || chats[0];
  const messages = currentChat?.messages || [];

  useEffect(() => {
    messagesRef.current = messages;
    currentChatIdRef.current = currentChatId;
  }, [messages, currentChatId]);

  function createNewChat() {
    const newChat: Chat = { id: Date.now().toString(), title: "Naya Chat", messages: [{ role: "assistant", text: "Namaste. Ma Sajilo Sathi hu. Ke sodhna chahanchau?" }], createdAt: Date.now() };
    setChats((prev) => [newChat, ...prev]);
    setCurrentChatId(newChat.id);
    currentChatIdRef.current = newChat.id;
    messagesRef.current = newChat.messages;
    setAutoScroll(true);
  }

  function deleteChat(id: string) {
    const filtered = chats.filter((c) => c.id !== id);
    setChats(filtered);
    if (filtered.length === 0) { localStorage.removeItem("sajilo-sathi-chats"); createNewChat(); }
    else if (id === currentChatId) { setCurrentChatId(filtered[0].id); currentChatIdRef.current = filtered[0].id; messagesRef.current = filtered[0].messages; }
    localStorage.setItem("sajilo-sathi-chats", JSON.stringify(filtered));
  }

  function switchChat(chat: Chat) {
    setCurrentChatId(chat.id);
    currentChatIdRef.current = chat.id;
    messagesRef.current = chat.messages;
    setAutoScroll(true);
  }

  function updateCurrentChat(newMessages: Msg[]) {
    messagesRef.current = newMessages;
    const id = currentChatIdRef.current;
    setChats((prev) => prev.map((c) => {
      if (c.id !== id) return c;
      let title = c.title;
      if (title === "Naya Chat") {
        const firstUser = newMessages.find((m) => m.role === "user");
        if (firstUser) title = firstUser.text.slice(0, 30) + (firstUser.text.length > 30 ? "..." : "");
      }
      return { ...c, messages: newMessages, title };
    }));
  }

  useEffect(() => { if (autoScroll && bottomRef.current) bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, loading, autoScroll]);

  function handleScroll() {
    const el = scrollRef.current; if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (!isAtBottom) { setAutoScroll(false); setShowScrollBtn(true); } else { setAutoScroll(true); setShowScrollBtn(false); }
  }
  function scrollToBottom() { setAutoScroll(true); setShowScrollBtn(false); bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }

  async function send(text?: string, imageBase64?: string) {
    const msgText = text || input;
    if (!msgText.trim() && !imageBase64) return;
    const wasVoice = usedVoice; setUsedVoice(false); setAutoScroll(true); setShowScrollBtn(false);
    const latestMessages = messagesRef.current;
    const userMsg: Msg = { role: "user", text: msgText || "Yo photo ma ke cha?", image: imageBase64 };
    const newMessages = [...latestMessages, userMsg];
    updateCurrentChat(newMessages);
    setInput(""); setLoading(true);
    const res = await fetch("/api/chat", { method: "POST", body: JSON.stringify({ messages: newMessages.slice(-15).map((m) => ({ role: m.role, content: m.text })), image: imageBase64 }) });
    const data = await res.json();
    updateCurrentChat([...newMessages, { role: "assistant", text: data.reply }]);
    setLoading(false);
    if (wasVoice) speak(data.reply);
  }

  function startVoice() {
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) { alert("Chrome use gar"); return; }
    const rec = new SR(); rec.lang = "hi-IN"; rec.interimResults = true;
    rec.onstart = () => { setListening(true); setUsedVoice(true); };
    rec.onend = () => setListening(false);
    rec.onresult = (e: any) => { let t = ""; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; setInput(t); };
    rec.start();
  }
  function speak(text: string) {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const hindiVoice = voices.find((v) => v.lang.includes("hi-IN")) || voices.find((v) => v.lang.includes("hi"));
    if (hindiVoice) u.voice = hindiVoice; u.lang = "hi-IN"; u.rate = 0.9; window.speechSynthesis.speak(u);
  }
  function handleImage(e: any) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => send("Yo photo ma ke cha? Nepali ma bhan.", reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e5e5e5] flex">
      {/* MAIN - Left/Center */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="w-full max-w-3xl mx-auto flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center font-black text-sm transition-all duration-300 hover:scale-125 hover:rotate-6">S</div>
            <span className="font-bold tracking-tight text-">Sajilo Sathi</span>
            <span className="text- text-zinc-500 border border-zinc-800 px-2 py-0.5 rounded-full">BETA</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={createNewChat} className="text- bg-white text-black px-3.5 py-1.5 rounded-full font-bold transition-all duration-300 hover:scale-110 active:scale-95">＋ New Chat</button>
            {/* Mobile ma history toggle, Desktop ma right sidebar cha */}
            <button onClick={() => setShowHistory(!showHistory)} className="lg:hidden w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">☰</button>
            <span className="hidden sm:flex items-center gap-1.5 text-sm text-zinc-400"><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>Online</span>
          </div>
        </header>

        {messages.length === 1 && (
          <div className="w-full max-w-3xl mx-auto px-5 pt-10 pb-6 text-center">
            <h1 className="text- md:text- font-bold tracking-tight leading-[1.1]">Ke sodhne ho?<br /><span className="text-zinc-500">Sajilo Sathi sanga sodha.</span></h1>
            <p className="text-zinc-500 text-sm mt-3">Mausam • Hisab • Photo • Voice — sabai euta thau ma.</p>
          </div>
        )}

        <div className="w-full max-w-3xl mx-auto flex gap-2 px-5 overflow-x-auto pb-2">
          {["Itahari ma mausam kasto cha?", "500 + 350", "Yo photo ma ke cha?"].map((q) => (
            <button key={q} onClick={() => { setUsedVoice(false); send(q); }} className="whitespace-nowrap text- bg-[#15151d] hover:bg-[#1e1e28] border border-white/5 px-3.5 py-2 rounded-full transition-all duration-300 hover:scale-110 hover:-translate-y-0.5 active:scale-95">{q}</button>
          ))}
        </div>

        <div ref={scrollRef} onScroll={handleScroll} className="w-full max-w-3xl mx-auto flex-1 flex flex-col gap-4 px-5 py-4 overflow-y-auto relative">
          {messages.map((m, i) => (
            <div key={i} className={`max-w-[80%] transition-all duration-300 hover:scale-[1.02] ${m.role === "user" ? "self-end" : "self-start"}`}>
              <div className={`px-4 py-3 rounded-2xl text- leading-relaxed ${m.role === "user" ? "bg-white text-black rounded-br-md" : "bg-[#15151d] border border-white/5 rounded-bl-md"}`}>
                {m.image && <img src={m.image} className="rounded-xl mb-2 max-h-64 w-full object-cover" />}
                {m.text}
              </div>
              {m.role === "assistant" && <button onClick={() => speak(m.text)} className="text-zinc-500 text-xs mt-1.5 ml-1 hover:text-white transition-all duration-300 hover:scale-125 inline-block">▶ Sunna</button>}
            </div>
          ))}
          {loading && <div className="text-zinc-500 text-sm animate-pulse">Sochdaichu...</div>}
          <div ref={bottomRef} />
          {showScrollBtn && <button onClick={scrollToBottom} className="sticky bottom-2 self-center bg-white text-black text-xs font-bold px-4 py-2 rounded-full shadow-2xl transition-all duration-300 hover:scale-110 animate-bounce">↓ New msg — Tala jau</button>}
        </div>

        <div className="w-full max-w-3xl mx-auto p-5 pt-2 sticky bottom-0 bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f] to-transparent">
          {listening && <p className="text-center text-red-400 text-xs mb-2 animate-pulse">🎤 Suniraheko chu... Bolo, input ma aaucha!</p>}
          <div className="flex items-center gap-2 bg-[#15151d] border border-white/10 rounded-full p-1.5 pl-4 shadow-2xl focus-within:border-white/25 transition-all duration-300 hover:border-white/20">
            <button onClick={() => fileRef.current?.click()} className="text-zinc-400 hover:text-white text-xl w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 hover:scale-150 hover:-translate-y-0.5 active:scale-90">＋</button>
            <input type="file" accept="image/*" ref={fileRef} onChange={handleImage} className="hidden" />
            <input value={input} onChange={(e) => { setInput(e.target.value); setUsedVoice(false); }} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Yaha sodha..." className="flex-1 bg-transparent outline-none text- placeholder:text-zinc-600 min-w-0" />
            <button onClick={startVoice} className={`${listening ? "bg-red-500 text-white scale-110" : "text-zinc-400 hover:text-white hover:bg-white/10"} w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 hover:scale-150 hover:-translate-y-0.5 active:scale-90`}>🎤</button>
            <button onClick={() => send()} className="bg-white text-black w-9 h-9 rounded-full flex items-center justify-center font-bold shrink-0 transition-all duration-300 hover:scale-150 hover:-translate-y-0.5 active:scale-90">↑</button>
          </div>
          <p className="text-center text- text-zinc-600 mt-3">Chat save huncha • Made in Itahari</p>
        </div>
      </div>

      {/* RIGHT SIDEBAR - Laptop website jasto, History dayan */}
      {showHistory && (
        <aside className="hidden lg:flex w- shrink-0 flex-col border-l border-white/10 bg-[#0d0d14] h-screen sticky top-0">
          <div className="p-4 flex items-center justify-between">
            <h2 className="font-bold text-sm">Chat History</h2>
            <button onClick={() => setShowHistory(false)} className="text-zinc-500 hover:text-white transition-all hover:scale-150">✕</button>
          </div>
          <button onClick={createNewChat} className="mx-4 mb-3 bg-white text-black text-sm font-bold py-2.5 rounded-full transition-all duration-300 hover:scale-[1.03] active:scale-95">＋ New Chat</button>
          <div className="flex-1 overflow-y-auto px-3 pb-4 flex flex-col gap-1">
            {chats.map((c) => (
              <div key={c.id} className={`group flex items-center justify-between px-3 py-3 rounded-xl cursor-pointer transition-all duration-300 hover:scale-[1.02] ${c.id === currentChatId ? "bg-white/10 border border-white/10" : "hover:bg-white/5"}`}>
                <button onClick={() => switchChat(c)} className="flex-1 text-left min-w-0">
                  <p className="text-sm truncate font-medium">{c.title}</p>
                  <p className="text- text-zinc-500 truncate mt-0.5">{c.messages.length} msgs • {new Date(c.createdAt).toLocaleDateString()}</p>
                </button>
                <button onClick={() => deleteChat(c.id)} className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 text-sm px-1 transition-all hover:scale-150">✕</button>
              </div>
            ))}
            {chats.length === 0 && <p className="text-zinc-500 text-sm px-2">Kunai chat chaina.</p>}
          </div>
          <p className="p-4 text- text-zinc-600 border-t border-white/5">Sajilo Sathi • Itahari<br />Sabai chat browser ma save huncha</p>
        </aside>
      )}
    </div>
  );
}