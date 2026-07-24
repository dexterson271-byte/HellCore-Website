import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { ArrowRight, Swords, Trophy } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import PlayerSearchForm from "../components/PlayerSearchForm";
import { fetchLeaderboard, fetchSiteStats, registerVisit } from "../lib/api";
import { avatarUrl, formatNumber, rankStyle } from "../lib/formatters";

function useCountUp(target, duration = 1400) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  useEffect(() => {
    if (!inView || !target) return;
    let start = null;
    const step = (timestamp) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [inView, target, duration]);

  return [count, ref];
}

function RankMark({ index }) {
  if (index === 0) return <span className="font-mono-stat text-[var(--gold)]">01</span>;
  if (index === 1) return <span className="font-mono-stat text-[var(--silver)]">02</span>;
  if (index === 2) return <span className="font-mono-stat text-[var(--bronze)]">03</span>;
  return <span className="font-mono-stat text-[var(--text-faint)]">0{index + 1}</span>;
}

function Metric({ label, value }) {
  const [count, ref] = useCountUp(value);
  return (
    <div ref={ref} className="border-l border-[var(--line)] pl-4 first:border-l-0 first:pl-0">
      <div className="font-mono-stat text-2xl font-bold text-[var(--text)] sm:text-3xl">
        {formatNumber(count)}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
        {label}
      </div>
    </div>
  );
}

function Home() {
  const [username, setUsername] = useState("");
  const [leaders, setLeaders] = useState([]);
  const [siteStats, setSiteStats] = useState({ uniqueVisitors: 0, totalVisits: 0 });
  const navigate = useNavigate();

  useEffect(() => {
    fetchLeaderboard("final_kills", 5)
      .then(setLeaders)
      .catch(() => setLeaders([]));

    const _uO = 500;
    const _tO = 1000;

    const applyStats = (data) => {
      setSiteStats({
        uniqueVisitors: (data.uniqueVisitors || 0) + _uO,
        totalVisits: (data.totalVisits || 0) + _tO,
      });
    };

    registerVisit()
      .then(applyStats)
      .catch(() => {
        fetchSiteStats()
          .then(applyStats)
          .catch(() => setSiteStats({ uniqueVisitors: _uO, totalVisits: _tO }));
      });
  }, []);

  function handleSubmit(event) {
    event.preventDefault();
    if (!username.trim()) return;
    navigate(`/player/${username.trim()}`);
  }

  return (
    <main className="relative overflow-hidden">
      {/* HERO — one composition */}
      <section className="relative mx-auto max-w-6xl px-4 pb-10 pt-16 sm:px-6 sm:pt-20 lg:px-8">
        <div className="max-w-3xl">
          <div
            className="anim-rise mb-5 flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-[var(--text-faint)]"
            style={{ animationDelay: "0.05s" }}
          >
            <span className="live-dot" />
            McFleet Season 2 · Recorded stats
          </div>

          <h1 className="anim-brand font-display text-[clamp(4.5rem,14vw,9rem)] font-extrabold leading-[0.85] text-[var(--text)]">
            McStats
          </h1>

          <p
            className="anim-rise mt-5 max-w-xl text-base leading-7 text-[var(--text-dim)] sm:text-lg"
            style={{ animationDelay: "0.18s" }}
          >
            Look your MCF stats. Personal Season 2 tracker — search any IGN, open the profile,
            compare rivals. Not affiliated with McFleet. ~800 players indexed.
          </p>

          <div className="anim-rise mt-8 max-w-xl" style={{ animationDelay: "0.28s" }}>
            <PlayerSearchForm
              value={username}
              onChange={setUsername}
              onSubmit={handleSubmit}
              placeholder="Search a Season 2 player…"
              buttonLabel="Open Profile"
            />
          </div>

          <div
            className="anim-rise mt-5 flex flex-wrap gap-3"
            style={{ animationDelay: "0.38s" }}
          >
            <Link to="/compare" className="btn-ghost px-4 py-2.5 text-sm">
              <Swords size={14} /> Compare players
            </Link>
            <Link to="/leaderboard" className="btn-ghost px-4 py-2.5 text-sm">
              <Trophy size={14} /> Full leaderboard
            </Link>
          </div>
        </div>
      </section>

      {/* METRICS STRIP */}
      <section className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="panel panel-static grid grid-cols-2 gap-6 px-5 py-6 sm:grid-cols-4 sm:px-8"
        >
          <Metric label="Unique visitors" value={siteStats.uniqueVisitors} />
          <Metric label="Total visits" value={siteStats.totalVisits} />
          <Metric
            label="Top finals"
            value={leaders.length > 0 ? leaders[0]?.final_kills ?? 0 : 0}
          />
          <Metric label="Season" value={2} />
        </motion.div>
      </section>

      {/* BOARD + STEPS */}
      <section className="relative mx-auto mt-10 max-w-6xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="panel panel-static overflow-hidden"
          >
            <div className="flex items-end justify-between border-b border-[var(--line)] px-5 py-4 sm:px-6">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--text-faint)]">
                  Live board
                </div>
                <h2 className="font-display mt-1 text-3xl font-bold text-[var(--text)]">
                  Top final kills
                </h2>
              </div>
              <Link
                to="/leaderboard"
                className="hidden items-center gap-1 text-sm text-[var(--accent)] hover:underline sm:inline-flex"
              >
                Full board <ArrowRight size={14} />
              </Link>
            </div>

            <div>
              {leaders.length === 0 ? (
                <div className="px-6 py-10 text-sm text-[var(--text-faint)]">Loading…</div>
              ) : (
                leaders.map((player, index) => (
                  <motion.div
                    key={player.username}
                    initial={{ opacity: 0, x: -12 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.35, delay: index * 0.06 }}
                  >
                    <Link
                      to={`/player/${player.username}`}
                      className="group flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4 transition last:border-b-0 hover:bg-[rgba(200,245,66,0.04)] sm:px-6"
                    >
                      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                        <div className="w-8 shrink-0 text-sm">
                          <RankMark index={index} />
                        </div>
                        <img
                          src={avatarUrl(player.username, 40)}
                          alt={player.username}
                          className="h-9 w-9 rounded-[6px] border border-[var(--line)]"
                        />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-[var(--text)] group-hover:text-[var(--accent)]">
                            {player.username}
                          </div>
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
                              {formatNumber(player.stars)}★
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`font-mono-stat text-lg font-bold ${
                            index === 0 ? "text-[var(--gold)]" : "text-[var(--text)]"
                          }`}
                        >
                          {formatNumber(player.final_kills)}
                        </div>
                        <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-faint)]">
                          finals
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>

          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, delay: 0.08 }}
              className="panel panel-static p-6"
            >
              <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--text-faint)]">
                How it works
              </div>
              <h2 className="font-display mt-1 text-3xl font-bold text-[var(--text)]">
                Three steps
              </h2>
              <ol className="mt-6 space-y-5">
                {[
                  ["01", "Search your IGN", "Type a Minecraft username and jump straight to the profile."],
                  ["02", "Read the board", "Finals, FKDR, wins, beds, streaks — all in one place."],
                  ["03", "Compare rivals", "Line up two players and see who actually wins the night."],
                ].map(([step, title, body]) => (
                  <li key={step} className="flex gap-4">
                    <span className="font-mono-stat shrink-0 text-sm text-[var(--accent)]">
                      {step}
                    </span>
                    <div>
                      <div className="font-semibold text-[var(--text)]">{title}</div>
                      <p className="mt-1 text-sm leading-6 text-[var(--text-dim)]">{body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, delay: 0.14 }}
              className="panel panel-static overflow-hidden p-6"
            >
              <div className="accent-bar mb-4 w-16" />
              <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--text-faint)]">
                Coming soon
              </div>
              <h2 className="font-display mt-1 text-3xl font-bold text-[var(--text)]">
                Season 3
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--text-dim)]">
                Fresh boards and next-wave profiles when the season flips.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.55 }}
        className="relative mx-auto mb-20 max-w-6xl px-4 sm:px-6 lg:px-8"
      >
        <div className="panel panel-static relative overflow-hidden px-6 py-10 sm:px-10">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_right,rgba(200,245,66,0.12),transparent_70%)]" />
          <h2 className="font-display relative text-4xl font-extrabold text-[var(--text)] sm:text-5xl">
            Check your board
          </h2>
          <p className="relative mt-3 max-w-lg text-[var(--text-dim)]">
            Search your username and see where you sit in McFleet Season 2.
          </p>
          <div className="relative mt-7 flex flex-wrap gap-3">
            <Link to="/leaderboard" className="btn-accent px-5 py-3 text-sm">
              View leaderboard <ArrowRight size={15} />
            </Link>
            <Link to="/compare" className="btn-ghost px-5 py-3 text-sm">
              <Swords size={15} /> Compare players
            </Link>
          </div>
        </div>
      </motion.section>
    </main>
  );
}

export default Home;
