"use client";

import { Avatar } from "@/app/_components/avatar";
import { useRealtimeEvent } from "@/app/_components/realtime";
import { Input } from "@/components/ui/input";
import { api } from "@/trpc/react";
import { PhoneMissed, Phone, SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** Format a call duration in seconds as "m:ss". */
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Human label for a call-log entry, from the perspective of the viewer.
 * `mine` is true when the viewer was the caller (the row's sender).
 */
function callLabel(
  status: "completed" | "missed" | "declined" | "canceled" | null,
  durationSec: number | null,
  mine: boolean,
): string {
  switch (status) {
    case "completed":
      return `Voice call · ${formatDuration(durationSec ?? 0)}`;
    case "declined":
      return mine ? "Call declined" : "You declined the call";
    case "missed":
    case "canceled":
      return mine ? "No answer" : "Missed call";
    default:
      return "Voice call";
  }
}

/**
 * A single 1:1 conversation pane: message history, live delivery, typing
 * indicator, and (optionally) a call button rendered by the parent.
 */
export function Conversation({
  myId,
  otherUserId,
  otherHandle,
  online,
  headerRight,
}: {
  myId: string;
  otherUserId: string;
  otherHandle: string;
  online?: boolean;
  headerRight?: React.ReactNode;
}) {
  const utils = api.useUtils();
  const conversation = api.messages.conversation.useQuery({
    withUserId: otherUserId,
  });

  const [body, setBody] = useState("");
  const [theyTyping, setTheyTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Mark the thread read on open and whenever new messages land while open.
  const markRead = api.messages.markRead.useMutation({
    onSuccess: () => utils.messages.unreadCounts.invalidate(),
  });
  useEffect(() => {
    markRead.mutate({ withUserId: otherUserId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherUserId, conversation.data?.length]);

  useRealtimeEvent((event) => {
    if (event.type === "typing") {
      if (event.fromUserId === otherUserId) setTheyTyping(event.typing);
      return;
    }
    if (event.type !== "dm") return;

    const m = event.message;
    const inThisChat =
      (m.senderId === myId && m.recipientId === otherUserId) ||
      (m.senderId === otherUserId && m.recipientId === myId);
    if (!inThisChat) return;

    utils.messages.conversation.setData({ withUserId: otherUserId }, (prev) => {
      if (!prev) return prev;
      if (prev.some((existing) => existing.id === m.id)) return prev;
      return [
        ...prev,
        {
          ...m,
          createdAt: new Date(m.createdAt),
          readAt: m.readAt ? new Date(m.readAt) : null,
        },
      ];
    });
  });

  const send = api.messages.send.useMutation({ onSuccess: () => setBody("") });

  // Typing indicator with auto-clear so it never sticks.
  const setTyping = api.messages.setTyping.useMutation();
  const typingActiveRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signalTyping = () => {
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      setTyping.mutate({ toUserId: otherUserId, typing: true });
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      typingActiveRef.current = false;
      setTyping.mutate({ toUserId: otherUserId, typing: false });
    }, 2500);
  };
  const stopTyping = () => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      setTyping.mutate({ toUserId: otherUserId, typing: false });
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation.data?.length, theyTyping]);

  const messages = conversation.data ?? [];

  return (
    <div className="flex h-full flex-col bg-[#313338]">
      {/* Header */}
      <div className="flex h-12 items-center gap-3 border-b border-black/20 px-4 shadow-sm">
        <Avatar handle={otherHandle} size="sm" online={online} />
        <div className="leading-tight">
          <h2 className="text-sm font-bold text-white">@{otherHandle}</h2>
          <p className="text-xs text-zinc-400">
            {online ? "Online" : "Offline"}
          </p>
        </div>
        <div className="ml-auto">{headerRight}</div>
      </div>

      {/* Messages */}
      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-4 py-4">
        {conversation.isError && (
          <p className="text-sm text-rose-400">{conversation.error.message}</p>
        )}
        {messages.length === 0 && !conversation.isError && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-zinc-500">
            <Avatar handle={otherHandle} size="lg" />
            <p className="mt-2 text-lg font-bold text-zinc-300">
              @{otherHandle}
            </p>
            <p className="text-sm">
              This is the beginning of your conversation. Say hi! 👋
            </p>
          </div>
        )}

        {messages.map((m, i) => {
          const mine = m.senderId === myId;

          // Call-log entries render as a centered system line, Discord-style.
          if (m.type === "call") {
            const completed = m.callStatus === "completed";
            return (
              <div
                key={m.id}
                className="my-2 flex items-center justify-center gap-2 text-xs font-medium text-zinc-500"
              >
                {completed ? (
                  <Phone size={14} className="text-emerald-400" />
                ) : (
                  <PhoneMissed size={14} className="text-rose-400" />
                )}
                <span>{callLabel(m.callStatus, m.callDurationSec, mine)}</span>
              </div>
            );
          }

          // Group consecutive text messages from the same sender.
          const prev = messages[i - 1];
          const grouped =
            prev && prev.type === "text" && prev.senderId === m.senderId;

          return (
            <div
              key={m.id}
              className={`flex gap-3 px-2 ${grouped ? "mt-0.5" : "mt-3"} ${
                grouped ? "py-0" : "py-0.5"
              } rounded hover:bg-black/10`}
            >
              <div className="w-10 shrink-0">
                {!grouped && (
                  <Avatar handle={mine ? "you" : otherHandle} size="md" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                {!grouped && (
                  <p className="mb-0.5 text-sm font-semibold text-white">
                    {mine ? "You" : `@${otherHandle}`}
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words text-sm text-[#dbdee1]">
                  {m.body}
                </p>
              </div>
            </div>
          );
        })}

        {theyTyping && (
          <div className="flex items-center gap-2 px-2 py-1 text-xs text-zinc-400">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" />
            </span>
            @{otherHandle} is typing…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) {
            send.mutate({ toUserId: otherUserId, body });
            stopTyping();
          }
        }}
        className="flex items-center gap-2 px-4 pb-4"
      >
        <div className="flex flex-1 items-center gap-2 rounded-lg bg-[#383a40] px-3">
          <Input
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              if (e.target.value) signalTyping();
              else stopTyping();
            }}
            placeholder={`Message @${otherHandle}`}
            autoFocus
            className="h-11 border-none bg-transparent text-sm placeholder:text-zinc-500 focus-visible:ring-0"
          />
          <button
            type="submit"
            disabled={send.isPending || !body.trim()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-indigo-400 transition-colors hover:text-indigo-300 disabled:text-zinc-600"
            title="Send"
          >
            <SendHorizontal size={18} />
          </button>
        </div>
      </form>
    </div>
  );
}
