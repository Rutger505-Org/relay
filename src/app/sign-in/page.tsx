"use client";

import { signIn, signUp, useSession } from "@/client/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";

type Mode = "signin" | "signup";

/**
 * Single entry point for authentication: sign in and sign up live on the same
 * page, toggled between two clearly-titled tabs. Auth is email + password only
 * (magic links were removed); a separate page handles password resets.
 */
export default function AuthPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const utils = api.useUtils();
  const setUsername = api.me.setUsername.useMutation();

  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [username, setUsername_] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const signInMut = useMutation({
    mutationFn: async () => {
      const res = await signIn.email({
        email,
        password,
        rememberMe: true,
        callbackURL: "/",
      });
      if (res?.error) {
        throw new Error(res.error.message ?? res.error.statusText);
      }
    },
  });

  const signUpMut = useMutation({
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
      if (!available) throw new Error("That handle is already taken.");

      const res = await signUp.email({ email, name, password });
      if (res.error) throw new Error(res.error.message ?? "Sign up failed");

      // Better Auth signs the user in on sign-up, so we can claim the handle.
      await setUsername.mutateAsync({ username: handle });
      router.push("/");
    },
  });

  useEffect(() => {
    if (session) router.push("/");
  }, [router, session]);

  const active = mode === "signin" ? signInMut : signUpMut;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signin") signInMut.mutate();
    else signUpMut.mutate();
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          {/* Tabs make it unmistakable which action you're taking. */}
          <div className="mb-2 grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`rounded-md py-2 text-sm font-medium transition ${
                mode === "signin"
                  ? "bg-white shadow"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`rounded-md py-2 text-sm font-medium transition ${
                mode === "signup"
                  ? "bg-white shadow"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Create account
            </button>
          </div>
          <CardTitle>
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <>
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
                    onChange={(e) => setUsername_(e.target.value)}
                    required
                    autoComplete="off"
                    placeholder="e.g. coolcat_99"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    How friends add you. 3–20 chars: lowercase letters, numbers
                    or underscore. Your email stays private.
                  </p>
                </div>
              </>
            )}

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
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {mode === "signin" && (
                  <Link
                    href="/forgot-password"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Forgot password?
                  </Link>
                )}
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder={
                  mode === "signup" ? "At least 8 characters" : "Your password"
                }
              />
            </div>

            {active.isError && (
              <div className="text-sm text-red-600">
                {active.error?.message ??
                  (mode === "signin" ? "Sign in failed" : "Sign up failed")}
              </div>
            )}

            <Button
              type="submit"
              disabled={active.isPending}
              className="w-full"
            >
              {active.isPending
                ? mode === "signin"
                  ? "Signing in..."
                  : "Creating account..."
                : mode === "signin"
                  ? "Sign in"
                  : "Create account"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-600">
            {mode === "signin" ? (
              <>
                Don’t have an account?{" "}
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className="text-blue-600 hover:underline"
                >
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  className="text-blue-600 hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
