"use client";

import { sendDiscordMessage } from "@/server/discord";
import { useSession } from "@/client/auth";
import { api } from "@/trpc/react";
import { type api as serverApi } from "@/trpc/server";
import { useState } from "react";

export function Post({
  post,
}: Readonly<{
  post: Awaited<ReturnType<(typeof serverApi.post)["getAll"]>>[number];
}>) {
  const { data: session } = useSession();
  const updatePostMutation = api.post.update.useMutation();
  const [isEditing, setIsEditing] = useState(false);
  const [postName, setPostName] = useState(post.name);
  const [draftPostName, setDraftPostName] = useState(post.name);
  const canEdit = session?.user?.id === post.createdById;

  const handleSave = async () => {
    try {
      await updatePostMutation.mutateAsync({
        id: post.id,
        newName: draftPostName,
      });
      setPostName(draftPostName);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to update post:", error);
      await sendDiscordMessage("Failed to update post: " + error?.toString());
    }
  };

  return (
    <li className="rounded-lg bg-white/10 p-4">
      {isEditing ? (
        <div className={"flex justify-between gap-2"}>
          <input
            className={"rounded border-2 px-2 text-black"}
            type="text"
            value={draftPostName}
            onChange={(e) => setDraftPostName(e.target.value)}
          />
          <button onClick={handleSave} disabled={updatePostMutation.isPending}>
            {updatePostMutation.isPending ? "Saving..." : "Save"}
          </button>
          <button onClick={() => setIsEditing(false)}>Cancel</button>
        </div>
      ) : (
        <div className={"flex justify-between"}>
          {postName}
          {canEdit && <button onClick={() => setIsEditing(true)}>Edit</button>}
        </div>
      )}
    </li>
  );
}
