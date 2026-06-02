import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import { post } from "@/server/db/schema";
import { eq } from "drizzle-orm";

export const postRouter = createTRPCRouter({
  getAll: publicProcedure.query(async ({ ctx }) => {
    const posts = await ctx.db.query.post.findMany({
      orderBy: (post, { desc }) => [desc(post.createdAt)],
    });

    return posts ?? null;
  }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.insert(post).values({
        name: input.name,
        createdById: ctx.session.user.id,
      });
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), newName: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(post)
        .set({ name: input.newName })
        .where(eq(post.id, input.id));
    }),
});
