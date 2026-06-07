"use client";

import { forgetPassword } from "@/client/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import React, { useState } from "react";

/**
 * Request a password-reset email. Better Auth sends a link to /reset-password
 * with a token. We always show a success message (don't reveal whether an
 * account exists for that email).
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await forgetPassword({
        email,
        redirectTo: "/reset-password",
      });
      if (res?.error) {
        throw new Error(res.error.message ?? "Failed to send reset email");
      }
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
        </CardHeader>
        <CardContent>
          {mutation.isSuccess ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                If an account exists for <strong>{email}</strong>, we’ve sent a
                password reset link. Check your inbox.
              </p>
              <Link
                href="/sign-in"
                className="block text-center text-sm text-blue-600 hover:underline"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-gray-600">
                Enter your email and we’ll send you a link to reset your
                password.
              </p>
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
              {mutation.isError && (
                <div className="text-sm text-red-600">
                  {mutation.error?.message ?? "Something went wrong"}
                </div>
              )}
              <Button
                type="submit"
                disabled={mutation.isPending}
                className="w-full"
              >
                {mutation.isPending ? "Sending..." : "Send reset link"}
              </Button>
              <Link
                href="/sign-in"
                className="block text-center text-sm text-blue-600 hover:underline"
              >
                Back to sign in
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
