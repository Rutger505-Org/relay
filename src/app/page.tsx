import { AppShell } from "@/app/_components/app-shell";
import { CallProvider } from "@/app/_components/call";
import { RealtimeProvider } from "@/app/_components/realtime";

export default function Home() {
  return (
    <RealtimeProvider>
      <CallProvider>
        <AppShell />
      </CallProvider>
    </RealtimeProvider>
  );
}
