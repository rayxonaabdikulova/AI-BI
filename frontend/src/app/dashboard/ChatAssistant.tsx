"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { Bot, SendHorizonal, Sparkles, UserRound } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { getApiBaseUrl } from "@/lib/api";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

interface ChatProps {
  clusterData: any[];
}

type ChatResponse = {
  reply: string;
  note?: string;
};

type ParsedAssistantDetails = {
  title: string;
  items: Array<{ label: string; value: string }>;
};

function getGreeting(language: string): string {
  if (language === "uz") return "Salom! Ma'lumotlaringiz bo'yicha savol bering. VIP va risk segmentlarini tahlil qilib beraman.";
  if (language === "ru")
    return "Здравствуйте! Задайте вопрос по данным. Я помогу с анализом VIP и рисковых клиентов.";
  return "Hello! Ask a question about your data. I can analyze VIP and at-risk customer segments.";
}

function getLocalError(language: string): string {
  if (language === "uz")
    return "So'rovni qayta ishlay olmadim. Iltimos, avval segmentatsiyani ishga tushirib qayta urinib ko'ring.";
  if (language === "ru")
    return "Не удалось обработать запрос. Пожалуйста, сначала запустите сегментацию и попробуйте снова.";
  return "I could not process this request. Please run segmentation first and try again.";
}

function parseStructuredAssistantMessage(content: string): ParsedAssistantDetails | null {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;

  const title = lines[0];
  if (!title.endsWith(":")) return null;

  const items: Array<{ label: string; value: string }> = [];
  for (const line of lines.slice(1)) {
    if (!line.startsWith("- ")) return null;
    const body = line.slice(2).trim();
    const splitIndex = body.indexOf(":");
    if (splitIndex <= 0) return null;
    const label = body.slice(0, splitIndex).trim();
    const value = body.slice(splitIndex + 1).trim();
    if (!label || !value) return null;
    items.push({ label, value });
  }
  if (!items.length) return null;
  return { title, items };
}

function AssistantMessageBody({ content }: { content: string }) {
  const parsed = parseStructuredAssistantMessage(content);
  if (!parsed) {
    return <p className="whitespace-pre-wrap">{content}</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{parsed.title}</p>
      <div className="overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-50/70 dark:border-zinc-700 dark:bg-zinc-900/60">
        {parsed.items.map((item, idx) => (
          <div
            key={`${item.label}-${idx}`}
            className="flex items-start justify-between gap-3 border-b border-zinc-200/70 px-3 py-2 text-sm last:border-b-0 dark:border-zinc-700/70"
          >
            <span className="font-medium text-zinc-600 dark:text-zinc-300">{item.label}</span>
            <span className="text-right font-semibold text-zinc-900 dark:text-zinc-100">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChatAssistant({ clusterData }: ChatProps) {
  const { token } = useAuth();
  const { t, language } = useLanguage();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: getGreeting(language),
    },
  ]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const apiBase = useMemo(() => getApiBaseUrl(), []);
  const quickPrompts = useMemo(
    () => [t("dashboard.chat.quick.vip"), t("dashboard.chat.quick.risk"), t("dashboard.chat.quick.forecast")],
    [t],
  );

  useEffect(() => {
    setMessages((prev) => {
      if (prev.length !== 1 || prev[0]?.role !== "assistant") return prev;
      return [{ role: "assistant", content: getGreeting(language) }];
    });
  }, [language]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isLoading]);

  useEffect(() => {
    const area = textareaRef.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight, 168)}px`;
  }, [input]);

  const sendMessage = async (overrideMessage?: string) => {
    const message = (overrideMessage ?? input).trim();
    if (!message || isLoading || !token) return;

    const nextHistory = [...messages, { role: "user" as const, content: message }];
    setMessages(nextHistory);
    setInput("");
    setIsLoading(true);

    try {
      const historyPayload = nextHistory
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content }));
      const { data } = await axios.post<ChatResponse>(
        `${apiBase}/api/chat`,
        {
          message: message,
          context_data: clusterData,
          history: historyPayload,
          language: language,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply || "No response generated." },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: getLocalError(language),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendMessage();
  };

  const onInputKeyDown = async (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await sendMessage();
    }
  };

  const onQuickPromptClick = async (prompt: string) => {
    if (isLoading || !token) return;
    await sendMessage(prompt);
  };

  return (
    <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
          <Sparkles className="size-5" aria-hidden />
        </div>
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{t("dashboard.chat.title")}</h3>
      </div>

      <div
        ref={scrollContainerRef}
        className="mb-4 h-[360px] overflow-y-auto rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/40"
      >
        <div className="space-y-3">
          {messages.map((msg, idx) => (
            <div key={`${msg.role}-${idx}`} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`flex max-w-[88%] items-end gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                <div
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
                    msg.role === "user"
                      ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                      : "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                  }`}
                >
                  {msg.role === "user" ? (
                    <UserRound className="size-4" aria-hidden />
                  ) : (
                    <Bot className="size-4" aria-hidden />
                  )}
                </div>
                <div
                  className={`rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "rounded-br-none bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm"
                      : "rounded-bl-none border border-gray-100 bg-white text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <AssistantMessageBody content={msg.content} />
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            </div>
          ))}

          {isLoading ? (
            <div className="flex justify-start">
              <div className="flex max-w-[88%] items-end gap-2">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                  <Bot className="size-4" aria-hidden />
                </div>
                <div className="rounded-2xl rounded-bl-none border border-gray-100 bg-white px-4 py-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-zinc-400 animate-bounce" />
                    <span className="size-2 rounded-full bg-zinc-400 animate-bounce [animation-delay:120ms]" />
                    <span className="size-2 rounded-full bg-zinc-400 animate-bounce [animation-delay:240ms]" />
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mb-3">
        <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">{t("dashboard.chat.quickTitle")}</p>
        <div className="flex flex-wrap gap-2">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => void onQuickPromptClick(prompt)}
              disabled={isLoading}
              className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-zinc-200 bg-white p-2 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={t("dashboard.chat.placeholder")}
            rows={1}
            className="max-h-40 min-h-[44px] flex-1 resize-none rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-violet-500 dark:focus:ring-violet-900/40"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium text-white transition-all duration-200 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500 bg-violet-600 hover:bg-violet-500"
          >
            <SendHorizonal className="size-4" aria-hidden />
            {t("dashboard.chat.send")}
          </button>
        </div>
      </form>
    </section>
  );
}
