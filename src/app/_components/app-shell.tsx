"use client";

import { useSession } from "@/client/auth";
import { Avatar } from "@/app/_components/avatar";
import { useCall } from "@/app/_components/call";
import { Conversation } from "@/app/_components/conversation";
import { useRealtimeEvent } from "@/app/_components/realtime";
import { SignOutButton } from "@/app/_components/sign-out-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/trpc/react";
import { Check, Phone, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

/**
 * Discord-style home: a left sidebar with friends (avatars, presence + unread
 * badges), friend requests and an add-by-handle box, and a main pane with the
 * selected conversation.
 */
export function AppShell() {
  const { data: session, isPending: sessionPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!sessionPending && !session) router.push("/sign-in");
  }, [session, sessionPending, router]);

  const myId = session?.user.id;
  const utils = api.useUtils();
  const { startCall, state: callState } = useCall();

  const profile = api.me.profile.useQuery(undefined, { enabled: !!session });
  const friends = api.friends.list.useQuery(undefined, { enabled: !!session });
  const incoming = api.friends.incoming.useQuery(undefined, {
    enabled: !!session,
  });
  const presence = api.friends.presence.useQuery(undefined, {
    enabled: !!session,
  });
  const unread = api.messages.unreadCounts.useQuery(undefined, {
    enabled: !!session,
  });

  const [selected, setSelected] = useState<string | null>(null);
  const [handle, setHandle] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  // Live presence map.
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (presence.data) setOnlineIds(new Set(presence.data));
  }, [presence.data]);

  // React to all server pushes that affect the sidebar.
  useRealtimeEvent((event) => {
    if (event.type === "presence") {
      setOnlineIds((prev) => {
        const next = new Set(prev);
        if (event.online) next.add(event.userId);
        else next.delete(event.userId);
        return next;
      });
    } else if (event.type === "friends") {
      void utils.friends.list.invalidate();
      void utils.friends.incoming.invalidate();
      void utils.friends.outgoing.invalidate();
      void utils.friends.presence.invalidate();
    } else if (event.type === "dm") {
      // A message landed; refresh unread badges (the open thread self-clears).
      void utils.messages.unreadCounts.invalidate();
    }
  });

  const refreshAll = async () => {
    await Promise.all([
      utils.friends.list.invalidate(),
      utils.friends.incoming.invalidate(),
      utils.friends.presence.invalidate(),
    ]);
  };

  const sendRequest = api.friends.sendRequest.useMutation({
    onSuccess: async () => {
      setNotice("Friend request sent.");
      setHandle("");
      await refreshAll();
    },
    onError: (e) => setNotice(e.message),
  });
  const respond = api.friends.respond.useMutation({ onSuccess: refreshAll });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const found = await utils.friends.search.fetch({ username: handle });
    if (!found) {
      setNotice("No user found with that handle.");
      return;
    }
    sendRequest.mutate({ userId: found.id });
  };

  const unreadByUser = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of unread.data ?? []) map.set(r.fromUserId, r.count);
    return map;
  }, [unread.data]);

  const sortedFriends = useMemo(() => {
    if (!friends.data) return [];
    return [...friends.data].sort((a, b) => {
      const ao = onlineIds.has(a.id) ? 0 : 1;
      const bo = onlineIds.has(b.id) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return (a.username ?? "").localeCompare(b.username ?? "");
    });
  }, [friends.data, onlineIds]);

  const selectedFriend = friends.data?.find((f) => f.id === selected);

  if (sessionPending || !session || !myId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#313338] text-muted-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-indigo-500" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#313338] text-[#dbdee1]">
      {/* Sidebar */}
      <aside className="flex w-72 shrink-0 flex-col bg-[#2b2d31]">
        <div className="flex h-12 items-center border-b border-black/20 px-4 shadow-sm">
          <span className="text-base font-bold tracking-tight">Relay</span>
        </div>

        <div className="p-3">
          <form onSubmit={handleAdd} className="flex gap-2">
            <Input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="Add a friend by handle"
              autoComplete="off"
              className="h-9 border-none bg-[#1e1f22] text-sm placeholder:text-zinc-500 focus-visible:ring-0"
            />
            <Button
              type="submit"
              size="icon"
              disabled={sendRequest.isPending}
              className="shrink-0"
              title="Send request"
            >
              <UserPlus />
            </Button>
          </form>
          {notice && <p className="mt-2 text-xs text-zinc-400">{notice}</p>}
        </div>

        {!!incoming.data?.length && (
          <div className="px-3 pb-2">
            <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-zinc-400">
              Pending — {incoming.data.length}
            </p>
            <div className="flex flex-col gap-1">
              {incoming.data.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-2 rounded-md px-1 py-1"
                >
                  <Avatar handle={r.requester.username ?? "?"} size="sm" />
                  <span className="truncate text-sm font-medium">
                    @{r.requester.username}
                  </span>
                  <div className="ml-auto flex gap-1">
                    <button
                      onClick={() =>
                        respond.mutate({ friendshipId: r.id, accept: true })
                      }
                      title="Accept"
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1e1f22] text-emerald-400 hover:bg-emerald-500 hover:text-white"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={() =>
                        respond.mutate({ friendshipId: r.id, accept: false })
                      }
                      title="Decline"
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1e1f22] text-rose-400 hover:bg-rose-500 hover:text-white"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-2">
          <p className="px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-zinc-400">
            Direct Messages
          </p>
          {!sortedFriends.length && (
            <p className="px-2 text-sm text-zinc-500">
              No friends yet. Add someone by their handle above.
            </p>
          )}
          {sortedFriends.map((f) => {
            const count = unreadByUser.get(f.id) ?? 0;
            const isOnline = onlineIds.has(f.id);
            return (
              <button
                key={f.id}
                onClick={() => setSelected(f.id)}
                className={`group flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors ${
                  selected === f.id
                    ? "bg-[#404249] text-white"
                    : "text-zinc-400 hover:bg-[#36373d] hover:text-zinc-200"
                }`}
              >
                <Avatar handle={f.username ?? "?"} size="sm" online={isOnline} />
                <span className="truncate text-sm font-medium">
                  {f.username}
                </span>
                {count > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-xs font-bold text-white">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* User footer */}
        <div className="flex items-center gap-2 bg-[#232428] px-2 py-2">
          <Avatar handle={profile.data?.username ?? "?"} size="sm" online />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-semibold text-white">
              {profile.data?.username ? `@${profile.data.username}` : "…"}
            </p>
            <p className="text-xs text-zinc-400">Online</p>
          </div>
          <SignOutButton />
        </div>
      </aside>

      {/* Main pane */}
      <main className="flex-1 bg-[#313338]">
        {selectedFriend?.username ? (
          <Conversation
            key={selectedFriend.id}
            myId={myId}
            otherUserId={selectedFriend.id}
            otherHandle={selectedFriend.username}
            online={onlineIds.has(selectedFriend.id)}
            headerRight={
              <Button
                size="icon"
                variant="ghost"
                className="text-zinc-300 hover:text-white"
                disabled={callState.phase !== "idle"}
                onClick={() => void startCall(selectedFriend.id)}
                title="Start voice call"
              >
                <Phone />
              </Button>
            }
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-500">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#2b2d31] text-3xl">
              👋
            </div>
            <p className="text-lg font-semibold text-zinc-300">
              Welcome to Relay
            </p>
            <p className="text-sm">Pick a friend to start chatting or calling.</p>
          </div>
        )}
      </main>
    </div>
  );
}
