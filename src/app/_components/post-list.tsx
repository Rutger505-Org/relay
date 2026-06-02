"use client";

import { Post } from "@/app/_components/post";
import { type post } from "@/server/db/schema";
import { api } from "@/trpc/react";
import { type InferSelectModel } from "drizzle-orm";

export function PostList() {
  const { data: posts = [], isPending } = api.post.getAll.useQuery();

  return (
    <div>
      <h2 className="text-2xl font-bold">Posts</h2>

      {isPending && <p>Loading...</p>}

      {!isPending && <PostsView posts={posts} />}
    </div>
  );
}

function PostsView({
  posts,
}: Readonly<{ posts: InferSelectModel<typeof post>[] }>) {
  return posts.length ? (
    <ul className="flex flex-col gap-2">
      {posts.map((post) => (
        <Post key={post.id} post={post} />
      ))}
    </ul>
  ) : (
    <p>No posts yet.</p>
  );
}
