import { AppShell } from "@/app/_components/app-shell";
import { CallProvider } from "@/app/_components/call";
import { RealtimeProvider } from "@/app/_components/realtime";
import { auth } from "@/server/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Auth is checked on the server: unauthenticated visitors are redirected
 * straight to /sign-in (no client-side session roundtrip, no spinner flash).
 * The authenticated user's id is handed to the shell so it renders immediately.
 */
export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  return (
    <RealtimeProvider>
      <CallProvider>
        <AppShell myId={session.user.id} />
      </CallProvider>
    </RealtimeProvider>
  );
}
