import { useEffect, useMemo, useState } from "react";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { motion } from "framer-motion";
import { Swords, TrendingUp } from "lucide-react";
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
  { key: "beds_destroyed", label: "Beds Destroyed" },
];

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};
const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

function PlayerSummary({ player, index }) {
  const accent =
    index === 0
      ? { text: "text-[var(--accent)]", border: "border-[rgba(200,245,66,0.25)]", bg: "bg-[rgba(200,245,66,0.08)]" }
      : { text: "text-[var(--danger)]", border: "border-[rgba(255,77,58,0.25)]", bg: "bg-[rgba(255,77,58,0.08)]" };

  const quickStats = [
    ["Stars", formatNumber(player.stars)],
    ["Wins", formatNumber(player.won)],
    ["K/D", formatRatio(player.k_d)],
    ["FKDR", formatRatio(player.final_k_d)],
    ["Beds", formatNumber(player.beds_destroyed)],
    ["W/L", formatRatio(player.w_l)],
  ];

  return (
    <motion.div variants={itemVariants} className="panel panel-static overflow-hidden">
      <div className={`h-[3px] w-full ${index === 0 ? "bg-[var(--accent)]" : "bg-[var(--danger)]"}`} />

      <div className="p-6">
        <div className="flex items-center gap-4">
          <div className="relative">
            <img
              src={avatarUrl(player.username, 80)}
              alt={player.username}
              className="h-14 w-14 rounded-[7px] border border-[var(--line)]"
            />
            <div
              className={`absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-[4px] text-[10px] font-black ${
                index === 0
                  ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                  : "bg-[var(--danger)] text-white"
              }`}
            >
              {index + 1}
            </div>
          </div>
          <div>
            <div className={`text-[10px] uppercase tracking-[0.22em] ${accent.text}`}>
              Player {index + 1}
            </div>
            <h2 className="font-display text-3xl font-extrabold leading-tight text-[var(--text)]">
              {player.username}
            </h2>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {player.custom_rank && (
                <span
                  className="rounded-[4px] border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em]"
                  style={rankStyle(player.custom_rank_color)}
                >
                  {player.custom_rank}
                </span>
              )}
              <span
                className="rounded-[4px] border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em]"
                style={rankStyle(player.level_color)}
              >
                {formatNumber(player.stars)}★
              </span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          {quickStats.map(([label, value]) => (
            <div
              key={label}
              className={`rounded-[6px] border ${accent.border} ${accent.bg} p-3 text-center`}
            >
              <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-faint)]">
                {label}
              </div>
              <div className={`font-mono-stat mt-1.5 text-lg font-bold ${accent.text}`}>
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function MetricRow({ metric, p1, p2 }) {
  const v1 = p1[metric.key];
  const v2 = p2[metric.key];
  const max = Math.max(v1, v2, 0.001);
  const p1Win = v1 > v2;
  const p2Win = v2 > v1;
  const fmt = (v) => (metric.ratio ? formatRatio(v) : formatNumber(v));
  const pct1 = Math.round((v1 / max) * 100);
  const pct2 = Math.round((v2 / max) * 100);

  return (
    <div className="space-y-2 px-5 py-3.5 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {p1Win && <TrendingUp size={13} className="text-[var(--accent)]" />}
          <span
            className={`font-mono-stat text-sm font-bold ${
              p1Win ? "text-[var(--accent)]" : p2Win ? "text-[var(--danger)]/80" : "text-[var(--text)]"
            }`}
          >
            {fmt(v1)}
          </span>
        </div>

        <span className="text-center text-[10px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
          {metric.label}
        </span>

        <div className="flex items-center gap-1.5">
          <span
            className={`font-mono-stat text-sm font-bold ${
              p2Win ? "text-[var(--accent)]" : p1Win ? "text-[var(--danger)]/80" : "text-[var(--text)]"
            }`}
          >
            {fmt(v2)}
          </span>
          {p2Win && <TrendingUp size={13} className="text-[var(--accent)]" />}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="h-1 overflow-hidden rounded-sm bg-[rgba(243,241,236,0.06)]">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct1}%` }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            className={`h-full ${p1Win ? "bg-[var(--accent)]" : "bg-[rgba(243,241,236,0.25)]"}`}
          />
        </div>
        <div className="h-1 overflow-hidden rounded-sm bg-[rgba(243,241,236,0.06)]">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct2}%` }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            className={`ml-auto h-full ${p2Win ? "bg-[var(--danger)]" : "bg-[rgba(243,241,236,0.25)]"}`}
          />
        </div>
      </div>
    </div>
  );
}

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
          data: [
            result.player1.won,
            result.player1.kills,
            result.player1.final_kills,
            result.player1.beds_destroyed,
          ],
          backgroundColor: "rgba(200, 245, 66, 0.7)",
          borderColor: "rgba(200, 245, 66, 0.95)",
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: result.player2.username,
          data: [
            result.player2.won,
            result.player2.kills,
            result.player2.final_kills,
            result.player2.beds_destroyed,
          ],
          backgroundColor: "rgba(255, 77, 58, 0.7)",
          borderColor: "rgba(255, 77, 58, 0.95)",
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    };
  }, [result]);

  const score = useMemo(() => {
    if (!result) return null;
    let p1 = 0;
    let p2 = 0;
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
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="panel panel-static p-6 sm:p-8"
      >
        <div className="mb-6">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-[var(--text-faint)]">
            <Swords size={12} className="text-[var(--accent)]" />
            Head-to-head
          </div>
          <h1 className="font-display mt-2 text-5xl font-extrabold text-[var(--text)] sm:text-6xl">
            Who wins?
          </h1>
          <p className="mt-2 text-[var(--text-dim)]">
            Search two Season 2 usernames for a side-by-side breakdown.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_56px_1fr] lg:items-center">
          <PlayerSearchForm
            value={player1}
            onChange={setPlayer1}
            onSubmit={handleLookup}
            placeholder="First player…"
            buttonLabel="Set"
            compact
          />
          <div className="flex items-center justify-center">
            <div className="font-display flex h-11 w-11 items-center justify-center rounded-[6px] border border-[var(--line)] text-lg font-extrabold text-[var(--text-dim)]">
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
          <div className="mt-4 rounded-[6px] border border-[rgba(255,77,58,0.3)] bg-[rgba(255,77,58,0.08)] px-4 py-3 text-sm text-[#ffb0a6]">
            {error}
          </div>
        )}
      </motion.section>

      {loading && <div className="page-center">Comparing player stats…</div>}

      {result && !loading && (
        <>
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="panel panel-static flex items-center justify-between gap-4 px-6 py-5"
          >
            <div className="text-center">
              <div className="font-mono-stat text-4xl font-bold text-[var(--accent)]">{score.p1}</div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
                categories won
              </div>
              <div className="mt-0.5 font-semibold text-[var(--text)]">{result.player1.username}</div>
            </div>
            <div className="flex-1 text-center text-[10px] uppercase tracking-[0.28em] text-[var(--text-faint)]">
              Overall score
            </div>
            <div className="text-center">
              <div className="font-mono-stat text-4xl font-bold text-[var(--danger)]">{score.p2}</div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
                categories won
              </div>
              <div className="mt-0.5 font-semibold text-[var(--text)]">{result.player2.username}</div>
            </div>
          </motion.div>

          <motion.section
            initial="hidden"
            animate="show"
            variants={containerVariants}
            className="grid gap-6 lg:grid-cols-2"
          >
            <PlayerSummary player={result.player1} index={0} />
            <PlayerSummary player={result.player2} index={1} />
          </motion.section>

          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.08 }}
              className="panel panel-static overflow-hidden"
            >
              <div className="grid grid-cols-[1fr_auto_1fr] border-b border-[var(--line)] px-5 py-4 sm:px-6">
                <div className="text-sm font-bold text-[var(--accent)]">{result.player1.username}</div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
                  Metric
                </div>
                <div className="text-right text-sm font-bold text-[var(--danger)]">
                  {result.player2.username}
                </div>
              </div>
              <div className="divide-y divide-[var(--line)]">
                {metrics.map((metric) => (
                  <MetricRow
                    key={metric.key}
                    metric={metric}
                    p1={result.player1}
                    p2={result.player2}
                  />
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.14 }}
              className="panel panel-static p-6"
            >
              <h2 className="font-display mb-5 text-3xl font-bold text-[var(--text)]">
                Visual comparison
              </h2>
              <div className="h-[340px]">
                <Bar
                  data={chartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        labels: {
                          color: "#9a958c",
                          font: { family: "IBM Plex Sans" },
                        },
                      },
                      tooltip: {
                        backgroundColor: "rgba(11, 13, 16, 0.95)",
                        borderColor: "rgba(243,241,236,0.12)",
                        borderWidth: 1,
                        titleColor: "#f3f1ec",
                        bodyColor: "#9a958c",
                      },
                    },
                    scales: {
                      x: {
                        ticks: {
                          color: "#9a958c",
                          font: { family: "IBM Plex Sans" },
                        },
                        grid: { color: "rgba(243,241,236,0.05)" },
                        border: { color: "rgba(243,241,236,0.1)" },
                      },
                      y: {
                        ticks: {
                          color: "#9a958c",
                          font: { family: "IBM Plex Sans" },
                        },
                        grid: { color: "rgba(243,241,236,0.05)" },
                        border: { color: "rgba(243,241,236,0.1)" },
                      },
                    },
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
