import { and, eq, or } from "drizzle-orm";

import type { db as database } from "@/server/db";
import { friendship } from "@/server/db/schema";

/** IDs of every user who is an accepted friend of `userId`. */
export async function getAcceptedFriendIds(
  conn: typeof database,
  userId: string,
): Promise<string[]> {
  const rows = await conn
    .select({
      requesterId: friendship.requesterId,
      addresseeId: friendship.addresseeId,
    })
    .from(friendship)
    .where(
      and(
        eq(friendship.status, "accepted"),
        or(
          eq(friendship.requesterId, userId),
          eq(friendship.addresseeId, userId),
        ),
      ),
    );

  return rows.map((r) =>
    r.requesterId === userId ? r.addresseeId : r.requesterId,
  );
}
