import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import { user } from "@/server/db/schema";

/** Allowed handle format: 3-20 chars, lowercase letters, digits, underscore. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9_]{3,20}$/,
    "Handle must be 3-20 characters: lowercase letters, numbers or underscore.",
  );

export const meRouter = createTRPCRouter({
  /** Check at sign-up whether a handle is free (and well-formed). */
  isUsernameAvailable: publicProcedure
    .input(z.object({ username: usernameSchema }))
    .query(async ({ ctx, input }) => {
      const taken = await ctx.db.query.user.findFirst({
        where: eq(user.username, input.username),
      });
      return { available: !taken };
    }),

  /** The signed-in user's own profile, including whether onboarding is done. */
  profile: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({
        id: user.id,
        name: user.name,
        username: user.username,
        image: user.image,
      })
      .from(user)
      .where(eq(user.id, ctx.session.user.id))
      .limit(1);

    return row ?? null;
  }),

  /** Claim a handle. One-time on onboarding; rejects duplicates. */
  setUsername: protectedProcedure
    .input(z.object({ username: usernameSchema }))
    .mutation(async ({ ctx, input }) => {
      const taken = await ctx.db.query.user.findFirst({
        where: eq(user.username, input.username),
      });
      if (taken && taken.id !== ctx.session.user.id) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "That handle is already taken.",
        });
      }

      await ctx.db
        .update(user)
        .set({ username: input.username })
        .where(eq(user.id, ctx.session.user.id));

      return { username: input.username };
    }),
});
