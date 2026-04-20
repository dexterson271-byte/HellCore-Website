"""Patch: Replace checkStatus + loadPlayerChart with mcsrvstat.us direct API polling."""
import re

FILE = r'templates/index.html'

NEW_STATUS_CODE = r"""    // ════════════════════════════════════════════════════
    // SERVER STATUS — mcsrvstat.us v3 API (live, client-side)
    // ════════════════════════════════════════════════════
    const MC_SERVER = 'mc.hellcore.com';
    const MC_API    = `https://api.mcsrvstat.us/3/${MC_SERVER}`;

    // Rolling 60-minute history stored in memory
    const playerHistory = { labels: [], counts: [] };
    let   pChart = null;

    async function checkStatus() {
      try {
        const res = await fetch(MC_API);
        const d   = await res.json();

        // --- Navbar dot + text ---
        const dot = I('DOT'), txt = I('STXT');
        const online  = d.online || false;
        const players = d.players?.online || 0;
        const maxPlayers = d.players?.max  || 0;

        if (online) {
          dot.className = 'dot ON';
          txt.textContent = `${players}/${maxPlayers} online`;
        } else {
          dot.className = 'dot';
          txt.textContent = 'Offline';
        }

        renderStatus(d);
        loadEvents();

        // --- Append data point to rolling history ---
        const now = new Date();
        const label = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');
        playerHistory.labels.push(label);
        playerHistory.counts.push(players);
        // Keep only last 60 data points
        if (playerHistory.labels.length > 60) {
          playerHistory.labels.shift();
          playerHistory.counts.shift();
        }

        updatePlayerChart();

      } catch (e) {
        const dot = I('DOT');
        if (dot) dot.className = 'dot';
      }
    }

    function updatePlayerChart() {
      const canvas = document.getElementById('playerChart');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');

      if (pChart) {
        // Live update — push new data without full re-render
        pChart.data.labels = [...playerHistory.labels];
        pChart.data.datasets[0].data = [...playerHistory.counts];
        pChart.update('none'); // 'none' = no animation for smooth live feel
        return;
      }

      // First render
      pChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: playerHistory.labels,
          datasets: [{
            label: 'Players Online',
            data: playerHistory.counts,
            borderColor: 'rgba(255,81,47,1)',
            backgroundColor: 'rgba(255,81,47,0.08)',
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 3,
            pointBackgroundColor: 'rgba(255,81,47,1)',
            pointHoverRadius: 5
          }]
        },
        options: {
          responsive: true,
          animation: { duration: 400 },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.parsed.y} players`
              }
            }
          },
          scales: {
            x: {
              display: true,
              grid: { display: false },
              ticks: { color: '#71717a', maxTicksLimit: 10, font: { size: 11 } }
            },
            y: {
              display: true,
              beginAtZero: true,
              grid: { color: 'rgba(255,255,255,0.05)' },
              ticks: { color: '#71717a', precision: 0, font: { size: 11 } }
            }
          }
        }
      });
    }"""

with open(FILE, 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern to match from "async function checkStatus()" through the closing of loadPlayerChart
pattern = r'(    async function checkStatus\(\) \{.*?^\    \}\n\n    // ════.*?SKIN VIEWER)'
match = re.search(pattern, content, re.DOTALL | re.MULTILINE)

if match:
    print(f"Found block at chars {match.start()}-{match.end()}")
    replacement = NEW_STATUS_CODE + '\n\n    // ════════════════════════════════════════════════════\n    // SKIN VIEWER — All proxied through Flask, no crafatar\n    // ════════════════════════════════════════════════════'
    content = content[:match.start()] + replacement + content[match.end() - len('    // ════════════════════════════════════════════════════\n    // SKIN VIEWER — All proxied through Flask, no crafatar\n    // ════════════════════════════════════════════════════'):]
    with open(FILE, 'w', encoding='utf-8') as f:
        f.write(content)
    print("[OK] Status + Chart code replaced successfully.")
else:
    print("[ERR] Pattern not found — trying simpler approach...")
    # Simpler: replace just the two functions individually
    # checkStatus
    cs_pat = r'    async function checkStatus\(\) \{.*?\n    \}'
    cs_match = re.search(cs_pat, content, re.DOTALL)
    if cs_match:
        print(f"  Found checkStatus at {cs_match.start()}-{cs_match.end()}")
    # loadPlayerChart
    lpc_pat = r'    let pChart = null;\n    async function loadPlayerChart\(\) \{.*?\n    \}'
    lpc_match = re.search(lpc_pat, content, re.DOTALL)
    if lpc_match:
        print(f"  Found loadPlayerChart at {lpc_match.start()}-{lpc_match.end()}")
    print("Manual intervention needed.")
