import { PostCreate } from "@/app/_components/post-create";
import { PostList } from "@/app/_components/post-list";
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
      <main className={"flex flex-col items-center justify-center gap-10"}>
        <div className={"flex flex-col items-center space-y-2.5"}>
          <h1 className="text-4xl font-bold">Hi There!</h1>
          <h2 className={"text-1xl max-w-md text-center font-bold"}>
            This is a demo blog app with database integration and discord
            messages for showing usage of these tools
          </h2>
        </div>
        <div className={"flex flex-col items-center space-y-2.5"}>
          <span className={"text-center"}>
            Session: {session ? JSON.stringify(session) : "No session"}
          </span>
          {session ? <SignOutButton /> : <Link href={"sign-in"}>Sign In</Link>}
        </div>

        <div className={"flex flex-col gap-7"}>
          {session && <PostCreate />}

          <PostList />
        </div>
      </main>
    </div>
  );
}
