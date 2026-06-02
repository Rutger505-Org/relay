import { sendDiscordMessage } from "@/server/discord";
import {
  defaultShouldDehydrateQuery,
  MutationCache,
  QueryCache,
  QueryClient,
} from "@tanstack/react-query";
import SuperJSON from "superjson";

export const createQueryClient = () =>
  new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        void sendDiscordMessage(
          "Tanstack Query - Query Error:\n" +
            `Query Key: ${JSON.stringify(query.queryKey)}\n` +
            `Error message: ${error.message}`,
        );
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, variables, context, query) => {
        void sendDiscordMessage(
          "Tanstack Query - Mutation Error:\n" +
            `Mutation metadata: ${JSON.stringify({ variables, context, query })}\n` +
            `Error message: ${error.message}`,
        );
      },
    }),
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 30 * 1000,
      },
      dehydrate: {
        serializeData: SuperJSON.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
      hydrate: {
        deserializeData: SuperJSON.deserialize,
      },
    },
  });
