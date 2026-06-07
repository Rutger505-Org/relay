"use client";

import { useRealtimeEvent } from "@/app/_components/realtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/trpc/react";
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
  headerRight,
}: {
  myId: string;
  otherUserId: string;
  otherHandle: string;
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-lg font-semibold">@{otherHandle}</h2>
        {headerRight}
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
        {conversation.isError && (
          <p className="text-sm text-red-600">{conversation.error.message}</p>
        )}
        {conversation.data?.length === 0 && (
          <p className="text-sm text-gray-500">No messages yet. Say hi!</p>
        )}
        {conversation.data?.map((m) => {
          const mine = m.senderId === myId;

          // Call-log entries render as a centered system line, Discord-style.
          if (m.type === "call") {
            return (
              <div
                key={m.id}
                className="my-1 flex items-center justify-center gap-2 self-center text-sm text-gray-500"
              >
                <span aria-hidden>{m.callStatus === "completed" ? "📞" : "📵"}</span>
                <span>{callLabel(m.callStatus, m.callDurationSec, mine)}</span>
              </div>
            );
          }

          return (
            <div
              key={m.id}
              className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                mine
                  ? "self-end bg-blue-600 text-white"
                  : "self-start bg-gray-200 text-black"
              }`}
            >
              {m.body}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="h-5 px-4 text-xs text-gray-500">
        {theyTyping ? `@${otherHandle} is typing…` : ""}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) {
            send.mutate({ toUserId: otherUserId, body });
            stopTyping();
          }
        }}
        className="flex gap-2 border-t p-3"
      >
        <Input
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            if (e.target.value) signalTyping();
            else stopTyping();
          }}
          placeholder={`Message @${otherHandle}`}
          autoFocus
        />
        <Button type="submit" disabled={send.isPending}>
          Send
        </Button>
      </form>
    </div>
  );
}
