import Pusher from "pusher";

let pusher: Pusher | null = null;

export function getPusher() {
  if (pusher) return pusher;
  const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } = process.env;
  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET) return null;
  pusher = new Pusher({
    appId: PUSHER_APP_ID,
    key: PUSHER_KEY,
    secret: PUSHER_SECRET,
    cluster: PUSHER_CLUSTER || "ap1",
    useTLS: true,
  });
  return pusher;
}

export async function publishThreadEvent(threadId: number, event: string, payload: unknown) {
  const client = getPusher();
  if (!client) return;
  try {
    await client.trigger(`thread-${threadId}`, event, payload);
  } catch (e) {
    console.error("[pusher]", e);
  }
}

export async function publishUserEvent(userId: number, event: string, payload: unknown) {
  const client = getPusher();
  if (!client) return;
  try {
    await client.trigger(`user-${userId}`, event, payload);
  } catch (e) {
    console.error("[pusher]", e);
  }
}
