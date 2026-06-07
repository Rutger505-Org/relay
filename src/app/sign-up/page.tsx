"use client";

import { signUp, useSession } from "@/client/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";

export default function SignUpPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const utils = api.useUtils();
  const setUsername = api.me.setUsername.useMutation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [username, setUsernameValue] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const handle = username.trim().toLowerCase();
      if (!/^[a-z0-9_]{3,20}$/.test(handle)) {
        throw new Error(
          "Handle must be 3-20 characters: lowercase letters, numbers or underscore.",
        );
      }

      // Reject taken handles before creating the account.
      const { available } = await utils.me.isUsernameAvailable.fetch({
        username: handle,
      });
      if (!available) {
        throw new Error("That handle is already taken.");
      }

      const response = await signUp.email({ email, name, password });
      if (response.error) {
        throw new Error(response.error.message ?? "Sign up failed");
      }

      // Better Auth signs the user in on sign-up, so we can claim the handle.
      await setUsername.mutateAsync({ username: handle });

      router.push("/");
    },
  });

  useEffect(() => {
    if (session) {
      router.push("/");
    }
  }, [router, session]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign up</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Your name"
              />
            </div>
            <div>
              <Label htmlFor="username">Handle</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsernameValue(e.target.value)}
                required
                autoComplete="off"
                placeholder="e.g. coolcat_99"
              />
              <p className="mt-1 text-xs text-gray-500">
                How friends add you. 3–20 chars: lowercase letters, numbers or
                underscore. Your email stays private.
              </p>
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
              />
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Your password"
              />
            </div>

            {mutation.isError && (
              <div className="text-sm text-red-600">
                {mutation.error?.message ?? "Sign up failed"}
              </div>
            )}

            <Button
              type="submit"
              disabled={mutation.isPending}
              className="w-full"
            >
              {mutation.isPending ? "Signing up..." : "Sign up"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-gray-600">
            Already have an account?{" "}
            <Link href="/sign-in" className="text-blue-600 hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
