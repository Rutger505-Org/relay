"use client";

import { useSession } from "@/client/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/trpc/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function FriendsPage() {
  const { data: session, isPending: sessionPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!sessionPending && !session) router.push("/sign-in");
  }, [session, sessionPending, router]);

  const utils = api.useUtils();
  const friends = api.friends.list.useQuery(undefined, { enabled: !!session });
  const incoming = api.friends.incoming.useQuery(undefined, {
    enabled: !!session,
  });
  const outgoing = api.friends.outgoing.useQuery(undefined, {
    enabled: !!session,
  });

  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const refreshAll = async () => {
    await Promise.all([
      utils.friends.list.invalidate(),
      utils.friends.incoming.invalidate(),
      utils.friends.outgoing.invalidate(),
    ]);
  };

  const sendRequest = api.friends.sendRequest.useMutation({
    onSuccess: async () => {
      setNotice("Friend request sent.");
      setEmail("");
      await refreshAll();
    },
    onError: (e) => setNotice(e.message),
  });

  const respond = api.friends.respond.useMutation({
    onSuccess: refreshAll,
  });
  const remove = api.friends.remove.useMutation({ onSuccess: refreshAll });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    // Look up the user by email, then send the request.
    const found = await utils.friends.search.fetch({ email });
    if (!found) {
      setNotice("No user found with that email.");
      return;
    }
    sendRequest.mutate({ userId: found.id });
  };

  if (sessionPending || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Friends</h1>
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          Home
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a friend</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="flex flex-col gap-3">
            <Label htmlFor="email">Their email</Label>
            <div className="flex gap-2">
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="friend@example.com"
                required
              />
              <Button type="submit" disabled={sendRequest.isPending}>
                Add
              </Button>
            </div>
            {notice && <p className="text-sm text-gray-600">{notice}</p>}
          </form>
        </CardContent>
      </Card>

      {!!incoming.data?.length && (
        <Card>
          <CardHeader>
            <CardTitle>Incoming requests</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {incoming.data.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2"
              >
                <span>{r.requester.name || r.requester.email}</span>
                <div className="flex gap-2">
                  <Button
                    onClick={() =>
                      respond.mutate({ friendshipId: r.id, accept: true })
                    }
                  >
                    Accept
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      respond.mutate({ friendshipId: r.id, accept: false })
                    }
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!!outgoing.data?.length && (
        <Card>
          <CardHeader>
            <CardTitle>Pending sent requests</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {outgoing.data.map((r) => (
              <div key={r.id} className="text-sm text-gray-600">
                {r.addressee.name || r.addressee.email} — pending
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your friends</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {friends.isPending && <p>Loading...</p>}
          {!friends.isPending && !friends.data?.length && (
            <p className="text-sm text-gray-600">No friends yet.</p>
          )}
          {friends.data?.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2">
              <span>{f.name || f.email}</span>
              <div className="flex gap-2">
                <Link href={`/dm/${f.id}`}>
                  <Button>Message</Button>
                </Link>
                <Button
                  variant="outline"
                  onClick={() => remove.mutate({ userId: f.id })}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
