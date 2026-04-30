import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Crown, Medal, Trophy, TrendingUp } from "lucide-react";
import { fetchLeaderboard } from "../lib/api";
import { avatarUrl, formatNumber, formatRatio, rankStyle } from "../lib/formatters";

const sortOptions = [
  { key: "won",        label: "Wins" },
  { key: "kills",      label: "Kills" },
  { key: "final_kills",label: "Final Kills" },
  { key: "final_k_d", label: "Final K/D" },
];

const podiumColors = [
  { ring: "ring-amber-300/40",  bg: "bg-amber-400/10",  text: "text-amber-300",  border: "border-amber-300/20",  glow: "shadow-[0_0_30px_rgba(251,191,36,0.08)]" },
  { ring: "ring-slate-300/30",  bg: "bg-slate-400/8",   text: "text-slate-300",  border: "border-slate-300/15",  glow: "shadow-[0_0_20px_rgba(203,213,225,0.05)]" },
  { ring: "ring-orange-400/30", bg: "bg-orange-400/8",  text: "text-orange-300", border: "border-orange-400/15", glow: "shadow-[0_0_20px_rgba(251,146,60,0.05)]" },
];

function RankBadge({ index }) {
  if (index === 0) return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center">
      <Crown className="text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.7)]" size={20} />
    </div>
  );
  if (index === 1) return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center">
      <Medal className="text-slate-300 drop-shadow-[0_0_6px_rgba(203,213,225,0.5)]" size={20} />
    </div>
  );
  if (index === 2) return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center">
      <Medal className="text-orange-400 drop-shadow-[0_0_6px_rgba(251,146,60,0.5)]" size={20} />
    </div>
  );
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03] text-sm font-bold text-slate-500">
      {index + 1}
    </div>
  );
}

function Leaderboard() {
  const [players, setPlayers] = useState([]);
  const [sortBy, setSortBy] = useState("won");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadBoard() {
      try {
        setLoading(true);
        const data = await fetchLeaderboard(sortBy, 20);
        setPlayers(data);
      } finally {
        setLoading(false);
      }
    }
    loadBoard();
  }, [sortBy]);

  const currentOption = sortOptions.find((o) => o.key === sortBy);

  return (
    <main className="page-shell space-y-8">
      {/* ── Header ── */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="glass-panel relative overflow-hidden p-6 sm:p-8"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(251,191,36,0.10),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(34,211,238,0.07),transparent_50%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-xs uppercase tracking-[0.25em] text-amber-200">
              <Trophy size={13} />
              Leaderboard
            </div>
            <h1 className="mt-4 text-4xl font-black text-white sm:text-5xl">
              Top performers
            </h1>
            <p className="mt-2 max-w-xl text-slate-400">
              Sort by wins, kills, finals, or FKDR and click any row to view the full player profile.
            </p>
          </div>

          {/* sort tabs */}
          <div className="flex flex-wrap gap-2">
            {sortOptions.map((option) => (
              <button
                key={option.key}
                onClick={() => setSortBy(option.key)}
                className={`rounded-2xl border px-4 py-2 text-sm font-medium transition-all duration-200 ${
                  sortBy === option.key
                    ? "border-amber-300/30 bg-amber-400/12 text-amber-200 shadow-[0_0_20px_rgba(251,191,36,0.10)]"
                    : "border-white/8 bg-white/[0.03] text-slate-400 hover:border-white/12 hover:bg-white/[0.06] hover:text-slate-200"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ── Table ── */}
      <motion.section
        key={sortBy}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="glass-panel overflow-hidden"
      >
        {/* column headers */}
        <div className="grid grid-cols-[56px_1fr_130px_110px_100px] border-b border-white/8 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 min-w-[700px]">
          <div>Rank</div>
          <div>Player</div>
          <div className="text-right text-amber-300/80">{currentOption?.label}</div>
          <div className="text-right">Final K/D</div>
          <div className="text-right">Stars</div>
        </div>

        {loading ? (
          <div className="space-y-px">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="shimmer h-[68px] w-full" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-white/[0.045] overflow-x-auto">
            <div className="min-w-[700px]">
              {players.map((player, index) => {
                const pod = podiumColors[index];
                return (
                  <motion.div
                    key={player.username}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.03 }}
                  >
                    <Link
                      to={`/player/${player.username}`}
                      className={`grid grid-cols-[56px_1fr_130px_110px_100px] items-center gap-3 px-5 py-3.5 transition-all duration-200 ${
                        index < 3
                          ? `border border-transparent hover:border hover:${pod?.border} hover:${pod?.bg} ${pod?.glow}`
                          : "hover:bg-white/[0.03]"
                      }`}
                    >
                      {/* rank */}
                      <div>
                        <RankBadge index={index} />
                      </div>

                      {/* player */}
                      <div className="flex items-center gap-3">
                        <img
                          src={avatarUrl(player.username, 40)}
                          alt={player.username}
                          className={`h-10 w-10 shrink-0 rounded-xl ring-1 ${index < 3 ? pod?.ring : "ring-white/10"}`}
                        />
                        <div>
                          <div className="font-semibold text-white">{player.username}</div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {player.custom_rank && (
                              <span
                                className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.13em]"
                                style={rankStyle(player.custom_rank_color)}
                              >
                                {player.custom_rank}
                              </span>
                            )}
                            <span
                              className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.13em]"
                              style={rankStyle(player.level_color)}
                            >
                              Lvl {formatNumber(player.level)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* primary stat */}
                      <div className={`text-right text-base font-black tabular-nums ${index < 3 ? pod?.text : "text-cyan-200"}`}>
                        {sortBy.includes("_d") || sortBy === "w_l"
                          ? formatRatio(player[sortBy])
                          : formatNumber(player[sortBy])}
                      </div>

                      {/* fkdr */}
                      <div className="text-right font-semibold text-white tabular-nums">
                        {formatRatio(player.final_k_d)}
                      </div>

                      {/* stars */}
                      <div className="text-right font-semibold text-slate-400 tabular-nums">
                        {formatNumber(player.stars)}★
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </motion.section>
    </main>
  );
}

export default Leaderboard;
