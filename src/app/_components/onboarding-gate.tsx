"use client";

import { useSession } from "@/client/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/trpc/react";
import { useState, type ReactNode } from "react";

/**
 * Forces a signed-in user to claim a handle before using the app. Friends are
 * added by handle, so everyone needs one. Public (signed-out) pages and the
 * loading window render their children untouched.
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const { data: session, isPending: sessionPending } = useSession();
  const profile = api.me.profile.useQuery(undefined, { enabled: !!session });

  // Not signed in, or still resolving — don't block rendering.
  if (sessionPending || !session) return <>{children}</>;
  if (profile.isPending) return <>{children}</>;
  if (profile.data?.username) return <>{children}</>;

  return <ChooseHandle onDone={() => profile.refetch()} />;
}

function ChooseHandle({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);

  const setUsernameMutation = api.me.setUsername.useMutation({
    onSuccess: onDone,
    onError: (e) => setError(e.message),
  });

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border p-6 shadow-sm">
        <h1 className="text-2xl font-bold">Choose your handle</h1>
        <p className="mt-1 text-sm text-gray-600">
          This is how friends add you on Relay — like a Discord username. Pick
          something unique. Your email stays private.
        </p>

        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            setUsernameMutation.mutate({ username });
          }}
        >
          <Label htmlFor="handle">Handle</Label>
          <Input
            id="handle"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. coolcat_99"
            autoFocus
            autoComplete="off"
          />
          <p className="text-xs text-gray-500">
            3–20 characters: lowercase letters, numbers or underscore.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={setUsernameMutation.isPending}>
            {setUsernameMutation.isPending ? "Saving..." : "Claim handle"}
          </Button>
        </form>
      </div>
    </div>
  );
}
