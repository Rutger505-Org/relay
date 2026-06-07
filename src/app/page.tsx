import { AppShell } from "@/app/_components/app-shell";
import { RealtimeProvider } from "@/app/_components/realtime";

export default function Home() {
  return (
    <RealtimeProvider>
      <AppShell />
    </RealtimeProvider>
  );
}
