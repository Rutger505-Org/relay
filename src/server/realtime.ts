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

export type RealtimeEvent =
  | { type: "dm"; message: typeof dmMessage.$inferSelect }
  | { type: "typing"; fromUserId: string; typing: boolean }
  | { type: "presence"; userId: string; online: boolean }
  // A friendship changed (request received/accepted/declined/removed). The
  // client just refetches its friend queries when it sees this.
  | { type: "friends" }
  // 1:1 voice call signaling. All media flows through the LiveKit SFU, so it
  // is always server-relayed (never peer-to-peer).
  | {
      type: "call";
      kind: "ring" | "accept" | "decline" | "cancel" | "hangup";
      fromUserId: string;
      roomName: string;
    };

/**
 * Live state of an in-flight call, keyed by room name. Used to derive the
 * call-log outcome (missed/declined/completed) and duration when the call ends,
 * since the individual tRPC mutations are otherwise stateless. Single-pod, like
 * presence — moves to shared storage alongside the bus when scaling out.
 */
export type ActiveCall = {
  callerId: string;
  calleeId: string;
  ringAt: number;
  connectedAt?: number;
};

// Survive HMR in dev: reuse a single emitter + presence registry across reloads.
const globalForBus = globalThis as unknown as {
  realtimeBus?: EventEmitter;
  realtimePresence?: Map<string, number>;
  realtimeCalls?: Map<string, ActiveCall>;
};

const bus =
  globalForBus.realtimeBus ??
  (() => {
    const emitter = new EventEmitter();
    // Many concurrent SSE listeners are expected; lift the default cap.
    emitter.setMaxListeners(0);
    return emitter;
  })();

/** userId -> number of open SSE connections (a user may have several tabs). */
const presence = globalForBus.realtimePresence ?? new Map<string, number>();

/** roomName -> in-flight call state. */
const calls = globalForBus.realtimeCalls ?? new Map<string, ActiveCall>();

if (process.env.NODE_ENV !== "production") {
  globalForBus.realtimeBus = bus;
  globalForBus.realtimePresence = presence;
  globalForBus.realtimeCalls = calls;
}

/** Record a newly-ringing call. Overwrites any stale entry for the room. */
export function beginCall(
  roomName: string,
  callerId: string,
  calleeId: string,
): void {
  calls.set(roomName, { callerId, calleeId, ringAt: Date.now() });
}

/** Mark a ringing call as answered (sets the connect timestamp once). */
export function markCallConnected(roomName: string): void {
  const call = calls.get(roomName);
  if (call && !call.connectedAt) call.connectedAt = Date.now();
}

/** Remove and return a call's state, so the ender can log it exactly once. */
export function endCall(roomName: string): ActiveCall | undefined {
  const call = calls.get(roomName);
  if (call) calls.delete(roomName);
  return call;
}

/**
 * Register an open connection for a user. Returns `true` when this is their
 * first connection (i.e. they just came online), so the caller can broadcast.
 */
export function addConnection(userId: string): boolean {
  const next = (presence.get(userId) ?? 0) + 1;
  presence.set(userId, next);
  return next === 1;
}

/**
 * Remove a connection for a user. Returns `true` when it was their last one
 * (i.e. they just went offline).
 */
export function removeConnection(userId: string): boolean {
  const next = (presence.get(userId) ?? 1) - 1;
  if (next <= 0) {
    presence.delete(userId);
    return true;
  }
  presence.set(userId, next);
  return false;
}

/** Filter `userIds` down to the ones currently online (single-pod view). */
export function whichOnline(userIds: string[]): string[] {
  return userIds.filter((id) => (presence.get(id) ?? 0) > 0);
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
