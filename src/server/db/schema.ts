import { sql } from "drizzle-orm";
import {
  index,
  int,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";


export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  // Public handle (like Discord). Friends are added by username, never email.
  // Nullable in the DB because Better Auth creates the row; the app forces the
  // user to pick a handle on first login (onboarding) before using the app.
  // Stored lowercase (a-z0-9_) so uniqueness is naturally case-insensitive.
  username: text("username").unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .default(false)
    .notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$onUpdate(() => new Date())
    .notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$onUpdate(() => new Date())
    .notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * Friendships between users. A single row represents the relationship between
 * the requester and the addressee. Status moves pending -> accepted, or the row
 * is removed on decline/unfriend. `blocked` keeps the row to suppress re-adds.
 */
export const friendship = sqliteTable(
  "friendship",
  {
    id: int("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    requesterId: text("requester_id", { length: 255 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    addresseeId: text("addressee_id", { length: 255 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "accepted", "blocked"] })
      .notNull()
      .default("pending"),
    createdAt: int("created_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: int("updated_at", { mode: "timestamp" }).$onUpdate(
      () => new Date(),
    ),
  },
  (t) => ({
    requesterIdx: index("friendship_requester_idx").on(t.requesterId),
    addresseeIdx: index("friendship_addressee_idx").on(t.addresseeId),
    pairUnique: uniqueIndex("friendship_pair_unique").on(
      t.requesterId,
      t.addresseeId,
    ),
  }),
);

/**
 * Direct messages between two users. All delivery is server-side; this table is
 * the source of truth that clients read from (realtime push comes later).
 */
export const dmMessage = sqliteTable(
  "dm_message",
  {
    id: int("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    senderId: text("sender_id", { length: 255 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    recipientId: text("recipient_id", { length: 255 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    // Message kind. Regular chat is "text"; "call" rows are call-log entries
    // (started by sender, to recipient) rendered as a system line in the thread.
    type: text("type", { enum: ["text", "call"] })
      .notNull()
      .default("text"),
    // Only set for type === "call". Outcome of the call and its length.
    callStatus: text("call_status", {
      enum: ["completed", "missed", "declined", "canceled"],
    }),
    callDurationSec: int("call_duration_sec", { mode: "number" }),
    createdAt: int("created_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    readAt: int("read_at", { mode: "timestamp" }),
  },
  (t) => ({
    senderIdx: index("dm_sender_idx").on(t.senderId),
    recipientIdx: index("dm_recipient_idx").on(t.recipientId),
    createdIdx: index("dm_created_idx").on(t.createdAt),
  }),
);
