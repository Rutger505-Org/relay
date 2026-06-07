"use client";

import { useSession } from "@/client/auth";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

/**
 * Shape of events pushed from the server over the single SSE connection.
 * Mirrors `RealtimeEvent` on the server (serialized as JSON).
 */
export type ClientRealtimeEvent =
  | {
      type: "dm";
      message: {
        id: number;
        senderId: string;
        recipientId: string;
        body: string;
        type: "text" | "call";
        callStatus: "completed" | "missed" | "declined" | "canceled" | null;
        callDurationSec: number | null;
        createdAt: string;
        readAt: string | null;
      };
    }
  | { type: "typing"; fromUserId: string; typing: boolean }
  | { type: "presence"; userId: string; online: boolean }
  | { type: "friends" }
  | {
      type: "call";
      kind: "ring" | "accept" | "decline" | "cancel" | "hangup";
      fromUserId: string;
      roomName: string;
    };

type Listener = (event: ClientRealtimeEvent) => void;

const RealtimeContext = createContext<{
  subscribe: (listener: Listener) => () => void;
} | null>(null);

/**
 * Opens ONE EventSource to `/api/stream` for the whole app and fans events out
 * to any component that subscribes. Using a single connection keeps presence
 * accurate (one connection per tab) and avoids duplicate streams.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const listenersRef = useRef<Set<Listener>>(new Set());

  useEffect(() => {
    if (!session) return;

    const source = new EventSource("/api/stream");
    source.onmessage = (e) => {
      let event: ClientRealtimeEvent;
      try {
        event = JSON.parse(e.data as string) as ClientRealtimeEvent;
      } catch {
        return;
      }
      for (const listener of listenersRef.current) listener(event);
    };

    return () => source.close();
  }, [session]);

  const subscribe = (listener: Listener) => {
    listenersRef.current.add(listener);
    return () => listenersRef.current.delete(listener);
  };

  return (
    <RealtimeContext.Provider value={{ subscribe }}>
      {children}
    </RealtimeContext.Provider>
  );
}

/** Register a handler for realtime events. Re-subscribes if `handler` changes. */
export function useRealtimeEvent(handler: Listener) {
  const ctx = useContext(RealtimeContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!ctx) return;
    return ctx.subscribe((event) => handlerRef.current(event));
  }, [ctx]);
}
