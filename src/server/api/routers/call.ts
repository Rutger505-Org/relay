import { TRPCError } from "@trpc/server";
import { AccessToken } from "livekit-server-sdk";
import { z } from "zod";

import { env } from "@/env";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import type { db } from "@/server/db";
import { dmMessage } from "@/server/db/schema";
import { getAcceptedFriendIds } from "@/server/friends";
import {
  beginCall,
  endCall,
  markCallConnected,
  publishToUser,
  type ActiveCall,
} from "@/server/realtime";

/**
 * Deterministic room name for a 1:1 call, so both participants compute the same
 * room without coordinating. Order-independent (sorted pair).
 */
function roomNameFor(a: string, b: string): string {
  return `call_${[a, b].sort().join("_")}`;
}

/** Ensure LiveKit is configured, returning its settings or a clear error. */
function livekitConfig() {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = env;
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Voice calling is not configured on this server.",
    });
  }
  return { url: LIVEKIT_URL, key: LIVEKIT_API_KEY, secret: LIVEKIT_API_SECRET };
}

/** Mint a short-lived join token for `identity` to join `roomName`. */
async function mintToken(
  key: string,
  secret: string,
  identity: string,
  roomName: string,
): Promise<string> {
  const at = new AccessToken(key, secret, { identity, ttl: "1h" });
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
  });
  return at.toJwt();
}

/**
 * Persist a call-log entry into the DM thread and push it to both parties so it
 * shows up live in the conversation. The row is owned by the caller (sender) ->
 * callee (recipient). Missed calls are left unread so the callee gets a badge;
 * outcomes the callee already saw (declined / completed) are pre-read.
 */
async function logCall(
  conn: typeof db,
  call: ActiveCall,
  status: "completed" | "missed" | "declined" | "canceled",
  durationSec: number | null,
): Promise<void> {
  const [created] = await conn
    .insert(dmMessage)
    .values({
      senderId: call.callerId,
      recipientId: call.calleeId,
      body: "Call",
      type: "call",
      callStatus: status,
      callDurationSec: durationSec,
      // Only a missed call should nag the callee with an unread badge.
      readAt: status === "missed" ? null : new Date(),
    })
    .returning();

  if (!created) return;
  publishToUser(call.callerId, { type: "dm", message: created });
  publishToUser(call.calleeId, { type: "dm", message: created });
}

export const callRouter = createTRPCRouter({
  /** Start ringing a friend. Returns the caller's own room credentials. */
  start: protectedProcedure
    .input(z.object({ toUserId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const me = ctx.session.user.id;
      const { url, key, secret } = livekitConfig();

      const friendIds = await getAcceptedFriendIds(ctx.db, me);
      if (!friendIds.includes(input.toUserId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only call friends.",
        });
      }

      const roomName = roomNameFor(me, input.toUserId);
      const token = await mintToken(key, secret, me, roomName);

      beginCall(roomName, me, input.toUserId);
      publishToUser(input.toUserId, {
        type: "call",
        kind: "ring",
        fromUserId: me,
        roomName,
      });

      return { url, token, roomName };
    }),

  /** Accept an incoming call from `fromUserId`. Returns join credentials. */
  accept: protectedProcedure
    .input(z.object({ fromUserId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const me = ctx.session.user.id;
      const { url, key, secret } = livekitConfig();

      const friendIds = await getAcceptedFriendIds(ctx.db, me);
      if (!friendIds.includes(input.fromUserId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only call friends.",
        });
      }

      const roomName = roomNameFor(me, input.fromUserId);
      const token = await mintToken(key, secret, me, roomName);

      markCallConnected(roomName);
      publishToUser(input.fromUserId, {
        type: "call",
        kind: "accept",
        fromUserId: me,
        roomName,
      });

      return { url, token, roomName };
    }),

  /** Signal call control to the other party: decline, cancel or hang up. */
  signal: protectedProcedure
    .input(
      z.object({
        toUserId: z.string().min(1),
        kind: z.enum(["decline", "cancel", "hangup"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const me = ctx.session.user.id;
      const roomName = roomNameFor(me, input.toUserId);

      // Relay the control signal to the other party.
      publishToUser(input.toUserId, {
        type: "call",
        kind: input.kind,
        fromUserId: me,
        roomName,
      });

      // Log the call to the thread exactly once, on the terminal signal. The
      // active-call record tells us caller/callee and whether it connected,
      // independent of who sent this signal.
      const call = endCall(roomName);
      if (!call) return;

      if (input.kind === "hangup") {
        if (call.connectedAt) {
          const durationSec = Math.max(
            0,
            Math.round((Date.now() - call.connectedAt) / 1000),
          );
          await logCall(ctx.db, call, "completed", durationSec);
        } else {
          // Hung up before connecting — treat as a missed call.
          await logCall(ctx.db, call, "missed", null);
        }
      } else if (input.kind === "decline") {
        await logCall(ctx.db, call, "declined", null);
      } else {
        // "cancel": caller gave up before the callee answered.
        await logCall(ctx.db, call, "missed", null);
      }
    }),
});
