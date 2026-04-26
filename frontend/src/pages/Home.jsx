import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Flame, Radar, Sparkles, Swords, Trophy } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import PlayerSearchForm from "../components/PlayerSearchForm";
import { fetchLeaderboard } from "../lib/api";
import { avatarUrl, formatNumber, formatRatio, rankStyle } from "../lib/formatters";

const features = [
  {
    icon: Radar,
    title: "Season 2 player lookup",
    body: "Search McFleet Season 2 usernames instantly and jump straight into the stats that matter."
  },
  {
    icon: Swords,
    title: "Head-to-head compare",
    body: "Line up two players side by side and see who actually leads in finals, FKDR, beds, and wins."
  },
  {
    icon: Flame,
    title: "Season 2 focus",
    body: "Built around McFleet Season 2 progression, streaks, finals, and leaderboard movement."
  }
];

function Home() {
  const [username, setUsername] = useState("");
  const [leaders, setLeaders] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchLeaderboard("final_kills", 5)
      .then(setLeaders)
      .catch(() => setLeaders([]));
  }, []);

  function handleSubmit(event) {
    event.preventDefault();
    if (!username.trim()) {
      return;
    }

    navigate(`/player/${username.trim()}`);
  }

  return (
    <main className="relative overflow-hidden px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="hero-orb hero-orb-cyan" />
        <div className="hero-orb hero-orb-violet" />
        <div className="hero-grid" />
      </div>
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.3fr_0.9fr]">
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="glass-panel relative overflow-hidden p-8 sm:p-10"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(139,92,246,0.14),transparent_35%)]" />
          <div className="relative space-y-8">
            <div className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-xs uppercase tracking-[0.28em] text-cyan-200 shadow-[0_0_30px_rgba(34,211,238,0.12)]">
              McFleet Season 2 stats
            </div>

            <div className="space-y-4">
              <h1 className="max-w-3xl text-5xl font-black tracking-tight text-white sm:text-6xl lg:text-7xl">
                McStats for McFleet Season 2.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-300">
                Search profiles, compare players, and track the strongest Season 2 performances with a cleaner, sharper stat view.
              </p>
            </div>

            <PlayerSearchForm
              value={username}
              onChange={setUsername}
              onSubmit={handleSubmit}
              placeholder="Search a McFleet Season 2 username"
              buttonLabel="Open Profile"
            />

            <div className="grid gap-4 md:grid-cols-3">
              {features.map(({ icon: Icon, title, body }) => (
                <motion.div
                  key={title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45 }}
                  whileHover={{ y: -4, scale: 1.01 }}
                  className="rounded-3xl border border-white/10 bg-slate-950/35 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                >
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-200">
                    <Icon size={18} />
                  </div>
                  <h2 className="text-lg font-semibold text-white">{title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>

        <section className="space-y-6">
          <motion.div
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="glass-panel p-6"
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.25em] text-amber-200/80">Top final kills</div>
                <h2 className="mt-1 text-2xl font-bold text-white">Live leaderboard snapshot</h2>
              </div>
              <Trophy className="text-amber-300" />
            </div>

            <div className="space-y-3">
              {leaders.map((player, index) => (
                <motion.div
                  key={player.username}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.12 + index * 0.06 }}
                >
                  <Link
                    to={`/player/${player.username}`}
                    className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 transition hover:border-cyan-300/20 hover:bg-white/[0.05] hover:shadow-[0_0_24px_rgba(34,211,238,0.08)]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/5 text-sm font-semibold text-slate-300">
                        #{index + 1}
                      </div>
                      <img src={avatarUrl(player.username, 40)} alt={player.username} className="h-10 w-10 rounded-xl ring-1 ring-white/10" />
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
                    <div className="text-right">
                      <div className="font-semibold text-cyan-200">{formatNumber(player.final_kills)}</div>
                      <div className="text-xs text-slate-400">final kills</div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.18 }}
            className="glass-panel p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.25em] text-violet-200/80">Coming soon</div>
                <h2 className="mt-1 text-2xl font-bold text-white">McFleet Season 3 stats</h2>
              </div>
              <Sparkles className="text-violet-300" size={18} />
            </div>
            <p className="text-sm leading-6 text-slate-400">
              Season 3 tracking, fresh leaderboards, and the next wave of player profiles are on the way.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.24 }}
            className="glass-panel p-6"
          >
            <div className="text-xs uppercase tracking-[0.25em] text-violet-200/80">Quick routes</div>
            <div className="mt-4 space-y-3">
              <Link to="/compare" className="quick-link">
                Compare two players
                <ArrowRight size={16} />
              </Link>
              <Link to="/leaderboard" className="quick-link">
                Explore the leaderboard
                <ArrowRight size={16} />
              </Link>
            </div>
          </motion.div>
        </section>
      </div>
    </main>
  );
}

export default Home;
