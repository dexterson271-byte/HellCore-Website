import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function ConversationPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/");
  const { id } = await params;
  const conversationId = Number(id);
  const part = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: session.forumUserId } },
  });
  if (!part) notFound();
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      participants: { include: { user: true } },
      messages: { orderBy: { createdAt: "asc" }, include: { author: true } },
    },
  });
  if (!conversation) notFound();

  return (
    <div className="container" style={{ display: "grid", gap: 12, maxWidth: 800 }}>
      <h1 style={{ margin: 0 }}>
        {conversation.subject || conversation.participants.map((p) => p.user.username).join(", ")}
      </h1>
      <div className="card" style={{ padding: "1rem", display: "grid", gap: 12 }}>
        {conversation.messages.map((m) => (
          <div key={m.id}>
            <div style={{ fontWeight: 700 }}>{m.author.username}</div>
            <div>{m.body}</div>
            <div className="muted" style={{ fontSize: "0.75rem" }}>{m.createdAt.toLocaleString()}</div>
          </div>
        ))}
      </div>
      <form
        action={async (fd) => {
          "use server";
          const body = String(fd.get("body") || "").trim();
          if (!body) return;
          const s = await getSession();
          if (!s) return;
          await prisma.conversationMessage.create({
            data: { conversationId, authorId: s.forumUserId, body },
          });
          await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
        }}
        style={{ display: "grid", gap: 8 }}
      >
        <textarea className="input" name="body" rows={3} required placeholder="Write a message…" />
        <button className="btn" type="submit">Send</button>
      </form>
    </div>
  );
}
