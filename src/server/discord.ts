"use server";

import { env } from "@/env";
import axios from "axios";

export async function sendDiscordMessage(message: string) {
  "use server";

  if (!env.DISCORD_WEBHOOK_URL) {
    console.warn(
      "DISCORD_WEBHOOK_URL is not set. Not sending Discord message:",
      message,
    );
    return;
  }

  try {
    console.log("Discord message:", message);
    await axios.post(env.DISCORD_WEBHOOK_URL, {
      content: message,
    });
  } catch (error) {
    console.error("Error sending Discord message", error);
  }
}
