import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { fetchLeaderboard } from "../lib/api";
import { avatarUrl, formatNumber, formatRatio, rankStyle } from "../lib/formatters";

const sortOptions = [
  { key: "won", label: "Wins" },
  { key: "kills", label: "Kills" },
  { key: "final_kills", label: "Final Kills" },
  { key: "final_k_d", label: "Final K/D" },
];

function RankBadge({ index }) {
  const tones = [
    "text-[var(--gold)]",
    "text-[var(--silver)]",
    "text-[var(--bronze)]",
    "text-[var(--text-faint)]",
  ];
  return (
    <div className={`font-mono-stat w-8 text-sm font-bold ${tones[Math.min(index, 3)]}`}>
      {String(index + 1).padStart(2, "0")}
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
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="panel panel-static p-6 sm:p-8"
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--text-faint)]">
              Leaderboard
            </div>
            <h1 className="font-display mt-2 text-5xl font-extrabold text-[var(--text)] sm:text-6xl">
              Top performers
            </h1>
            <p className="mt-2 max-w-xl text-[var(--text-dim)]">
              Sort by wins, kills, finals, or FKDR. Click any row for the full profile.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {sortOptions.map((option) => (
              <button
                key={option.key}
                onClick={() => setSortBy(option.key)}
                className={`rounded-[6px] border px-3.5 py-2 text-sm font-medium transition ${
                  sortBy === option.key
                    ? "border-[var(--accent)] bg-[rgba(200,245,66,0.12)] text-[var(--accent)]"
                    : "border-[var(--line)] text-[var(--text-dim)] hover:border-[var(--line-strong)] hover:text-[var(--text)]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </motion.section>

      <motion.section
        key={sortBy}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="panel panel-static overflow-hidden"
      >
        <div className="grid min-w-[700px] grid-cols-[56px_1fr_130px_110px_100px] border-b border-[var(--line)] px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-faint)]">
          <div>Rank</div>
          <div>Player</div>
          <div className="text-right text-[var(--accent)]">{currentOption?.label}</div>
          <div className="text-right">Final K/D</div>
          <div className="text-right">Stars</div>
        </div>

        {loading ? (
          <div className="space-y-px">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="shimmer h-[64px] w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[700px]">
              {players.map((player, index) => (
                <motion.div
                  key={player.username}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.28, delay: index * 0.025 }}
                >
                  <Link
                    to={`/player/${player.username}`}
                    className="grid grid-cols-[56px_1fr_130px_110px_100px] items-center gap-3 border-b border-[var(--line)] px-5 py-3.5 transition last:border-b-0 hover:bg-[rgba(200,245,66,0.04)]"
                  >
                    <RankBadge index={index} />

                    <div className="flex items-center gap-3">
                      <img
                        src={avatarUrl(player.username, 40)}
                        alt={player.username}
                        className="h-9 w-9 shrink-0 rounded-[6px] border border-[var(--line)]"
                      />
                      <div>
                        <div className="font-semibold text-[var(--text)]">{player.username}</div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
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
                            Lvl {formatNumber(player.level)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div
                      className={`font-mono-stat text-right text-base font-bold ${
                        index === 0 ? "text-[var(--gold)]" : "text-[var(--text)]"
                      }`}
                    >
                      {sortBy.includes("_d") || sortBy === "w_l"
                        ? formatRatio(player[sortBy])
                        : formatNumber(player[sortBy])}
                    </div>

                    <div className="font-mono-stat text-right font-semibold text-[var(--text)]">
                      {formatRatio(player.final_k_d)}
                    </div>

                    <div className="font-mono-stat text-right font-semibold text-[var(--text-dim)]">
                      {formatNumber(player.stars)}★
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </motion.section>
    </main>
  );
}

export default Leaderboard;
