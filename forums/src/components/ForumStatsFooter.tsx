export function ForumStatsFooter({
  members,
  threads,
  posts,
  serversOnline = 4,
}: {
  members: number;
  threads: number;
  posts: number;
  serversOnline?: number;
}) {
  const items = [
    { num: members.toLocaleString(), label: "TOTAL PLAYERS" },
    { num: threads.toLocaleString(), label: "TOTAL THREADS" },
    { num: posts.toLocaleString(), label: "TOTAL MESSAGES" },
    { num: String(serversOnline), label: "SERVERS ONLINE" },
  ];

  return (
    <div className="stats">
      {items.map((s) => (
        <div key={s.label} className="stat">
          <span className="stat-number">{s.num}</span>
          <span className="stat-label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}
