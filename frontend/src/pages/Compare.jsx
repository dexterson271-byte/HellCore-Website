import { useEffect, useMemo, useState } from "react";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { useSearchParams } from "react-router-dom";
import PlayerSearchForm from "../components/PlayerSearchForm";
import { comparePlayers } from "../lib/api";
import { avatarUrl, formatNumber, formatRatio, rankStyle } from "../lib/formatters";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const metrics = [
  { key: "won", label: "Wins" },
  { key: "w_l", label: "W/L Ratio", ratio: true },
  { key: "kills", label: "Kills" },
  { key: "k_d", label: "K/D Ratio", ratio: true },
  { key: "final_kills", label: "Final Kills" },
  { key: "final_k_d", label: "Final K/D", ratio: true },
  { key: "current_win_streak", label: "Current Win Streak" },
  { key: "beds_destroyed", label: "Beds Destroyed" }
];

function Compare() {
  const [searchParams] = useSearchParams();
  const [player1, setPlayer1] = useState(searchParams.get("p1") || "");
  const [player2, setPlayer2] = useState(searchParams.get("p2") || "");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (player1 && player2) {
      handleLookup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLookup(event) {
    if (event) {
      event.preventDefault();
    }

    if (!player1.trim() || !player2.trim()) {
      return;
    }

    try {
      setLoading(true);
      const data = await comparePlayers(player1.trim(), player2.trim());
      setResult(data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Could not compare players");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const chartData = useMemo(() => {
    if (!result) {
      return null;
    }

    return {
      labels: ["Wins", "Kills", "Final Kills", "Beds"],
      datasets: [
        {
          label: result.player1.username,
          data: [
            result.player1.won,
            result.player1.kills,
            result.player1.final_kills,
            result.player1.beds_destroyed
          ],
          backgroundColor: "rgba(34, 211, 238, 0.65)",
          borderRadius: 10
        },
        {
          label: result.player2.username,
          data: [
            result.player2.won,
            result.player2.kills,
            result.player2.final_kills,
            result.player2.beds_destroyed
          ],
          backgroundColor: "rgba(168, 85, 247, 0.65)",
          borderRadius: 10
        }
      ]
    };
  }, [result]);

  return (
    <main className="page-shell space-y-8">
      <section className="glass-panel p-6 sm:p-8">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-[0.28em] text-violet-200/80">Compare players</div>
          <h1 className="mt-2 text-4xl font-black text-white">See who actually wins the matchup.</h1>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
          <PlayerSearchForm
            value={player1}
            onChange={setPlayer1}
            onSubmit={handleLookup}
            placeholder="First username"
            buttonLabel="Set"
            compact
          />
          <div className="mx-auto rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm uppercase tracking-[0.25em] text-slate-400">
            VS
          </div>
          <PlayerSearchForm
            value={player2}
            onChange={setPlayer2}
            onSubmit={handleLookup}
            placeholder="Second username"
            buttonLabel="Compare"
            compact
          />
        </div>

        {error ? <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-rose-200">{error}</div> : null}
      </section>

      {loading ? <div className="page-center">Comparing player stats...</div> : null}

      {result && !loading ? (
        <>
          <section className="grid gap-6 lg:grid-cols-2">
            {[result.player1, result.player2].map((player, index) => (
              <div key={player.username} className="glass-panel p-6">
                <div className="flex items-center gap-4">
                  <img src={avatarUrl(player.username, 80)} alt={player.username} className="h-16 w-16 rounded-2xl" />
                  <div>
                    <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Player {index + 1}</div>
                    <h2 className="text-3xl font-bold text-white">{player.username}</h2>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {player.custom_rank ? (
                        <span
                          className="rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em]"
                          style={rankStyle(player.custom_rank_color)}
                        >
                          {player.custom_rank}
                        </span>
                      ) : null}
                      <span
                        className="rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em]"
                        style={rankStyle(player.level_color)}
                      >
                        {formatNumber(player.stars)} Stars
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  {[
                    ["Stars", formatNumber(player.stars)],
                    ["Wins", formatNumber(player.won)],
                    ["K/D", formatRatio(player.k_d)],
                    ["FKDR", formatRatio(player.final_k_d)],
                    ["Beds", formatNumber(player.beds_destroyed)]
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</div>
                      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="glass-panel overflow-hidden">
              <div className="border-b border-white/10 px-6 py-5">
                <h2 className="text-2xl font-bold text-white">Metric comparison</h2>
              </div>
              <div className="divide-y divide-white/5">
                {metrics.map((metric) => {
                  const firstValue = result.player1[metric.key];
                  const secondValue = result.player2[metric.key];
                  const maxValue = Math.max(firstValue, secondValue, 1);
                  const p1Better = firstValue > secondValue;
                  const p2Better = secondValue > firstValue;

                  return (
                    <div key={metric.key} className="space-y-3 px-6 py-5">
                      <div className="flex items-center justify-between gap-4">
                        <div className={`font-semibold ${p1Better ? "text-emerald-300" : p2Better ? "text-rose-300" : "text-white"}`}>
                          {metric.ratio ? formatRatio(firstValue) : formatNumber(firstValue)}
                        </div>
                        <div className="text-xs uppercase tracking-[0.26em] text-slate-500">{metric.label}</div>
                        <div className={`font-semibold ${p2Better ? "text-emerald-300" : p1Better ? "text-rose-300" : "text-white"}`}>
                          {metric.ratio ? formatRatio(secondValue) : formatNumber(secondValue)}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="h-2 overflow-hidden rounded-full bg-white/5">
                          <div
                            className={`h-full rounded-full ${p1Better ? "bg-emerald-300" : "bg-slate-400"}`}
                            style={{ width: `${(firstValue / maxValue) * 100}%` }}
                          />
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/5">
                          <div
                            className={`ml-auto h-full rounded-full ${p2Better ? "bg-emerald-300" : "bg-slate-400"}`}
                            style={{ width: `${(secondValue / maxValue) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="glass-panel p-6">
              <h2 className="text-2xl font-bold text-white">Visual comparison</h2>
              <div className="mt-6 h-[340px]">
                <Bar
                  data={chartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        labels: {
                          color: "#cbd5e1"
                        }
                      }
                    },
                    scales: {
                      x: {
                        ticks: { color: "#94a3b8" },
                        grid: { color: "rgba(148,163,184,0.08)" }
                      },
                      y: {
                        ticks: { color: "#94a3b8" },
                        grid: { color: "rgba(148,163,184,0.08)" }
                      }
                    }
                  }}
                />
              </div>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}

export default Compare;
