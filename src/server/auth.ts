import { env } from "@/env";
import { db } from "@/server/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
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
    minPasswordLength: 8,
    // Password-reset flow: emails a link back to /reset-password?token=...
    sendResetPassword: async ({ user, url }) => {
      const result = await transporter.sendMail({
        to: user.email,
        from: env.AUTH_EMAIL_FROM,
        subject: "Reset your Relay password",
        text: `Reset your password: ${url}\nIf you didn't request this, you can ignore this email. The link expires in 1 hour.`,
        html: `<p>Reset your password: <a href="${url}">${url}</a></p><p>If you didn't request this, you can ignore this email. The link expires in 1 hour.</p>`,
      });

      if (result.rejected.length || !result.messageId) {
        console.error("Password reset email send failed", result);
        throw new Error("Failed to send email");
      }
    },
  },
});
