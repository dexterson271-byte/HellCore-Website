import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Crown, Medal, Trophy } from "lucide-react";
import { fetchLeaderboard } from "../lib/api";
import { avatarUrl, formatNumber, formatRatio, rankStyle } from "../lib/formatters";

const sortOptions = [
  { key: "won", label: "Wins" },
  { key: "kills", label: "Kills" },
  { key: "final_kills", label: "Final Kills" },
  { key: "final_k_d", label: "Final K/D" }
];

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

  function rankBadge(index) {
    if (index === 0) {
      return <Crown className="text-amber-300" size={18} />;
    }
    if (index < 3) {
      return <Medal className="text-slate-300" size={18} />;
    }
    return <span className="text-slate-500">#{index + 1}</span>;
  }

  return (
    <main className="page-shell space-y-8">
      <section className="glass-panel p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-xs uppercase tracking-[0.25em] text-amber-200">
              <Trophy size={14} />
              Leaderboard
            </div>
            <h1 className="mt-4 text-4xl font-black text-white">Top performers across the network</h1>
            <p className="mt-3 max-w-2xl text-slate-400">
              Sort by wins, kills, finals, or FKDR and jump straight into any player profile.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {sortOptions.map((option) => (
              <button
                key={option.key}
                onClick={() => setSortBy(option.key)}
                className={`rounded-2xl border px-4 py-2 text-sm transition ${
                  sortBy === option.key
                    ? "border-cyan-300/30 bg-cyan-400/15 text-cyan-200"
                    : "border-white/8 bg-white/[0.03] text-slate-300 hover:bg-white/[0.05]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[70px_1.2fr_0.8fr_0.8fr] border-b border-white/10 px-6 py-4 text-xs uppercase tracking-[0.24em] text-slate-500">
              <div>Rank</div>
              <div>Player</div>
              <div>{sortOptions.find((item) => item.key === sortBy)?.label}</div>
              <div>Final K/D</div>
            </div>

            {loading ? (
              <div className="page-center min-h-[320px]">Loading leaderboard...</div>
            ) : (
              <div className="divide-y divide-white/5">
                {players.map((player, index) => (
                  <Link
                    key={player.username}
                    to={`/player/${player.username}`}
                    className="grid grid-cols-[70px_1.2fr_0.8fr_0.8fr] items-center px-6 py-4 transition hover:bg-white/[0.04]"
                  >
                    <div>{rankBadge(index)}</div>
                    <div className="flex items-center gap-3">
                      <img src={avatarUrl(player.username, 40)} alt={player.username} className="h-10 w-10 rounded-xl" />
                      <div>
                        <div className="font-semibold text-white">{player.username}</div>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {player.custom_rank ? (
                            <span
                              className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]"
                              style={rankStyle(player.custom_rank_color)}
                            >
                              {player.custom_rank}
                            </span>
                          ) : null}
                          <span
                            className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]"
                            style={rankStyle(player.level_color)}
                          >
                            {formatNumber(player.stars)} Stars
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="font-semibold text-cyan-200">
                      {sortBy.includes("_d") || sortBy === "w_l"
                        ? formatRatio(player[sortBy])
                        : formatNumber(player[sortBy])}
                    </div>
                    <div className="font-semibold text-white">{formatRatio(player.final_k_d)}</div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

export default Leaderboard;
