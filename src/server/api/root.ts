import { friendsRouter } from "@/server/api/routers/friends";
import { meRouter } from "@/server/api/routers/me";
import { messagesRouter } from "@/server/api/routers/messages";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  me: meRouter,
  friends: friendsRouter,
  messages: messagesRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.friends.list();
 */
export const createCaller = createCallerFactory(appRouter);
