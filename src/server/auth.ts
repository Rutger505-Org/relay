import { env } from "@/env";
import { db } from "@/server/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: env.AUTH_EMAIL_HOST,
  port: env.AUTH_EMAIL_PORT,
  auth: {
    user: env.AUTH_EMAIL_USER,
    pass: env.AUTH_EMAIL_PASSWORD,
  },
  secure: true,
});

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    magicLink({
      disableSignUp: true,

      sendMagicLink: async ({ email, url }) => {
        const result = await transporter.sendMail({
          to: email,
          from: env.AUTH_EMAIL_FROM,
          subject: "Your sign-in link",
          text: `Click to sign in: ${url}\nThis link expires in 6 minutes.`,
          html: `<p>Click to sign in: <a href="${url}">${url}</a> this link expires in 6 minutes</p>`,
        });

        if (result.rejected.length || !result.messageId) {
          console.error("Email send failed", result);
          throw new Error("Failed to send email");
        }
      },
    }),
  ],
});
