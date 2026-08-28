export function ForumStatsFooter({
  members,
  threads,
  posts,
  online,
}: {
  members: number;
  threads: number;
  posts: number;
  online: number;
}) {
  const items = [
    { icon: "⚔️", num: members.toLocaleString(), label: "Total Players" },
    { icon: "💀", num: threads.toLocaleString(), label: "Total Threads" },
    { icon: "🧪", num: posts.toLocaleString(), label: "Total Messages" },
    { icon: "🛡️", num: online.toLocaleString(), label: "Players Online" },
  ];

  return (
    <div className="hc-stats-footer">
      {items.map((s) => (
        <div key={s.label} className="hc-stat-box">
          <span className="hc-stat-icon" aria-hidden>{s.icon}</span>
          <div>
            <div className="hc-stat-num">{s.num}</div>
            <div className="hc-stat-label">{s.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
