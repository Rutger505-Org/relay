// Validate environment on every page
import "@/env";

import { OnboardingGate } from "@/app/_components/onboarding-gate";
import { TRPCReactProvider } from "@/trpc/react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { type ReactNode } from "react";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Relay",
  description: "Server-relayed chat & calls.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <TRPCReactProvider>
          <OnboardingGate>{children}</OnboardingGate>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
