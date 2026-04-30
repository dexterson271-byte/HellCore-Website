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
import { motion } from "framer-motion";
import { ArrowRight, Swords, TrendingDown, TrendingUp } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import PlayerSearchForm from "../components/PlayerSearchForm";
import { comparePlayers } from "../lib/api";
import { avatarUrl, formatNumber, formatRatio, rankStyle } from "../lib/formatters";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const metrics = [
  { key: "won",                label: "Wins" },
  { key: "w_l",                label: "W/L Ratio",       ratio: true },
  { key: "kills",              label: "Kills" },
  { key: "k_d",               label: "K/D Ratio",        ratio: true },
  { key: "final_kills",        label: "Final Kills" },
  { key: "final_k_d",         label: "Final K/D",        ratio: true },
  { key: "current_win_streak", label: "Current Win Streak" },
  { key: "beds_destroyed",     label: "Beds Destroyed" }
];

const itemVariants = {
  hidden: { opacity: 0, y: 18 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } },
};
const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

/* ── small player card ── */
function PlayerSummary({ player, index }) {
  const accent = index === 0
    ? { text: "text-cyan-300", border: "border-cyan-300/20", bg: "bg-cyan-400/10", glow: "shadow-[0_0_30px_rgba(34,211,238,0.08)]" }
    : { text: "text-violet-300", border: "border-violet-300/20", bg: "bg-violet-400/10", glow: "shadow-[0_0_30px_rgba(139,92,246,0.08)]" };

  const quickStats = [
    ["Stars",  formatNumber(player.stars)],
    ["Wins",   formatNumber(player.won)],
    ["K/D",    formatRatio(player.k_d)],
    ["FKDR",   formatRatio(player.final_k_d)],
    ["Beds",   formatNumber(player.beds_destroyed)],
    ["W/L",    formatRatio(player.w_l)],
  ];

  return (
    <motion.div variants={itemVariants} className={`glass-panel overflow-hidden ${accent.glow}`}>
      {/* top bar */}
      <div className={`h-[3px] w-full bg-gradient-to-r ${index === 0 ? "from-cyan-400 to-cyan-300/30" : "from-violet-500 to-violet-300/30"}`} />

      <div className="p-6">
        {/* header */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <img
              src={avatarUrl(player.username, 80)}
              alt={player.username}
              className={`h-16 w-16 rounded-2xl ring-2 ${index === 0 ? "ring-cyan-400/25" : "ring-violet-400/25"}`}
            />
            <div className={`absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${index === 0 ? "bg-cyan-400 text-slate-950" : "bg-violet-500 text-white"}`}>
              P{index + 1}
            </div>
          </div>
          <div>
            <div className={`text-[10px] uppercase tracking-[0.25em] ${accent.text}/70`}>Player {index + 1}</div>
            <h2 className="text-2xl font-black text-white leading-tight">{player.username}</h2>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {player.custom_rank && (
                <span
                  className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.15em]"
                  style={rankStyle(player.custom_rank_color)}
                >
                  {player.custom_rank}
                </span>
              )}
              <span
                className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.15em]"
                style={rankStyle(player.level_color)}
              >
                {formatNumber(player.stars)}★
              </span>
            </div>
          </div>
        </div>

        {/* quick stats grid */}
        <div className="mt-5 grid grid-cols-3 gap-2">
          {quickStats.map(([label, value]) => (
            <div key={label} className={`rounded-2xl border ${accent.border} ${accent.bg} p-3 text-center`}>
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
              <div className={`mt-1.5 text-lg font-black ${accent.text}`}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/* ── metric row ── */
function MetricRow({ metric, p1, p2 }) {
  const v1 = p1[metric.key];
  const v2 = p2[metric.key];
  const max = Math.max(v1, v2, 0.001);
  const p1Win = v1 > v2;
  const p2Win = v2 > v1;
  const fmt = (v) => metric.ratio ? formatRatio(v) : formatNumber(v);
  const pct1 = Math.round((v1 / max) * 100);
  const pct2 = Math.round((v2 / max) * 100);

  return (
    <div className="space-y-2 px-6 py-4">
      <div className="flex items-center justify-between gap-3">
        {/* p1 value */}
        <div className="flex items-center gap-1.5">
          {p1Win && <TrendingUp size={13} className="text-emerald-400" />}
          <span className={`text-sm font-black tabular-nums ${p1Win ? "text-emerald-300" : p2Win ? "text-rose-300/70" : "text-white"}`}>
            {fmt(v1)}
          </span>
        </div>

        {/* label */}
        <span className="text-center text-[11px] uppercase tracking-[0.24em] text-slate-500">
          {metric.label}
        </span>

        {/* p2 value */}
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-black tabular-nums ${p2Win ? "text-emerald-300" : p1Win ? "text-rose-300/70" : "text-white"}`}>
            {fmt(v2)}
          </span>
          {p2Win && <TrendingUp size={13} className="text-emerald-400" />}
        </div>
      </div>

      {/* dual progress bars */}
      <div className="grid grid-cols-2 gap-2">
        <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct1}%` }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className={`h-full rounded-full ${p1Win ? "bg-gradient-to-r from-cyan-400 to-emerald-400" : "bg-slate-500/60"}`}
          />
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct2}%` }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className={`ml-auto h-full rounded-full ${p2Win ? "bg-gradient-to-l from-violet-400 to-emerald-400" : "bg-slate-500/60"}`}
          />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════ PAGE ═══════════════════════ */
function Compare() {
  const [searchParams] = useSearchParams();
  const [player1, setPlayer1] = useState(searchParams.get("p1") || "");
  const [player2, setPlayer2] = useState(searchParams.get("p2") || "");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (player1 && player2) handleLookup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLookup(event) {
    if (event) event.preventDefault();
    if (!player1.trim() || !player2.trim()) return;
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
    if (!result) return null;
    return {
      labels: ["Wins", "Kills", "Final Kills", "Beds"],
      datasets: [
        {
          label: result.player1.username,
          data: [result.player1.won, result.player1.kills, result.player1.final_kills, result.player1.beds_destroyed],
          backgroundColor: "rgba(34, 211, 238, 0.6)",
          borderColor: "rgba(34, 211, 238, 0.8)",
          borderWidth: 1,
          borderRadius: 10,
        },
        {
          label: result.player2.username,
          data: [result.player2.won, result.player2.kills, result.player2.final_kills, result.player2.beds_destroyed],
          backgroundColor: "rgba(139, 92, 246, 0.6)",
          borderColor: "rgba(139, 92, 246, 0.8)",
          borderWidth: 1,
          borderRadius: 10,
        },
      ],
    };
  }, [result]);

  /* score summary */
  const score = useMemo(() => {
    if (!result) return null;
    let p1 = 0, p2 = 0;
    metrics.forEach(({ key }) => {
      const v1 = result.player1[key];
      const v2 = result.player2[key];
      if (v1 > v2) p1++;
      else if (v2 > v1) p2++;
    });
    return { p1, p2 };
  }, [result]);

  return (
    <main className="page-shell space-y-8">
      {/* ── Header ── */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="glass-panel relative overflow-hidden p-6 sm:p-8"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(139,92,246,0.12),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(34,211,238,0.10),transparent_50%)]" />
        <div className="relative">
          <div className="mb-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-400/10 px-4 py-2 text-xs uppercase tracking-[0.28em] text-violet-200">
              <Swords size={12} />
              Head-to-head compare
            </div>
            <h1 className="mt-3 text-4xl font-black text-white sm:text-5xl">
              Who wins the matchup?
            </h1>
            <p className="mt-2 text-slate-400">
              Search two McFleet Season 2 usernames and get a side-by-side stat breakdown.
            </p>
          </div>

          {/* dual search */}
          <div className="grid gap-4 lg:grid-cols-[1fr_64px_1fr] lg:items-center">
            <PlayerSearchForm
              value={player1}
              onChange={setPlayer1}
              onSubmit={handleLookup}
              placeholder="First player…"
              buttonLabel="Set"
              compact
            />
            <div className="flex items-center justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-black uppercase tracking-widest text-slate-300">
                VS
              </div>
            </div>
            <PlayerSearchForm
              value={player2}
              onChange={setPlayer2}
              onSubmit={handleLookup}
              placeholder="Second player…"
              buttonLabel="Compare"
              compact
            />
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}
        </div>
      </motion.section>

      {/* ── Loading ── */}
      {loading && <div className="page-center">Comparing player stats…</div>}

      {/* ── Results ── */}
      {result && !loading && (
        <>
          {/* Score banner */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45 }}
            className="glass-panel flex items-center justify-between gap-4 px-6 py-5"
          >
            <div className="text-center">
              <div className="text-4xl font-black text-cyan-300">{score.p1}</div>
              <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">categories won</div>
              <div className="mt-0.5 font-semibold text-white">{result.player1.username}</div>
            </div>
            <div className="flex-1 text-center text-xs uppercase tracking-[0.3em] text-slate-500">
              Overall score
            </div>
            <div className="text-center">
              <div className="text-4xl font-black text-violet-300">{score.p2}</div>
              <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">categories won</div>
              <div className="mt-0.5 font-semibold text-white">{result.player2.username}</div>
            </div>
          </motion.div>

          {/* Player summary cards */}
          <motion.section
            initial="hidden"
            animate="show"
            variants={containerVariants}
            className="grid gap-6 lg:grid-cols-2"
          >
            <PlayerSummary player={result.player1} index={0} />
            <PlayerSummary player={result.player2} index={1} />
          </motion.section>

          {/* Metric table + chart */}
          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            {/* metric rows */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="glass-panel overflow-hidden"
            >
              <div className="grid grid-cols-[1fr_auto_1fr] border-b border-white/8 px-6 py-4">
                <div className="text-sm font-bold text-cyan-300">{result.player1.username}</div>
                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Metric</div>
                <div className="text-right text-sm font-bold text-violet-300">{result.player2.username}</div>
              </div>
              <div className="divide-y divide-white/5">
                {metrics.map((metric) => (
                  <MetricRow key={metric.key} metric={metric} p1={result.player1} p2={result.player2} />
                ))}
              </div>
            </motion.div>

            {/* chart */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.18 }}
              className="glass-panel p-6"
            >
              <h2 className="mb-5 text-xl font-bold text-white">Visual comparison</h2>
              <div className="h-[340px]">
                <Bar
                  data={chartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        labels: { color: "#cbd5e1", font: { family: "Inter" } }
                      },
                      tooltip: {
                        backgroundColor: "rgba(2, 6, 23, 0.9)",
                        borderColor: "rgba(255,255,255,0.1)",
                        borderWidth: 1,
                        titleColor: "#e2e8f0",
                        bodyColor: "#94a3b8",
                      }
                    },
                    scales: {
                      x: {
                        ticks: { color: "#94a3b8", font: { family: "Inter" } },
                        grid: { color: "rgba(148,163,184,0.06)" },
                        border: { color: "rgba(148,163,184,0.1)" }
                      },
                      y: {
                        ticks: { color: "#94a3b8", font: { family: "Inter" } },
                        grid: { color: "rgba(148,163,184,0.06)" },
                        border: { color: "rgba(148,163,184,0.1)" }
                      }
                    }
                  }}
                />
              </div>
            </motion.div>
          </section>
        </>
      )}
    </main>
  );
}

export default Compare;
