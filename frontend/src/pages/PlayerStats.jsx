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
        <div className="glass-panel mx-auto max-w-xl p-10 text-center">
          <h1 className="text-3xl font-bold text-white">We couldn&apos;t find that player.</h1>
          <p className="mt-3 text-slate-400">{error}</p>
          <Link to="/" className="mt-6 inline-flex rounded-2xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950">
            Back to search
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="page-shell space-y-8">
      <PlayerCard stats={stats} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
        <div className="glass-panel p-6">
          <div className="mb-5 flex items-center gap-3">
            <Activity className="text-cyan-300" />
            <h2 className="text-2xl font-bold text-white">Detailed statistics</h2>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-5">
              <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Match output</div>
              <div className="mt-5 space-y-4">
                {[
                  ["Wins", formatNumber(stats.won)],
                  ["Losses", formatNumber(stats.lost)],
                  ["Rounds Played", formatNumber(stats.rounds_played)],
                  ["W/L Ratio", formatRatio(stats.w_l)]
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-slate-400">{label}</span>
                    <span className="font-semibold text-white">{value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-slate-500">
                  <span>Win rate</span>
                  <span>{winRate.toFixed(1)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300" style={{ width: `${winRate}%` }} />
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-5">
              <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Combat output</div>
              <div className="mt-5 space-y-4">
                {[
                  ["Kills", formatNumber(stats.kills)],
                  ["Deaths", formatNumber(stats.deaths)],
                  ["K/D Ratio", formatRatio(stats.k_d)],
                  ["Top Kill Streak", formatNumber(stats.top_kill_streak)],
                  ["Final Deaths", formatNumber(stats.final_deaths)]
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-slate-400">{label}</span>
                    <span className="font-semibold text-white">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="glass-panel p-6">
          <div className="mb-4 flex items-center gap-3">
            <TrendingUp className="text-violet-300" />
            <h2 className="text-2xl font-bold text-white">Next move</h2>
          </div>
          <p className="text-slate-400">
            Put {stats.username} head-to-head with another player to see who leads each key category.
          </p>
          <div className="mt-6 space-y-3">
            <Link
              to={`/compare?p1=${stats.username}`}
              className="flex items-center justify-between rounded-3xl border border-violet-300/20 bg-violet-400/10 px-5 py-4 text-white transition hover:bg-violet-400/15"
            >
              Compare this player
              <span className="text-violet-200">Open</span>
            </Link>
            <Link
              to="/leaderboard"
              className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/[0.03] px-5 py-4 text-white transition hover:bg-white/[0.06]"
            >
              Check leaderboard placement
              <span className="text-cyan-200">View</span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export default PlayerStats;
