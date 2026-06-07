import { headers } from "next/headers";

import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { getAcceptedFriendIds } from "@/server/friends";
import {
  addConnection,
  publishToUser,
  removeConnection,
  subscribeToUser,
  type RealtimeEvent,
} from "@/server/realtime";

// SSE must stream; never statically optimize or cache.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events stream of realtime events for the signed-in user.
 *
 * The client opens this once (EventSource) and receives a `data:` frame for
 * every event published to them (e.g. an incoming DM). All delivery goes
 * through the server — clients never talk to each other directly.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.user.id;
  const encoder = new TextEncoder();

  // Tell friends this user came online (only on their first connection).
  const justCameOnline = addConnection(userId);
  if (justCameOnline) {
    const friendIds = await getAcceptedFriendIds(db, userId);
    for (const friendId of friendIds) {
      publishToUser(friendId, { type: "presence", userId, online: true });
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: RealtimeEvent) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };

      // Open the stream so the client's `onopen` fires immediately.
      controller.enqueue(encoder.encode(": connected\n\n"));

      const unsubscribe = subscribeToUser(userId, send);

      // Keep the connection alive through proxies that idle-timeout.
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, HEARTBEAT_MS);

      const close = () => {
        clearInterval(heartbeat);
        unsubscribe();
        // Broadcast offline when this was the user's last open connection.
        if (removeConnection(userId)) {
          void getAcceptedFriendIds(db, userId).then((friendIds) => {
            for (const friendId of friendIds) {
              publishToUser(friendId, {
                type: "presence",
                userId,
                online: false,
              });
            }
          });
        }
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      // Tear down when the client disconnects.
      if (request.signal.aborted) {
        close();
      } else {
        request.signal.addEventListener("abort", close);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering (nginx ingress) so frames flush immediately.
      "X-Accel-Buffering": "no",
    },
  });
}
