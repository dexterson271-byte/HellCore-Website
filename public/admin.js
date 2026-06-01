const state = { data: null };
const $ = (selector) => document.querySelector(selector);

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("hellcore_admin") || ""}` };
}

async function api(path, options = {}) {
  const { headers = {}, ...rest } = options;
  const response = await fetch(path, {
    ...rest,
    headers: { "Content-Type": "application/json", ...headers }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.error || "Something went wrong.");
  return data;
}

function playerFields(container, players = []) {
  container.innerHTML = Array.from({ length: 4 }, (_, index) => {
    const n = index + 1;
    const player = players[index] || {};
    const playerId = player.id || crypto.randomUUID();
    return `
      <div class="player-fieldset">
        <h3>Player ${n}</h3>
        <input type="hidden" name="playerId${n}" value="${escapeAttr(playerId)}">
        <label>Minecraft username<input name="minecraft${n}" required maxlength="40" value="${escapeAttr(player.minecraft || "")}"></label>
        <label>Discord user ID<input name="discordId${n}" required inputmode="numeric" pattern="\\d{15,25}" maxlength="25" value="${escapeAttr(player.discordId || "")}"></label>
      </div>
    `;
  }).join("");
}

function syncCaptainOptions(selectedId = "") {
  const form = $("#teamForm");
  const options = Array.from({ length: 4 }, (_, index) => {
    const n = index + 1;
    const id = form.elements[`playerId${n}`].value || `slot-${n}`;
    const label = form.elements[`minecraft${n}`].value || `Player ${n}`;
    return `<option value="${escapeAttr(id)}">${escapeHtml(label)}</option>`;
  }).join("");
  $("#captainSelect").innerHTML = options;
  $("#captainSelect").value = selectedId || $("#captainSelect").options[0]?.value || "";
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function discordStatus(player) {
  if (player.discord?.status === "verified") return `verified as ${player.discord.username || player.discord.handle}`;
  if (player.discord?.status === "unconfigured") return "saved, bot token missing";
  return "not verified";
}

function skinBust(username) {
  return `https://nmsr.nickac.dev/bust/${encodeURIComponent(username || "Steve")}`;
}

function renderAdmin() {
  const event = state.data.event;
  const form = $("#eventForm");
  form.elements.title.value = event.title;
  form.elements.dateLabel.value = event.dateLabel;
  form.elements.discordUrl.value = event.discordUrl || "";
  form.elements.prizeTitle.value = event.prizeTitle;
  form.elements.prizeBody.value = event.prizeBody;
  form.elements.rules.value = event.rules.join("\n");
  form.elements.registrationLocked.checked = event.registrationLocked;

  $("#adminTeams").innerHTML = state.data.teams.length
    ? state.data.teams
        .map(
          (team) => `
          <article class="admin-team">
            <h3>${escapeHtml(team.name)}</h3>
            <p class="captain-code">Captain code: <strong>${escapeHtml(team.captainCode || "Missing")}</strong></p>
            ${team.players.map((player) => `
              <div class="player-row member-card compact">
                <div class="member-skin">
                  <img src="${skinBust(player.minecraft)}" alt="${escapeHtml(player.minecraft)} Minecraft skin" loading="lazy" onerror="this.style.display='none'">
                </div>
                <div class="member-main">
                  <strong>${escapeHtml(player.minecraft)}${player.id && team.captainPlayerId && player.id === team.captainPlayerId ? ' <span class="role-badge">Captain</span>' : ""}</strong>
                  <span>${escapeHtml(discordStatus(player))}</span>
                </div>
              </div>
            `).join("")}
            <div class="admin-team-actions">
              <button class="button ghost" data-edit="${team.id}" type="button">Edit</button>
              <button class="button ghost" data-delete="${team.id}" type="button">Delete</button>
            </div>
          </article>
        `
        )
        .join("")
    : `<p class="muted">No teams yet.</p>`;

  $("#adminTeams").querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => openTeamDialog(state.data.teams.find((team) => team.id === button.dataset.edit)));
  });
  $("#adminTeams").querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/admin/teams/${button.dataset.delete}`, { method: "DELETE", headers: authHeaders() });
      await loadState();
    });
  });

  renderBracket($("#adminBracket"), true);
}

function renderBracket(target, admin = false) {
  const matches = state.data.bracket.matches || [];
  if (!matches.length) {
    target.innerHTML = `<p class="muted">Generate the bracket after teams are registered.</p>`;
    return;
  }
  const groups = {};
  for (const match of matches) {
    const key = `${match.bracket} R${match.round}`;
    groups[key] ||= [];
    groups[key].push(match);
  }
  target.innerHTML = Object.entries(groups)
    .map(
      ([title, group]) => `
        <div class="bracket-column">
          <h3>${title}</h3>
          ${group.map((match) => renderMatch(match, admin)).join("")}
        </div>
      `
    )
    .join("");

  target.querySelectorAll("[data-winner]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/admin/bracket/${button.dataset.match}/winner`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ winnerId: button.dataset.winner })
      });
      await loadState();
    });
  });
}

function renderMatch(match) {
  const aWon = match.winner && match.teamA?.id === match.winner;
  const bWon = match.winner && match.teamB?.id === match.winner;
  const canPick = match.teamA && match.teamB;
  return `
    <article class="match-card">
      <div class="match-id"><span>${match.id}</span><span>${match.locked ? "Bye" : match.winner ? "Done" : "Open"}</span></div>
      <div class="match-slot ${aWon ? "winner" : ""}"><strong>${escapeHtml(match.teamA?.name || "TBD")}</strong></div>
      <div class="match-slot ${bWon ? "winner" : ""}"><strong>${escapeHtml(match.teamB?.name || "TBD")}</strong></div>
      ${
        canPick
          ? `<div class="winner-actions">
              <button class="button ghost" data-match="${match.id}" data-winner="${match.teamA.id}" type="button">Winner: ${escapeHtml(match.teamA.name)}</button>
              <button class="button ghost" data-match="${match.id}" data-winner="${match.teamB.id}" type="button">Winner: ${escapeHtml(match.teamB.name)}</button>
            </div>`
          : ""
      }
    </article>
  `;
}

async function loadState() {
  state.data = await api("/api/admin/state", { headers: authHeaders() });
  renderAdmin();
}

function openTeamDialog(team = null) {
  $("#teamDialogTitle").textContent = team ? "Edit Team" : "Add Team";
  const form = $("#teamForm");
  form.elements.id.value = team?.id || "";
  form.elements.teamName.value = team?.name || "";
  playerFields($("#teamPlayersFields"), team?.players || []);
  syncCaptainOptions(team?.captainPlayerId || team?.players?.[0]?.id || "");
  $("#teamPlayersFields").querySelectorAll("input[name^='minecraft']").forEach((input) => {
    input.addEventListener("input", () => syncCaptainOptions($("#captainSelect").value));
  });
  $("#teamDialog").showModal();
}

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: new FormData(event.currentTarget).get("password") })
    });
    localStorage.setItem("hellcore_admin", data.token);
    $("#loginPanel").classList.add("hidden");
    $("#adminPanel").classList.remove("hidden");
    await loadState();
  } catch (error) {
    $("#loginMessage").textContent = error.message;
  }
});

$("#eventForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  await api("/api/admin/event", {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({
      title: form.elements.title.value,
      dateLabel: form.elements.dateLabel.value,
      discordUrl: form.elements.discordUrl.value,
      prizeTitle: form.elements.prizeTitle.value,
      prizeBody: form.elements.prizeBody.value,
      rules: form.elements.rules.value.split("\n").map((line) => line.trim()).filter(Boolean),
      registrationLocked: form.elements.registrationLocked.checked
    })
  });
  await loadState();
});

$("#addTeamButton").addEventListener("click", () => openTeamDialog());

$("#cancelTeam").addEventListener("click", () => $("#teamDialog").close());

$("#teamForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const players = Array.from({ length: 4 }, (_, index) => {
    const n = index + 1;
    return { id: data.get(`playerId${n}`) || undefined, minecraft: data.get(`minecraft${n}`), discordId: data.get(`discordId${n}`) };
  });
  const id = data.get("id");
  await api(id ? `/api/admin/teams/${id}` : "/api/admin/teams", {
    method: id ? "PUT" : "POST",
    headers: authHeaders(),
    body: JSON.stringify({ name: data.get("teamName"), players, captainPlayerId: data.get("captainPlayerId") })
  });
  $("#teamDialog").close();
  await loadState();
});

$("#generateBracket").addEventListener("click", async () => {
  await api("/api/admin/bracket/generate", { method: "POST", headers: authHeaders() });
  await loadState();
});

$("#clearBracket").addEventListener("click", async () => {
  await api("/api/admin/bracket", { method: "DELETE", headers: authHeaders() });
  await loadState();
});

if (localStorage.getItem("hellcore_admin")) {
  $("#loginPanel").classList.add("hidden");
  $("#adminPanel").classList.remove("hidden");
  loadState();
}
