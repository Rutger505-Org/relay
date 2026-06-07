import { TRPCError } from "@trpc/server";
import { AccessToken } from "livekit-server-sdk";
import { z } from "zod";

import { env } from "@/env";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { getAcceptedFriendIds } from "@/server/friends";
import { publishToUser } from "@/server/realtime";

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
      publishToUser(input.toUserId, {
        type: "call",
        kind: input.kind,
        fromUserId: me,
        roomName: roomNameFor(me, input.toUserId),
      });
    }),
});
