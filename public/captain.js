const state = { public: null, team: null };
const $ = (selector) => document.querySelector(selector);

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.error || "Something went wrong.");
  return data;
}

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("hellcore_captain") || ""}` };
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function renderTeamSelect() {
  const select = $("#captainTeamSelect");
  select.innerHTML = state.public.teams.length
    ? state.public.teams.map((team) => `<option value="${team.id}">${escapeHtml(team.name)}</option>`).join("")
    : `<option value="">No teams registered</option>`;
}

function renderCaptainPanel() {
  const team = state.team;
  if (!team) return;
  $("#captainTeamName").textContent = team.name;
  $("#captainPlayers").innerHTML = team.players
    .map((player, index) => {
      const n = index + 1;
      return `
      <article class="admin-team">
        <h3>${escapeHtml(player.minecraft)}${player.id && team.captainPlayerId && player.id === team.captainPlayerId ? ' <span class="role-badge">Captain</span>' : ""}</h3>
        <input type="hidden" name="playerId${n}" value="${escapeHtml(player.id)}">
        <label>Minecraft username<input name="minecraft${n}" value="${escapeHtml(player.minecraft)}" maxlength="40" required></label>
        <label>Discord user ID<input name="discordId${n}" value="${escapeHtml(player.discordId)}" inputmode="numeric" pattern="\\d{15,25}" maxlength="25" required></label>
        <div class="admin-team-actions">
          ${
            player.id !== team.captainPlayerId
              ? `<button class="button ghost" data-promote="${player.id}" type="button">Make Captain</button>
                 <button class="button ghost" data-kick="${player.id}" type="button">Kick</button>`
              : `<span class="muted">Current captain</span>`
          }
        </div>
      </article>
    `;
    })
    .join("");
  $("#captainAddPlayer").classList.toggle("hidden", team.players.length >= 4);

  $("#captainPlayers").querySelectorAll("[data-promote]").forEach((button) => {
    button.addEventListener("click", async () => saveTeam(team.players, button.dataset.promote));
  });
  $("#captainPlayers").querySelectorAll("[data-kick]").forEach((button) => {
    button.addEventListener("click", async () => {
      const players = team.players.filter((player) => player.id !== button.dataset.kick);
      await saveTeam(players, team.captainPlayerId);
    });
  });
}

async function saveTeam(players, captainPlayerId) {
  $("#captainMessage").textContent = "Saving...";
  try {
    const cleanPlayers = Array.from(players || []).filter((player) => player.minecraft || player.discordId);
    state.team = await api("/api/captain/team", {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ players: cleanPlayers, captainPlayerId })
    });
    $("#captainMessage").textContent = "Team updated.";
    renderCaptainPanel();
  } catch (error) {
    $("#captainMessage").textContent = error.message;
  }
}

async function loadPublicState() {
  state.public = await api("/api/state");
  renderTeamSelect();
}

async function restoreCaptain() {
  if (!localStorage.getItem("hellcore_captain")) return;
  try {
    state.team = await api("/api/captain/team", { headers: authHeaders() });
    $("#captainLogin").classList.add("hidden");
    $("#captainPanel").classList.remove("hidden");
    renderCaptainPanel();
  } catch {
    localStorage.removeItem("hellcore_captain");
  }
}

$("#captainLogin").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  try {
    const result = await api("/api/captain/login", {
      method: "POST",
      body: JSON.stringify({ teamId: data.get("teamId"), captainCode: data.get("captainCode") })
    });
    localStorage.setItem("hellcore_captain", result.token);
    state.team = result.team;
    $("#captainLogin").classList.add("hidden");
    $("#captainPanel").classList.remove("hidden");
    renderCaptainPanel();
  } catch (error) {
    $("#captainLoginMessage").textContent = error.message;
  }
});

$("#captainAddPlayer").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  if (state.team.players.length >= 4) return;
  const players = [
    ...state.team.players,
    { minecraft: data.get("minecraft"), discordId: data.get("discordId") }
  ];
  await saveTeam(players, state.team.captainPlayerId);
  event.currentTarget.reset();
});

$("#captainEditPlayers").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const players = state.team.players.map((player, index) => {
    const n = index + 1;
    return {
      id: data.get(`playerId${n}`) || player.id,
      minecraft: data.get(`minecraft${n}`),
      discordId: data.get(`discordId${n}`)
    };
  });
  await saveTeam(players, state.team.captainPlayerId);
});

$("#captainLogout").addEventListener("click", () => {
  localStorage.removeItem("hellcore_captain");
  state.team = null;
  $("#captainLogin").classList.remove("hidden");
  $("#captainPanel").classList.add("hidden");
});

document.querySelectorAll(".tabs a").forEach((link) => {
  if (link.getAttribute("href") === window.location.pathname) link.classList.add("active");
});

loadPublicState().then(restoreCaptain);
