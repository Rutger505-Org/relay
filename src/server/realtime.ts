import { EventEmitter } from "node:events";

import type { dmMessage } from "@/server/db/schema";

/**
 * In-process realtime event bus for server-relayed push (SSE).
 *
 * NOTE: this is single-pod only. Events are emitted in the Node process that
 * handled the mutation, so all clients of a user must be connected to the same
 * pod. The MVP deploys a single replica, which is fine. When scaling to
 * multiple replicas, replace the in-process emitter with a shared pub/sub
 * (e.g. Redis) so events fan out across pods.
 */

export type RealtimeEvent = {
  type: "dm";
  message: typeof dmMessage.$inferSelect;
};

// Survive HMR in dev: reuse a single emitter across module reloads.
const globalForBus = globalThis as unknown as {
  realtimeBus?: EventEmitter;
};

const bus =
  globalForBus.realtimeBus ??
  (() => {
    const emitter = new EventEmitter();
    // Many concurrent SSE listeners are expected; lift the default cap.
    emitter.setMaxListeners(0);
    return emitter;
  })();

if (process.env.NODE_ENV !== "production") {
  globalForBus.realtimeBus = bus;
}

/** Channel name for a given user's events. */
function userChannel(userId: string): string {
  return `user:${userId}`;
}

/** Publish an event to every connection subscribed for `userId`. */
export function publishToUser(userId: string, event: RealtimeEvent): void {
  bus.emit(userChannel(userId), event);
}

/**
 * Subscribe to a user's events. Returns an unsubscribe function that must be
 * called when the connection closes to avoid leaking listeners.
 */
export function subscribeToUser(
  userId: string,
  handler: (event: RealtimeEvent) => void,
): () => void {
  const channel = userChannel(userId);
  bus.on(channel, handler);
  return () => bus.off(channel, handler);
}
