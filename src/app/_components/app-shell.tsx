"use client";

import { useSession } from "@/client/auth";
import { Conversation } from "@/app/_components/conversation";
import { useRealtimeEvent } from "@/app/_components/realtime";
import { SignOutButton } from "@/app/_components/sign-out-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/trpc/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function PresenceDot({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
        online ? "bg-green-500" : "bg-gray-300"
      }`}
      title={online ? "Online" : "Offline"}
    />
  );
}

/**
 * Discord-style home: a left sidebar with friends (presence + unread badges),
 * friend requests and an add-by-handle box, and a main pane with the selected
 * conversation.
 */
export function AppShell() {
  const { data: session, isPending: sessionPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!sessionPending && !session) router.push("/sign-in");
  }, [session, sessionPending, router]);

  const myId = session?.user.id;
  const utils = api.useUtils();

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
      <div className="flex min-h-screen items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="flex w-72 shrink-0 flex-col border-r bg-gray-50">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="font-bold">Relay</span>
          <span className="text-sm text-gray-600">
            @{profile.data?.username}
          </span>
        </div>

        <div className="border-b p-3">
          <form onSubmit={handleAdd} className="flex gap-2">
            <Input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="Add by handle"
              autoComplete="off"
            />
            <Button type="submit" disabled={sendRequest.isPending}>
              Add
            </Button>
          </form>
          {notice && <p className="mt-2 text-xs text-gray-600">{notice}</p>}
        </div>

        {!!incoming.data?.length && (
          <div className="border-b p-3">
            <p className="mb-2 text-xs font-semibold uppercase text-gray-500">
              Requests
            </p>
            <div className="flex flex-col gap-2">
              {incoming.data.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate text-sm">
                    @{r.requester.username}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      onClick={() =>
                        respond.mutate({ friendshipId: r.id, accept: true })
                      }
                    >
                      ✓
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        respond.mutate({ friendshipId: r.id, accept: false })
                      }
                    >
                      ✕
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2">
          <p className="px-2 py-1 text-xs font-semibold uppercase text-gray-500">
            Friends
          </p>
          {!sortedFriends.length && (
            <p className="px-2 text-sm text-gray-500">No friends yet.</p>
          )}
          {sortedFriends.map((f) => {
            const count = unreadByUser.get(f.id) ?? 0;
            return (
              <button
                key={f.id}
                onClick={() => setSelected(f.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-gray-200 ${
                  selected === f.id ? "bg-gray-200" : ""
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <PresenceDot online={onlineIds.has(f.id)} />@{f.username}
                </span>
                {count > 0 && (
                  <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="border-t p-3">
          <SignOutButton />
        </div>
      </aside>

      {/* Main pane */}
      <main className="flex-1">
        {selectedFriend?.username ? (
          <Conversation
            key={selectedFriend.id}
            myId={myId}
            otherUserId={selectedFriend.id}
            otherHandle={selectedFriend.username}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-500">
            Select a friend to start chatting.
          </div>
        )}
      </main>
    </div>
  );
}
