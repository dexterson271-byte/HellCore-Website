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
  if (["owner", "founder", "admin"].includes(r)) return "var(--hc-red-bright)";
  if (["mod", "helper"].includes(r)) return "#ff8844";
  if (r === "dev") return "#c084fc";
  if (r === "vip") return "#ffaa44";
  return "#e8c4c4";
}
