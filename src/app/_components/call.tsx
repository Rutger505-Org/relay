"use client";

import { useRealtimeEvent } from "@/app/_components/realtime";
import {
  Ringtone,
  ensureNotificationPermission,
  showIncomingCallNotification,
} from "@/app/_components/ringtone";
import { Button } from "@/components/ui/button";
import { api } from "@/trpc/react";
import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type CallState =
  | { phase: "idle" }
  | { phase: "outgoing"; peerId: string }
  | { phase: "incoming"; peerId: string }
  | { phase: "connected"; peerId: string };

const CallContext = createContext<{
  startCall: (peerId: string) => void;
  state: CallState;
} | null>(null);

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within CallProvider");
  return ctx;
}

/**
 * Manages 1:1 voice calls over the self-hosted LiveKit SFU. All audio flows
 * through the SFU (server-relayed, never peer-to-peer). Renders the incoming /
 * outgoing / in-call overlay.
 */
export function CallProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CallState>({ phase: "idle" });
  const [muted, setMuted] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const audioContainerRef = useRef<HTMLDivElement>(null);
  const ringtoneRef = useRef<Ringtone | null>(null);
  const notificationRef = useRef<Notification | null>(null);

  const friends = api.friends.list.useQuery();
  const handleFor = (id: string) =>
    friends.data?.find((f) => f.id === id)?.username ?? "friend";

  const start = api.voice.start.useMutation();
  const accept = api.voice.accept.useMutation();
  const signal = api.voice.signal.useMutation();

  const teardownRoom = useCallback(() => {
    void roomRef.current?.disconnect();
    roomRef.current = null;
    setMuted(false);
  }, []);

  // Connect to a LiveKit room and wire audio playback + lifecycle.
  const connectRoom = useCallback(
    async (url: string, token: string, peerId: string) => {
      const room = new Room();
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          audioContainerRef.current?.appendChild(el);
        }
      });
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach().forEach((el) => el.remove());
      });
      room.on(RoomEvent.Disconnected, () => {
        setState({ phase: "idle" });
        roomRef.current = null;
      });

      await room.connect(url, token);
      await room.localParticipant.setMicrophoneEnabled(true);
      setState({ phase: "connected", peerId });
    },
    [],
  );

  const startCall = useCallback(
    async (peerId: string) => {
      if (state.phase !== "idle") return;
      setState({ phase: "outgoing", peerId });
      try {
        const { url, token } = await start.mutateAsync({ toUserId: peerId });
        await connectRoom(url, token, peerId);
      } catch {
        setState({ phase: "idle" });
        teardownRoom();
      }
    },
    [state.phase, start, connectRoom, teardownRoom],
  );

  const acceptCall = useCallback(async () => {
    if (state.phase !== "incoming") return;
    const peerId = state.peerId;
    try {
      const { url, token } = await accept.mutateAsync({ fromUserId: peerId });
      await connectRoom(url, token, peerId);
    } catch {
      setState({ phase: "idle" });
      teardownRoom();
    }
  }, [state, accept, connectRoom, teardownRoom]);

  const declineCall = useCallback(() => {
    if (state.phase !== "incoming") return;
    signal.mutate({ toUserId: state.peerId, kind: "decline" });
    setState({ phase: "idle" });
  }, [state, signal]);

  const hangUp = useCallback(() => {
    if (state.phase === "idle") return;
    const kind = state.phase === "outgoing" ? "cancel" : "hangup";
    if ("peerId" in state) signal.mutate({ toUserId: state.peerId, kind });
    teardownRoom();
    setState({ phase: "idle" });
  }, [state, signal, teardownRoom]);

  // React to signaling from the other party.
  useRealtimeEvent((event) => {
    if (event.type !== "call") return;

    if (event.kind === "ring") {
      // Ignore a second incoming call while busy (auto-decline).
      setState((prev) =>
        prev.phase === "idle"
          ? { phase: "incoming", peerId: event.fromUserId }
          : prev,
      );
    } else if (event.kind === "cancel") {
      setState((prev) =>
        prev.phase === "incoming" && prev.peerId === event.fromUserId
          ? { phase: "idle" }
          : prev,
      );
    } else if (event.kind === "decline") {
      // Callee rejected our outgoing call.
      teardownRoom();
      setState((prev) =>
        prev.phase === "outgoing" ? { phase: "idle" } : prev,
      );
    } else if (event.kind === "hangup") {
      teardownRoom();
      setState({ phase: "idle" });
    }
    // "accept": the callee joins the room; ParticipantConnected drives the UI
    // via LiveKit, and we already moved to "connected" on our own connect.
  });

  const toggleMute = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    void room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  }, [muted]);

  useEffect(() => () => teardownRoom(), [teardownRoom]);

  // Ask for notification permission up front so we can alert on incoming calls
  // even when the tab isn't focused.
  useEffect(() => {
    ensureNotificationPermission();
  }, []);

  // Ring (audible) + desktop notification while a call is incoming. Stops on
  // any transition away from "incoming" (accepted, declined, cancelled).
  const incomingPeerId = state.phase === "incoming" ? state.peerId : null;
  useEffect(() => {
    if (!incomingPeerId) return;

    const ringtone = new Ringtone();
    ringtoneRef.current = ringtone;
    ringtone.start();
    notificationRef.current = showIncomingCallNotification(
      handleFor(incomingPeerId),
    );

    return () => {
      ringtone.stop();
      ringtoneRef.current = null;
      notificationRef.current?.close();
      notificationRef.current = null;
    };
    // handleFor is derived from the friends query; intentionally excluded so a
    // background friends refetch doesn't restart the ring. The peer id is what
    // matters for which call we're ringing for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingPeerId]);

  return (
    <CallContext.Provider
      value={{ startCall: (peerId) => void startCall(peerId), state }}
    >
      {children}
      <div ref={audioContainerRef} className="hidden" />
      {state.phase !== "idle" && (
        <div className="fixed bottom-4 right-4 z-50 w-72 rounded-2xl border bg-white p-4 shadow-lg">
          {state.phase === "incoming" && (
            <>
              <p className="font-semibold">Incoming call</p>
              <p className="text-sm text-gray-600">
                @{handleFor(state.peerId)} is calling…
              </p>
              <div className="mt-3 flex gap-2">
                <Button className="flex-1" onClick={() => void acceptCall()}>
                  Accept
                </Button>
                <Button
                  className="flex-1"
                  variant="outline"
                  onClick={declineCall}
                >
                  Decline
                </Button>
              </div>
            </>
          )}
          {state.phase === "outgoing" && (
            <>
              <p className="font-semibold">Calling @{handleFor(state.peerId)}…</p>
              <Button className="mt-3 w-full" variant="outline" onClick={hangUp}>
                Cancel
              </Button>
            </>
          )}
          {state.phase === "connected" && (
            <>
              <p className="font-semibold">
                In call with @{handleFor(state.peerId)}
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  className="flex-1"
                  variant="outline"
                  onClick={toggleMute}
                >
                  {muted ? "Unmute" : "Mute"}
                </Button>
                <Button className="flex-1" onClick={hangUp}>
                  Hang up
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </CallContext.Provider>
  );
}
