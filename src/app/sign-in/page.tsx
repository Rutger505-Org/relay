"use client";

import { signIn, useSession } from "@/client/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";

export default function SignInPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [magicEmail, setMagicEmail] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await signIn.email({
        email,
        password,
        rememberMe: true,
        callbackURL: "/",
      });
      if (response?.error) {
        throw new Error(response.error.message ?? response.error.statusText);
      }
    },
  });

  const magicMutation = useMutation({
    mutationFn: async () => {
      const response = await signIn.magicLink({
        email: magicEmail,
        callbackURL: "/",
      });
      if (response?.error) {
        throw new Error(response.error.message ?? response.error.statusText);
      }
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

  function handleMagicSubmit(e: React.FormEvent) {
    e.preventDefault();
    magicMutation.mutate();
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
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
                {mutation.error?.message ?? "Sign in failed"}
              </div>
            )}

            <Button
              type="submit"
              disabled={mutation.isPending}
              className="w-full"
            >
              {mutation.isPending ? "Signing in..." : "Sign in"}
            </Button>
          </form>
          <div className="my-8 border-t pt-8">
            <h2 className="mb-4 text-center text-lg font-semibold">
              Or sign in with a magic link
            </h2>
            <form onSubmit={handleMagicSubmit} className="space-y-4">
              <div>
                <Label htmlFor="magic-email">Email</Label>
                <Input
                  id="magic-email"
                  type="email"
                  value={magicEmail}
                  onChange={(e) => setMagicEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                />
              </div>
              {magicMutation.isError && (
                <div className="text-sm text-red-600">
                  {magicMutation.error?.message ?? "Failed to send magic link"}
                </div>
              )}
              {magicMutation.isSuccess && (
                <div className="text-sm text-green-600">
                  Magic link sent! Check your email.
                </div>
              )}
              <Button
                type="submit"
                disabled={magicMutation.isPending}
                className="w-full"
              >
                {magicMutation.isPending ? "Sending..." : "Send magic link"}
              </Button>
            </form>
          </div>
          <p className="mt-4 text-center text-sm text-gray-600">
            Don’t have an account?{" "}
            <Link href="/sign-up" className="text-blue-600 hover:underline">
              Sign up
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
