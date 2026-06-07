import { TRPCError } from "@trpc/server";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
} from "@/server/api/trpc";
import { friendship, user } from "@/server/db/schema";
import { usernameSchema } from "@/server/api/routers/me";
import { getAcceptedFriendIds } from "@/server/friends";
import { whichOnline } from "@/server/realtime";

/**
 * Public-safe shape of a user we expose to friends/requests.
 * NOTE: never include `email` here — handles are the only public identifier.
 */
const publicUserColumns = {
  id: user.id,
  name: user.name,
  username: user.username,
  image: user.image,
};

export const friendsRouter = createTRPCRouter({
  /** Find a user by exact handle so you can send them a request. */
  search: protectedProcedure
    .input(z.object({ username: usernameSchema }))
    .query(async ({ ctx, input }) => {
      const [found] = await ctx.db
        .select(publicUserColumns)
        .from(user)
        .where(eq(user.username, input.username))
        .limit(1);

      if (!found || found.id === ctx.session.user.id) return null;
      return found;
    }),

  /** Send a friend request to another user by id. */
  sendRequest: protectedProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const me = ctx.session.user.id;
      if (input.userId === me) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot add yourself.",
        });
      }

      const target = await ctx.db.query.user.findFirst({
        where: eq(user.id, input.userId),
      });
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }

      // Any existing relationship in either direction blocks a new request.
      const existing = await ctx.db
        .select()
        .from(friendship)
        .where(
          or(
            and(
              eq(friendship.requesterId, me),
              eq(friendship.addresseeId, input.userId),
            ),
            and(
              eq(friendship.requesterId, input.userId),
              eq(friendship.addresseeId, me),
            ),
          ),
        );

      if (existing.length) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A friend request or friendship already exists.",
        });
      }

      await ctx.db.insert(friendship).values({
        requesterId: me,
        addresseeId: input.userId,
        status: "pending",
      });
    }),

  /** Incoming pending requests addressed to me. */
  incoming: protectedProcedure.query(async ({ ctx }) => {
    const me = ctx.session.user.id;
    return ctx.db
      .select({
        id: friendship.id,
        createdAt: friendship.createdAt,
        requester: publicUserColumns,
      })
      .from(friendship)
      .innerJoin(user, eq(user.id, friendship.requesterId))
      .where(
        and(eq(friendship.addresseeId, me), eq(friendship.status, "pending")),
      );
  }),

  /** Outgoing pending requests I have sent. */
  outgoing: protectedProcedure.query(async ({ ctx }) => {
    const me = ctx.session.user.id;
    return ctx.db
      .select({
        id: friendship.id,
        createdAt: friendship.createdAt,
        addressee: publicUserColumns,
      })
      .from(friendship)
      .innerJoin(user, eq(user.id, friendship.addresseeId))
      .where(
        and(eq(friendship.requesterId, me), eq(friendship.status, "pending")),
      );
  }),

  /** Accept or decline an incoming request. Only the addressee may respond. */
  respond: protectedProcedure
    .input(
      z.object({
        friendshipId: z.number(),
        accept: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const me = ctx.session.user.id;
      const [row] = await ctx.db
        .select()
        .from(friendship)
        .where(eq(friendship.id, input.friendshipId))
        .limit(1);

      if (!row || row.addresseeId !== me || row.status !== "pending") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Request not found.",
        });
      }

      if (input.accept) {
        await ctx.db
          .update(friendship)
          .set({ status: "accepted" })
          .where(eq(friendship.id, input.friendshipId));
      } else {
        await ctx.db
          .delete(friendship)
          .where(eq(friendship.id, input.friendshipId));
      }
    }),

  /** IDs of my friends who are currently online (single-pod presence view). */
  presence: protectedProcedure.query(async ({ ctx }) => {
    const friendIds = await getAcceptedFriendIds(ctx.db, ctx.session.user.id);
    return whichOnline(friendIds);
  }),

  /** List my accepted friends. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const me = ctx.session.user.id;
    const rows = await ctx.db
      .select({
        requesterId: friendship.requesterId,
        addresseeId: friendship.addresseeId,
      })
      .from(friendship)
      .where(
        and(
          eq(friendship.status, "accepted"),
          or(
            eq(friendship.requesterId, me),
            eq(friendship.addresseeId, me),
          ),
        ),
      );

    const friendIds = rows.map((r) =>
      r.requesterId === me ? r.addresseeId : r.requesterId,
    );
    if (!friendIds.length) return [];

    return ctx.db
      .select(publicUserColumns)
      .from(user)
      .where(
        or(...friendIds.map((id) => eq(user.id, id))),
      );
  }),

  /** Remove a friend (deletes the relationship in either direction). */
  remove: protectedProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const me = ctx.session.user.id;
      await ctx.db
        .delete(friendship)
        .where(
          or(
            and(
              eq(friendship.requesterId, me),
              eq(friendship.addresseeId, input.userId),
            ),
            and(
              eq(friendship.requesterId, input.userId),
              eq(friendship.addresseeId, me),
            ),
          ),
        );
    }),
});
