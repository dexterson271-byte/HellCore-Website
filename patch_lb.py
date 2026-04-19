"""Patch: Update Leaderboard UI for Bedwars1058 stats"""
import re

FILE = r'templates/index.html'

NEW_HTML = r"""        <!-- LEADERBOARD -->
        <div id="T-LB" style="display:none">
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
            <select id="LB-M" class="inp" style="width:auto" onchange="updateLBS(); loadLB()">
              <option value="bedwars">Bedwars</option>
              <option value="skywars">SkyWars</option>
            </select>
            <select id="LB-S" class="inp" style="width:auto" onchange="loadLB()">
              <option value="wins">Wins</option>
              <option value="kills">Kills</option>
              <option value="deaths">Deaths</option>
              <option value="final_kills" class="bw-only">Final Kills</option>
              <option value="beds_destroyed" class="bw-only">Beds Broken</option>
              <option value="coins">Coins</option>
            </select>
          </div>
          <div class="p">
            <div id="LB-H" class="lh" style="display:grid;grid-template-columns:30px 1fr 60px 60px 60px 60px 80px;font-size:0.8rem;color:var(--tx2);padding:0 12px 10px;border-bottom:1px solid var(--bd2);margin-bottom:10px">
              <!-- Replaced via JS -->
            </div>
            <div id="LB-R">
              <div class="ld">
                <div class="sp"></div>Loading…
              </div>
            </div>
          </div>
        </div>"""

NEW_JS = r"""    function updateLBS() {
      const isBW = V('LB-M') === 'bedwars';
      document.querySelectorAll('.bw-only').forEach(el => el.style.display = isBW ? 'block' : 'none');
      if (!isBW && ['final_kills', 'beds_destroyed'].includes(V('LB-S'))) {
        I('LB-S').value = 'wins';
      }
    }

    async function loadLB() {
      const mode = V('LB-M'), stat = V('LB-S');
      const el = I('LB-R');
      const head = I('LB-H');
      el.innerHTML = '<div class="ld"><div class="sp"></div>Loading...</div>';
      try {
        const d = await API(`/api/lb/${mode}?stat=${stat}`);
        if (!d.length) { el.innerHTML = '<div class="empty">No data yet.</div>'; return; }
        
        const isBW = d[0].is_bw1058;

        if (isBW) {
          head.style.gridTemplateColumns = '30px 1fr 50px 50px 70px 70px 80px';
          head.innerHTML = `<span>#</span><span>Player</span><span>Wins</span><span>Kills</span><span>F. Kills</span><span>Beds</span><span>Rank</span>`;
        } else {
          head.style.gridTemplateColumns = '30px 1fr 60px 60px 60px 60px 80px';
          head.innerHTML = `<span>#</span><span>Player</span><span>Wins</span><span>Kills</span><span>Deaths</span><span>K/D</span><span>Rank</span>`;
        }

        el.innerHTML = d.map((p, i) => {
          let cols = '';
          if (isBW) {
            cols = `<span style="text-align:right">${p.wins || 0}</span><span style="text-align:right">${p.kills || 0}</span><span style="text-align:right;color:#fb923c">${p.final_kills || 0}</span><span style="text-align:right;color:#ef4444">${p.beds_destroyed || 0}</span>`;
          } else {
            const kd = p.deaths > 0 ? (p.kills / p.deaths).toFixed(2) : '∞';
            cols = `<span>${p.wins || 0}</span><span>${p.kills || 0}</span><span>${p.deaths || 0}</span><span>${kd}</span>`;
          }

          return `<div class="lr ${i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : ''}" style="grid-template-columns:${isBW ? '30px 1fr 50px 50px 70px 70px 80px' : '30px 1fr 60px 60px 60px 60px 80px'}">
            <span>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
            <span style="display:flex;align-items:center;gap:6px">
              <img src="/api/skin/head/${enc(p.mc_username || p.username)}/22" width="22" height="22" style="image-rendering:pixelated;border-radius:3px" onerror="this.style.display='none'">
              ${esc(p.username)}
            </span>
            ${cols}
            <span style="text-align:right">${p.rank_name ? `<span class="rb rb-${rbcls(p.rank_name)}">${p.rank_name.toUpperCase()}</span>` : '-'}</span>
          </div>`;
        }).join('');
      } catch (e) { el.innerHTML = '<div class="empty">Could not load.</div>'; }
    }"""

with open(FILE, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace HTML
pat_html = r'        <!-- LEADERBOARD -->\n        <div id="T-LB".*?</div>\n          </div>\n        </div>'
match_html = re.search(pat_html, content, re.DOTALL)
if match_html:
    content = content[:match_html.start()] + NEW_HTML + content[match_html.end():]

# Replace JS
pat_js = r'    async function loadLB\(\).*?\n    \}'
match_js = re.search(pat_js, content, re.DOTALL)
if match_js:
    content = content[:match_js.start()] + NEW_JS + content[match_js.end():]

# Ensure we call updateLBS() on init
if "loadShowcase();" in content and "updateLBS();" not in content:
    content = content.replace("loadShowcase();", "loadShowcase();\n      updateLBS();")

with open(FILE, 'w', encoding='utf-8') as f:
    f.write(content)
print("Leaderboard patched.")
