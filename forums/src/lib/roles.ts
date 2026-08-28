export function roleLabel(role: string) {
  const r = role.toLowerCase();
  if (r === "owner" || r === "founder") return "Owner";
  if (r === "admin") return "Administrator";
  if (r === "dev") return "Developer";
  if (r === "mod") return "Moderator";
  if (r === "helper") return "Helper";
  if (r === "vip") return "VIP";
  return "Member";
}

export function roleColor(role: string) {
  const r = role.toLowerCase();
  if (["owner", "founder", "admin"].includes(r)) return "var(--gold-light)";
  if (["mod", "helper"].includes(r)) return "#4ade80";
  if (r === "dev") return "#c084fc";
  if (r === "vip") return "#67e8f9";
  return "#93c5fd";
}
