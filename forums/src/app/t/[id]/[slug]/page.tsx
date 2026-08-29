import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isMod, isStaff } from "@/lib/types";
import { formatPostDate } from "@/lib/thread-ui";
import { ThreadClient } from "./ThreadClient";
import type { Metadata } from "next";
import "./xf-thread.css";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string; slug: string }>;
};

const authorSelect = {
  id: true,
  username: true,
  role: true,
  level: true,
  reputation: true,
  avatarUrl: true,
  mcUsername: true,
  postCount: true,
  createdAt: true,
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const thread = await prisma.thread.findFirst({ where: { id: Number(id), deletedAt: null } });
  if (!thread) return { title: "Thread" };
  return {
    title: thread.title,
    description: thread.searchText?.slice(0, 160) || thread.title,
    openGraph: { title: thread.title, type: "article" },
  };
}

export default async function ThreadPage({ params }: Props) {
  const { id, slug } = await params;
  const threadId = Number(id);
  const session = await getSession();
  const thread = await prisma.thread.findFirst({
    where: { id: threadId, deletedAt: null },
    include: {
      author: { select: authorSelect },
      category: { include: { group: true } },
      poll: { include: { options: true } },
      bookmarks: session ? { where: { userId: session.forumUserId } } : false,
      follows: session ? { where: { userId: session.forumUserId } } : false,
    },
  });
  if (!thread) notFound();
  if (thread.isStaffOnly && !isStaff(session?.role)) notFound();

  await prisma.thread.update({ where: { id: threadId }, data: { views: { increment: 1 } } });

  const posts = await prisma.post.findMany({
    where: { threadId, deletedAt: null, parentId: null },
    orderBy: { createdAt: "asc" },
    include: {
      author: { select: authorSelect },
      reactions: true,
      children: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: authorSelect },
          reactions: true,
        },
      },
    },
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: thread.title,
    author: { "@type": "Person", name: thread.author.username },
    datePublished: thread.createdAt.toISOString(),
    interactionStatistic: {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/CommentAction",
      userInteractionCount: thread.replyCount,
    },
  };

  const threadSlug = slug || thread.slug;

  return (
    <main className="thread-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="p-pre-body">
        <ul className="p-breadcrumbs">
          <li><Link href="/">Forums</Link></li>
          {thread.category.group && <li><span>{thread.category.group.name}</span></li>}
          <li><Link href={`/c/${thread.category.slug}`}>{thread.category.name}</Link></li>
        </ul>

        <div className="p-body-header">
          <div className="p-title">
            <h1 className="p-title-value">{thread.title}</h1>
          </div>
          <div className="p-description">
            <ul className="listInline listInline--bullet">
              <li>
                <span className="u-srOnly">Thread starter</span>
                <Link href={`/u/${thread.author.username}`}>{thread.author.username}</Link>
              </li>
              <li>
                <span className="u-srOnly">Start date</span>
                <time dateTime={thread.createdAt.toISOString()}>
                  {formatPostDate(thread.createdAt.toISOString())}
                </time>
              </li>
              <li>{thread.views} views</li>
              <li>{thread.replyCount} replies</li>
            </ul>
          </div>
          {(thread.isPinned || thread.isLocked || thread.isSolved || thread.isFeatured) && (
            <div className="thread-states" style={{ marginTop: 10 }}>
              {thread.isPinned && <span className="tag">Pinned</span>}
              {thread.isLocked && <span className="tag">Locked</span>}
              {thread.isSolved && <span className="tag solved">Solved</span>}
              {thread.isFeatured && <span className="tag">Featured</span>}
            </div>
          )}
        </div>
      </div>

      <Suspense fallback={<div className="muted" style={{ padding: 16 }}>Loading thread…</div>}>
        <ThreadClient
          threadId={thread.id}
          slug={threadSlug}
          initialPosts={JSON.parse(JSON.stringify(posts))}
          locked={thread.isLocked}
          canModerate={isMod(session?.role)}
          isAuthor={session?.forumUserId === thread.authorId}
          bookmarked={Array.isArray(thread.bookmarks) && thread.bookmarks.length > 0}
          following={Array.isArray(thread.follows) && thread.follows.length > 0}
          poll={thread.poll ? JSON.parse(JSON.stringify(thread.poll)) : null}
        />
      </Suspense>
    </main>
  );
}
