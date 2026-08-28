import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isMod, isStaff } from "@/lib/types";
import { formatPostDate } from "@/lib/thread-ui";
import { ThreadClient } from "./ThreadClient";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string; slug: string }> };

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

  return (
    <main className="thread-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="thread-crumb">
        <Link href="/">Home</Link>
        <span>›</span>
        <Link href="/forums">Forums</Link>
        <span>›</span>
        {thread.category.group && (
          <>
            <span>{thread.category.group.name}</span>
            <span>›</span>
          </>
        )}
        <Link href={`/c/${thread.category.slug}`}>{thread.category.name}</Link>
        <span>›</span>
      </nav>

      <header className="thread-header">
        <div className="thread-states">
          {thread.isPinned && <span className="tag">Pinned</span>}
          {thread.isLocked && <span className="tag">Locked</span>}
          {thread.isSolved && <span className="tag solved">Solved</span>}
          {thread.isFeatured && <span className="tag">Featured</span>}
        </div>
        <h1>{thread.title}</h1>
        <p className="thread-meta">
          <Link href={`/u/${thread.author.username}`}>{thread.author.username}</Link>
          <span>·</span>
          <time dateTime={thread.createdAt.toISOString()}>{formatPostDate(thread.createdAt.toISOString())}</time>
          <span>·</span>
          <span>{thread.views} views</span>
          <span>·</span>
          <span>{thread.replyCount} replies</span>
        </p>
      </header>

      <div className="thread-frame">
        <ThreadClient
          threadId={thread.id}
          slug={slug || thread.slug}
          initialPosts={JSON.parse(JSON.stringify(posts))}
          locked={thread.isLocked}
          canModerate={isMod(session?.role)}
          isAuthor={session?.forumUserId === thread.authorId}
          bookmarked={Array.isArray(thread.bookmarks) && thread.bookmarks.length > 0}
          following={Array.isArray(thread.follows) && thread.follows.length > 0}
          poll={thread.poll ? JSON.parse(JSON.stringify(thread.poll)) : null}
        />
      </div>
    </main>
  );
}
