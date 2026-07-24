import { useEffect, useMemo, useState } from "react";
import { Activity, BedDouble, Flame, Swords, Target, TrendingUp } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import PlayerCard from "../components/PlayerCard";
import StatBox from "../components/StatBox";
import { fetchPlayer } from "../lib/api";
import { formatNumber, formatRatio } from "../lib/formatters";

function PlayerStats() {
  const { username } = useParams();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        const data = await fetchPlayer(username);
        if (mounted) {
          setStats(data);
          setError("");
        }
      } catch (err) {
        if (mounted) {
          setError(err.response?.data?.message || "Player not found");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [username]);

  const winRate = useMemo(() => {
    if (!stats?.rounds_played) {
      return 0;
    }
    return Math.min((stats.won / stats.rounds_played) * 100, 100);
  }, [stats]);

  if (loading) {
    return <div className="page-center">Loading player dashboard...</div>;
  }

  if (error) {
    return (
      <div className="page-shell">
        <div className="panel panel-static mx-auto max-w-xl p-10 text-center">
          <h1 className="font-display text-4xl font-extrabold text-[var(--text)]">
            We couldn&apos;t find that player.
          </h1>
          <p className="mt-3 text-[var(--text-dim)]">{error}</p>
          <Link to="/" className="btn-accent mt-6 inline-flex px-5 py-3">
            Back to search
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="page-shell space-y-8">
      <PlayerCard stats={stats} />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatBox
          label="Combat"
          value={formatNumber(stats.kills)}
          subtext={`${formatNumber(stats.deaths)} deaths`}
          icon={Swords}
          color="cyan"
        />
        <StatBox
          label="Final K/D"
          value={formatRatio(stats.final_k_d)}
          subtext={`${formatNumber(stats.final_kills)} final kills`}
          icon={Target}
          color="emerald"
        />
        <StatBox
          label="Win Streak"
          value={formatNumber(stats.current_win_streak)}
          subtext={`Top ${formatNumber(stats.top_win_streak)}`}
          icon={Flame}
          color="amber"
        />
        <StatBox
          label="Beds"
          value={formatNumber(stats.beds_destroyed)}
          subtext="Destroyed"
          icon={BedDouble}
          color="violet"
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="panel panel-static p-6">
          <div className="mb-5 flex items-center gap-3">
            <Activity className="text-[var(--accent)]" size={18} />
            <h2 className="font-display text-3xl font-bold text-[var(--text)]">
              Detailed statistics
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[var(--radius)] border border-[var(--line)] p-5">
              <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
                Match output
              </div>
              <div className="mt-5 space-y-3">
                {[
                  ["Wins", formatNumber(stats.won)],
                  ["Losses", formatNumber(stats.lost)],
                  ["Rounds Played", formatNumber(stats.rounds_played)],
                  ["W/L Ratio", formatRatio(stats.w_l)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-[var(--text-dim)]">{label}</span>
                    <span className="font-mono-stat font-semibold text-[var(--text)]">{value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-[var(--text-faint)]">
                  <span>Win rate</span>
                  <span className="font-mono-stat">{winRate.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-sm bg-[rgba(243,241,236,0.06)]">
                  <div
                    className="h-full bg-[var(--accent)]"
                    style={{ width: `${winRate}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-[var(--radius)] border border-[var(--line)] p-5">
              <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
                Combat output
              </div>
              <div className="mt-5 space-y-3">
                {[
                  ["Kills", formatNumber(stats.kills)],
                  ["Deaths", formatNumber(stats.deaths)],
                  ["K/D Ratio", formatRatio(stats.k_d)],
                  ["Top Kill Streak", formatNumber(stats.top_kill_streak)],
                  ["Final Deaths", formatNumber(stats.final_deaths)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-[var(--text-dim)]">{label}</span>
                    <span className="font-mono-stat font-semibold text-[var(--text)]">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="panel panel-static p-6">
          <div className="mb-4 flex items-center gap-3">
            <TrendingUp className="text-[var(--accent)]" size={18} />
            <h2 className="font-display text-3xl font-bold text-[var(--text)]">Next move</h2>
          </div>
          <p className="text-[var(--text-dim)]">
            Put {stats.username} head-to-head with another player to see who leads each category.
          </p>
          <div className="mt-6 space-y-3">
            <Link
              to={`/compare?p1=${stats.username}`}
              className="btn-ghost flex w-full items-center justify-between px-5 py-4"
            >
              Compare this player
              <span className="text-[var(--accent)]">Open</span>
            </Link>
            <Link
              to="/leaderboard"
              className="btn-ghost flex w-full items-center justify-between px-5 py-4"
            >
              Check leaderboard placement
              <span className="text-[var(--accent)]">View</span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export default PlayerStats;
