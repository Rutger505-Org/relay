"use client";

import { useSession } from "@/client/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/trpc/react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function DmPage() {
  const params = useParams<{ userId: string }>();
  const otherUserId = params.userId;

  const { data: session, isPending: sessionPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!sessionPending && !session) router.push("/sign-in");
  }, [session, sessionPending, router]);

  const myId = session?.user.id;
  const utils = api.useUtils();
  const conversation = api.messages.conversation.useQuery(
    { withUserId: otherUserId },
    { enabled: !!session },
  );

  const [body, setBody] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Realtime: subscribe to the server-relayed event stream and append any DM
  // belonging to this conversation straight into the query cache. No polling.
  useEffect(() => {
    if (!session) return;

    const source = new EventSource("/api/stream");

    source.onmessage = (e) => {
      const event = JSON.parse(e.data as string) as {
        type: string;
        message: {
          id: number;
          senderId: string;
          recipientId: string;
          body: string;
          createdAt: string;
          readAt: string | null;
        };
      };
      if (event.type !== "dm") return;

      const m = event.message;
      const inThisChat =
        (m.senderId === myId && m.recipientId === otherUserId) ||
        (m.senderId === otherUserId && m.recipientId === myId);
      if (!inThisChat) return;

      utils.messages.conversation.setData(
        { withUserId: otherUserId },
        (prev) => {
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
        },
      );
    };

    return () => source.close();
  }, [session, myId, otherUserId, utils]);

  const send = api.messages.send.useMutation({
    onSuccess: () => {
      // The sent message arrives back over the event stream (the server
      // publishes to the sender too), so just clear the input here.
      setBody("");
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation.data?.length]);

  if (sessionPending || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-screen max-w-2xl flex-col p-4">
      <div className="flex items-center justify-between border-b pb-3">
        <h1 className="text-xl font-semibold">Direct message</h1>
        <Link
          href="/friends"
          className="text-sm text-blue-600 hover:underline"
        >
          Back to friends
        </Link>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto py-4">
        {conversation.isError && (
          <p className="text-sm text-red-600">
            {conversation.error.message}
          </p>
        )}
        {conversation.data?.length === 0 && (
          <p className="text-sm text-gray-500">No messages yet. Say hi!</p>
        )}
        {conversation.data?.map((m) => {
          const mine = m.senderId === myId;
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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) send.mutate({ toUserId: otherUserId, body });
        }}
        className="flex gap-2 border-t pt-3"
      >
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type a message..."
          autoFocus
        />
        <Button type="submit" disabled={send.isPending}>
          Send
        </Button>
      </form>
    </div>
  );
}
