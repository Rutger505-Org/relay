"use client";

import { signOut } from "@/client/auth";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();

  return (
    <button
      onClick={() =>
        signOut({
          fetchOptions: {
            onSuccess: () => {
              router.push("/sign-in");
            },
          },
        })
      }
      title="Sign out"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-[#36373d] hover:text-rose-400"
    >
      <LogOut size={18} />
    </button>
  );
}
