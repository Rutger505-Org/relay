import { TRPCError } from "@trpc/server";
import { and, asc, count, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
} from "@/server/api/trpc";
import { dmMessage, friendship } from "@/server/db/schema";
import type { db } from "@/server/db";
import { publishToUser } from "@/server/realtime";

/** Throw unless `me` and `other` are accepted friends. */
async function assertFriends(
  conn: typeof db,
  me: string,
  other: string,
): Promise<void> {
  const [row] = await conn
    .select({ id: friendship.id })
    .from(friendship)
    .where(
      and(
        eq(friendship.status, "accepted"),
        or(
          and(
            eq(friendship.requesterId, me),
            eq(friendship.addresseeId, other),
          ),
          and(
            eq(friendship.requesterId, other),
            eq(friendship.addresseeId, me),
          ),
        ),
      ),
    )
    .limit(1);

  if (!row) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You can only message friends.",
    });
  }
}

export const messagesRouter = createTRPCRouter({
  /** Full conversation between me and another user, oldest first. */
  conversation: protectedProcedure
    .input(z.object({ withUserId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const me = ctx.session.user.id;
      await assertFriends(ctx.db, me, input.withUserId);

      return ctx.db
        .select()
        .from(dmMessage)
        .where(
          or(
            and(
              eq(dmMessage.senderId, me),
              eq(dmMessage.recipientId, input.withUserId),
            ),
            and(
              eq(dmMessage.senderId, input.withUserId),
              eq(dmMessage.recipientId, me),
            ),
          ),
        )
        .orderBy(asc(dmMessage.createdAt));
    }),

  /** Send a direct message to a friend. */
  send: protectedProcedure
    .input(
      z.object({
        toUserId: z.string().min(1),
        body: z.string().min(1).max(4000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const me = ctx.session.user.id;
      await assertFriends(ctx.db, me, input.toUserId);

      const [created] = await ctx.db
        .insert(dmMessage)
        .values({
          senderId: me,
          recipientId: input.toUserId,
          body: input.body,
        })
        .returning();

      // Push to the recipient (live delivery) and back to the sender so their
      // other open tabs/devices stay in sync. Both go through the server.
      publishToUser(input.toUserId, { type: "dm", message: created });
      publishToUser(me, { type: "dm", message: created });

      return created;
    }),

  /** Unread message counts grouped by the friend who sent them. */
  unreadCounts: protectedProcedure.query(async ({ ctx }) => {
    const me = ctx.session.user.id;
    const rows = await ctx.db
      .select({
        fromUserId: dmMessage.senderId,
        count: count(),
      })
      .from(dmMessage)
      .where(and(eq(dmMessage.recipientId, me), isNull(dmMessage.readAt)))
      .groupBy(dmMessage.senderId);

    return rows;
  }),

  /** Mark every message from a given friend as read. */
  markRead: protectedProcedure
    .input(z.object({ withUserId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const me = ctx.session.user.id;
      await ctx.db
        .update(dmMessage)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(dmMessage.recipientId, me),
            eq(dmMessage.senderId, input.withUserId),
            isNull(dmMessage.readAt),
          ),
        );
    }),

  /** Notify a friend that I am (or stopped) typing. Fire-and-forget. */
  setTyping: protectedProcedure
    .input(
      z.object({
        toUserId: z.string().min(1),
        typing: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const me = ctx.session.user.id;
      await assertFriends(ctx.db, me, input.toUserId);

      publishToUser(input.toUserId, {
        type: "typing",
        fromUserId: me,
        typing: input.typing,
      });
    }),
});
