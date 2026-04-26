import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5000"
});

export async function fetchPlayer(username) {
  const response = await api.get(`/api/player/${encodeURIComponent(username)}`);
  return response.data;
}

export async function comparePlayers(player1, player2) {
  const response = await api.get("/api/compare", {
    params: { player1, player2 }
  });
  return response.data;
}

export async function fetchLeaderboard(sortBy = "won", limit = 20) {
  const response = await api.get("/api/leaderboard", {
    params: {
      sort_by: sortBy,
      limit
    }
  });
  return response.data;
}

export async function searchPlayers(query, limit = 5, signal) {
  const response = await api.get("/api/search", {
    params: {
      q: query,
      limit
    },
    signal
  });
  return response.data;
}

export async function fetchSiteStats() {
  const response = await api.get("/api/site-stats");
  return response.data;
}

export async function registerVisit() {
  const response = await api.post("/api/visit");
  return response.data;
}

export default api;
