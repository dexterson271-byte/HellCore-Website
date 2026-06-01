const state = { data: null };
let captchaToken = "";

const $ = (selector) => document.querySelector(selector);

function playerFields(container) {
  container.innerHTML = Array.from({ length: 4 }, (_, index) => {
    const n = index + 1;
    return `
      <div class="player-fieldset">
        <h3>Player ${n}</h3>
        <label>Minecraft username<input name="minecraft${n}" required maxlength="40" autocomplete="off"></label>
        <label>Discord user ID<input name="discordId${n}" required inputmode="numeric" pattern="\\d{15,25}" maxlength="25"></label>
      </div>
    `;
  }).join("");
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

async function loadCaptcha() {
  const target = $("#captchaQuestion");
  if (!target) return;
  target.textContent = "Loading...";
  const captcha = await api("/api/captcha");
  captchaToken = captcha.token;
  target.textContent = captcha.question;
}

function discordLabel(player) {
  const discord = player.discord;
  if (discord?.status === "verified") return escapeHtml(discord.username || discord.handle || "Verified");
  if (discord?.status === "unconfigured") return "ID saved";
  return "Not verified";
}

function skinBust(username) {
  return `https://nmsr.nickac.dev/bust/${encodeURIComponent(username || "Steve")}`;
}

function renderTeams() {
  const grid = $("#teamsGrid");
  if (!grid) return;
  if (!state.data.teams.length) {
    grid.innerHTML = `<p class="muted">No teams registered yet.</p>`;
    return;
  }
  grid.innerHTML = state.data.teams
    .map(
      (team, index) => `
        <article class="team-card reveal" style="animation-delay:${index * 45}ms">
          <h3>${escapeHtml(team.name)}</h3>
          ${team.players
            .map(
              (player) => `
              <div class="player-row member-card">
                <div class="member-skin">
                  <img src="${skinBust(player.minecraft)}" alt="${escapeHtml(player.minecraft)} Minecraft skin" loading="lazy" onerror="this.style.display='none'">
                </div>
                <div class="member-main">
                  <strong>${escapeHtml(player.minecraft)}${player.id && team.captainPlayerId && player.id === team.captainPlayerId ? ' <span class="role-badge">Captain</span>' : ""}</strong>
                  <span>Minecraft username</span>
                  <div class="member-discord">
                    <span>Discord username</span>
                    <strong>${discordLabel(player)}</strong>
                  </div>
                </div>
              </div>
            `
            )
            .join("")}
        </article>
      `
    )
    .join("");
}

function renderBracket(target, admin = false) {
  if (!target) return;
  const matches = state.data.bracket.matches || [];
  if (!matches.length) {
    target.innerHTML = `<p class="muted">Bracket will appear once staff generates it.</p>`;
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

  if (admin) {
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
}

function renderMatch(match, admin) {
  const aWon = match.winner && match.teamA?.id === match.winner;
  const bWon = match.winner && match.teamB?.id === match.winner;
  const canPick = admin && match.teamA && match.teamB;
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

function renderEvent() {
  const event = state.data.event;
  if ($("#dateLabel")) $("#dateLabel").textContent = event.dateLabel;
  if ($("#prizeTitle")) $("#prizeTitle").textContent = event.prizeTitle;
  if ($("#prizeBody")) $("#prizeBody").textContent = event.prizeBody;
  if ($("#teamCount")) $("#teamCount").textContent = `${state.data.teams.length}/${event.maxTeams}`;
  if ($("#rulesList")) $("#rulesList").innerHTML = event.rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("");
  const form = $("#registerForm");
  if (!form) return;
  const message = $("#formMessage");
  const full = event.registrationLocked || state.data.teams.length >= event.maxTeams;
  form.querySelector("button").disabled = full;
  if (full) message.textContent = "Registration full.";
}

async function loadState() {
  state.data = await api("/api/state");
  renderEvent();
  renderTeams();
  renderBracket($("#bracketBoard"));
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

const registerForm = $("#registerForm");
if (registerForm) {
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const players = Array.from({ length: 4 }, (_, index) => {
      const n = index + 1;
      return { minecraft: data.get(`minecraft${n}`), discordId: data.get(`discordId${n}`) };
    });
    $("#formMessage").textContent = "Checking Discord IDs...";
    try {
      const created = await api("/api/teams", {
        method: "POST",
        body: JSON.stringify({
          name: data.get("name"),
          players,
          website: data.get("website"),
          captchaAnswer: data.get("captchaAnswer"),
          captchaToken
        })
      });
      form.reset();
      $("#formMessage").innerHTML = `Team registered. Captain code: <strong>${escapeHtml(
        created.captainCode
      )}</strong>. Save it to manage your team.`;
      await loadCaptcha();
      await loadState();
    } catch (error) {
      $("#formMessage").textContent = error.message;
      await loadCaptcha();
    }
  });
}

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("hellcore_admin") || ""}` };
}

if ($("#playersFields")) playerFields($("#playersFields"));
if ($("#captchaQuestion")) loadCaptcha();
if ($("#refreshCaptcha")) {
  $("#refreshCaptcha").addEventListener("click", async () => {
    await loadCaptcha();
    const answer = document.querySelector("[name='captchaAnswer']");
    if (answer) answer.value = "";
  });
}
document.querySelectorAll(".tabs a").forEach((link) => {
  if (link.getAttribute("href") === window.location.pathname) link.classList.add("active");
  if (window.location.pathname === "/" && link.getAttribute("href") === "/") link.classList.add("active");
});
loadState();
