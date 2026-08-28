export function avatarUrl(username: string, mcUsername?: string | null, size = 48) {
  const name = (mcUsername || username || "steve").trim();
  return `https://minotar.net/avatar/${encodeURIComponent(name)}/${size}.png`;
}
