import { SignOutButton } from "@/app/_components/sign-out-button";
import { auth } from "@/server/auth";
import { headers } from "next/headers";
import Link from "next/link";

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <main className="flex flex-col items-center justify-center gap-10">
        <div className="flex flex-col items-center space-y-2.5">
          <h1 className="text-4xl font-bold">Relay</h1>
          <h2 className="max-w-md text-center font-semibold text-gray-600">
            Server-relayed chat &amp; calls. Add friends by handle, DM them,
            call them — all traffic through the server.
          </h2>
        </div>

        <div className="flex flex-col items-center space-y-2.5">
          {session ? (
            <div className="flex items-center gap-4">
              <Link
                href="/friends"
                className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white transition hover:bg-blue-700"
              >
                Friends &amp; messages
              </Link>
              <SignOutButton />
            </div>
          ) : (
            <Link
              href="/sign-in"
              className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white transition hover:bg-blue-700"
            >
              Sign in
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
