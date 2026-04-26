export function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value ?? 0);
}

export function formatRatio(value) {
  return Number(value ?? 0).toFixed(2);
}

export function formatUpdated(value) {
  if (!value) {
    return "Unknown";
  }

  return new Date(value).toLocaleString();
}

export function avatarUrl(username, size = 100) {
  return `https://mc-heads.net/avatar/${username}/${size}`;
}

export function bodyUrl(username) {
  return `https://nmsr.nickac.dev/fullbody/${username}`;
}

export function rankStyle(color) {
  if (!color) {
    return {
      borderColor: "rgba(255,255,255,0.08)",
      backgroundColor: "rgba(255,255,255,0.04)",
      color: "#e2e8f0"
    };
  }

  return {
    borderColor: color,
    backgroundColor: `${color}22`,
    color
  };
}
