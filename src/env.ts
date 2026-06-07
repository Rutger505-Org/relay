import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DISCORD_WEBHOOK_URL: z.string().url().optional(),
    DATABASE_SQLITE_PATH: z.string().optional().default("./data/db.sqlite"),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .optional()
      .default("development"),

    AUTH_SECRET: z.string(),

    AUTH_EMAIL_FROM: z.string(),
    AUTH_EMAIL_HOST: z.string(),
    AUTH_EMAIL_PORT: z.coerce.number(),
    AUTH_EMAIL_USER: z.string(),
    AUTH_EMAIL_PASSWORD: z.string(),

    // LiveKit (self-hosted SFU) for 1:1 voice calls. Optional so the app runs
    // before voice is configured; the call API errors clearly if unset.
    // LIVEKIT_URL is the public wss:// signaling URL clients connect to.
    LIVEKIT_URL: z.string().optional(),
    LIVEKIT_API_KEY: z.string().optional(),
    LIVEKIT_API_SECRET: z.string().optional(),
  },
  // Prefixed with NEXT_PUBLIC_
  client: {},
  // For Next.js >= 13.4.4, you only need to destructure client variables:
  experimental__runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
