import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import {
  ArrowRight,
  Crown,
  Flame,
  Medal,
  Radar,
  Sparkles,
  Swords,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import PlayerSearchForm from "../components/PlayerSearchForm";
import { fetchLeaderboard, fetchSiteStats, registerVisit } from "../lib/api";
import { avatarUrl, formatNumber, formatRatio, rankStyle } from "../lib/formatters";

/* ─── animated counter ─── */
function useCountUp(target, duration = 1800) {
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

/* ─── rank icon ─── */
function RankIcon({ index }) {
  if (index === 0) return <Crown className="text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.7)]" size={18} />;
  if (index === 1) return <Medal className="text-slate-300 drop-shadow-[0_0_4px_rgba(203,213,225,0.5)]" size={18} />;
  if (index === 2) return <Medal className="text-orange-400 drop-shadow-[0_0_4px_rgba(251,146,60,0.5)]" size={18} />;
  return <span className="text-sm font-bold text-slate-500">#{index + 1}</span>;
}

const rowGlow = [
  "hover:border-amber-300/20 hover:shadow-[0_0_28px_rgba(251,191,36,0.07)]",
  "hover:border-slate-300/20 hover:shadow-[0_0_28px_rgba(203,213,225,0.06)]",
  "hover:border-orange-400/20 hover:shadow-[0_0_28px_rgba(251,146,60,0.06)]",
];

/* ─── features ─── */
const features = [
  {
    icon: Radar,
    color: "cyan",
    title: "Instant Player Lookup",
    body: "Search any McFleet Season 2 username and land on a full stat breakdown in under a second.",
  },
  {
    icon: Swords,
    color: "violet",
    title: "Head-to-Head Compare",
    body: "Line up two players side by side — finals, FKDR, beds broken, and wins at a glance.",
  },
  {
    icon: Flame,
    color: "amber",
    title: "Season 2 Focused",
    body: "Built around McFleet Season 2 data: streaks, progression, leaderboard movement, and more.",
  },
  {
    icon: Zap,
    color: "emerald",
    title: "Live Leaderboards",
    body: "Sort the entire player pool by wins, kills, finals, or FKDR and jump to any profile instantly.",
  },
];

const featureAccent = {
  cyan: {
    border: "border-cyan-300/20",
    bg: "bg-cyan-400/10",
    text: "text-cyan-300",
    glow: "shadow-[0_0_28px_rgba(34,211,238,0.12)]",
    ring: "ring-cyan-300/20",
  },
  violet: {
    border: "border-violet-300/20",
    bg: "bg-violet-400/10",
    text: "text-violet-300",
    glow: "shadow-[0_0_28px_rgba(139,92,246,0.12)]",
    ring: "ring-violet-300/20",
  },
  amber: {
    border: "border-amber-300/20",
    bg: "bg-amber-400/10",
    text: "text-amber-300",
    glow: "shadow-[0_0_28px_rgba(251,191,36,0.12)]",
    ring: "ring-amber-300/20",
  },
  emerald: {
    border: "border-emerald-300/20",
    bg: "bg-emerald-400/10",
    text: "text-emerald-300",
    glow: "shadow-[0_0_28px_rgba(52,211,153,0.12)]",
    ring: "ring-emerald-300/20",
  },
};

/* ─── StatPill ─── */
function StatPill({ icon: Icon, label, value, color }) {
  const [count, ref] = useCountUp(value);
  const acc = featureAccent[color];
  return (
    <div
      ref={ref}
      className={`flex flex-col items-center gap-1 rounded-3xl border ${acc.border} ${acc.bg} px-6 py-5 ${acc.glow}`}
    >
      <Icon className={acc.text} size={22} />
      <span className={`text-2xl font-black tabular-nums ${acc.text}`}>
        {formatNumber(count)}
      </span>
      <span className="text-xs uppercase tracking-[0.22em] text-slate-400">{label}</span>
    </div>
  );
}

/* ═══════════════════════════════════ PAGE ═══════════════════════════════════ */
function Home() {
  const [username, setUsername] = useState("");
  const [leaders, setLeaders] = useState([]);
  const [siteStats, setSiteStats] = useState({ uniqueVisitors: 0, totalVisits: 0 });
  const navigate = useNavigate();

  useEffect(() => {
    fetchLeaderboard("final_kills", 5)
      .then(setLeaders)
      .catch(() => setLeaders([]));

    registerVisit()
      .then(setSiteStats)
      .catch(() =>
        fetchSiteStats()
          .then(setSiteStats)
          .catch(() => setSiteStats({ uniqueVisitors: 0, totalVisits: 0 }))
      );
  }, []);

  function handleSubmit(event) {
    event.preventDefault();
    if (!username.trim()) return;
    navigate(`/player/${username.trim()}`);
  }

  /* ── stagger helpers ── */
  const containerVariants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.1 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 22 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
  };

  return (
    <main className="relative overflow-hidden">
      {/* ── ambient orbs ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="hero-orb hero-orb-cyan" />
        <div className="hero-orb hero-orb-violet" />
        <div className="hero-orb hero-orb-rose" />
        <div className="hero-grid" />
      </div>

      {/* ══════════ HERO ══════════ */}
      <section className="relative mx-auto max-w-7xl px-4 pb-0 pt-16 sm:px-6 lg:px-8">
        <motion.div
          initial="hidden"
          animate="show"
          variants={containerVariants}
          className="flex flex-col items-center text-center"
        >
          {/* badge */}
          <motion.div variants={itemVariants}>
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-xs uppercase tracking-[0.28em] text-cyan-200 shadow-[0_0_30px_rgba(34,211,238,0.12)]">
              <Sparkles size={12} className="text-cyan-300" />
              McFleet Season 2 • Recorded stats
            </span>
          </motion.div>

          {/* headline */}
          <motion.h1
            variants={itemVariants}
            className="hero-headline mt-6 max-w-4xl text-6xl font-black tracking-tight sm:text-7xl lg:text-8xl"
          >
            Look Your
            <br />
            <span className="hero-gradient-text">MCF Stats</span>
          </motion.h1>

          {/* sub */}
          <motion.p
            variants={itemVariants}
            className="mt-6 max-w-2xl text-lg leading-8 text-slate-400"
          >
            This website is not associated with McFleet, this is a personal project. I only have data of 800 players, so if you don't have your stats, sorry.
          </motion.p>

          {/* search */}
          <motion.div variants={itemVariants} className="mt-10 w-full max-w-xl">
            <PlayerSearchForm
              value={username}
              onChange={setUsername}
              onSubmit={handleSubmit}
              placeholder="Search a McFleet Season 2 player…"
              buttonLabel="Open Profile"
            />
          </motion.div>

          {/* quick nav pills */}
          <motion.div variants={itemVariants} className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              to="/compare"
              className="flex items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-2 text-sm text-slate-300 transition hover:border-violet-300/25 hover:bg-violet-400/10 hover:text-violet-200"
            >
              <Swords size={14} /> Compare players
            </Link>
            <Link
              to="/leaderboard"
              className="flex items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-2 text-sm text-slate-300 transition hover:border-amber-300/25 hover:bg-amber-400/10 hover:text-amber-200"
            >
              <Trophy size={14} /> Full leaderboard
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* ══════════ STAT PILLS ══════════ */}
      <section className="relative mx-auto mt-16 max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6 }}
          className="grid grid-cols-2 gap-4 sm:grid-cols-4"
        >
          <StatPill icon={Users} label="Unique Visitors" value={siteStats.uniqueVisitors} color="cyan" />
          <StatPill icon={Flame} label="Total Visits" value={siteStats.totalVisits} color="violet" />
          <StatPill icon={Trophy} label="Top Finalists" value={leaders.length > 0 ? leaders[0]?.final_kills ?? 0 : 0} color="amber" />
          <StatPill icon={Zap} label="Season" value={2} color="emerald" />
        </motion.div>
      </section>

      {/* ══════════ MAIN GRID ══════════ */}
      <section className="relative mx-auto mt-14 max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_400px]">

          {/* ── LEFT: Features ── */}
          <div className="space-y-8">
            {/* section label */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/10" />
              <span className="text-xs uppercase tracking-[0.28em] text-slate-500">Platform features</span>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/10" />
            </div>

            <motion.div
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-40px" }}
              variants={containerVariants}
              className="grid gap-4 sm:grid-cols-2"
            >
              {features.map(({ icon: Icon, color, title, body }) => {
                const acc = featureAccent[color];
                return (
                  <motion.div
                    key={title}
                    variants={itemVariants}
                    whileHover={{ y: -5, scale: 1.015 }}
                    className={`glass-panel group relative overflow-hidden p-6 ring-1 ring-inset ring-white/[0.04] transition-all duration-300 hover:ring-1 hover:${acc.ring}`}
                  >
                    {/* inner glow */}
                    <div className={`absolute -right-10 -top-10 h-32 w-32 rounded-full ${acc.bg} blur-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />
                    <div className={`relative mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border ${acc.border} ${acc.bg} ${acc.glow}`}>
                      <Icon className={acc.text} size={20} />
                    </div>
                    <h3 className="relative text-base font-bold text-white">{title}</h3>
                    <p className="relative mt-2 text-sm leading-6 text-slate-400">{body}</p>
                  </motion.div>
                );
              })}
            </motion.div>

            {/* How it works */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55 }}
              className="glass-panel overflow-hidden"
            >
              <div className="border-b border-white/8 px-7 py-5">
                <span className="text-xs uppercase tracking-[0.28em] text-slate-500">How it works</span>
                <h2 className="mt-1 text-xl font-bold text-white">Three steps to your stats</h2>
              </div>
              <div className="divide-y divide-white/5">
                {[
                  { step: "01", label: "Search your IGN", desc: "Type your Minecraft username in the search bar and get instant results." },
                  { step: "02", label: "Explore your profile", desc: "View finals, FKDR, wins, beds, kill streaks, and season progression." },
                  { step: "03", label: "Compare & compete", desc: "Run a head-to-head vs any rival and see who truly comes out on top." },
                ].map(({ step, label, desc }) => (
                  <div key={step} className="flex items-start gap-5 px-7 py-5">
                    <span className="mt-0.5 shrink-0 font-black tabular-nums text-cyan-400/40 text-2xl leading-none">{step}</span>
                    <div>
                      <div className="font-semibold text-white">{label}</div>
                      <p className="mt-1 text-sm text-slate-400">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* ── RIGHT: Leaderboard + Coming Soon ── */}
          <div className="space-y-6">
            {/* Leaderboard */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55 }}
              className="glass-panel overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-white/8 px-6 py-5">
                <div>
                  <span className="text-xs uppercase tracking-[0.25em] text-amber-200/80">Top final kills</span>
                  <h2 className="mt-1 text-lg font-bold text-white">Live leaderboard</h2>
                </div>
                <Trophy className="text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" size={20} />
              </div>

              <div className="divide-y divide-white/5">
                {leaders.length === 0 ? (
                  <div className="px-6 py-10 text-center text-sm text-slate-500">Loading…</div>
                ) : (
                  leaders.map((player, index) => (
                    <motion.div
                      key={player.username}
                      initial={{ opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.35, delay: 0.08 + index * 0.07 }}
                    >
                      <Link
                        to={`/player/${player.username}`}
                        className={`flex items-center justify-between gap-3 border border-transparent px-5 py-4 transition-all duration-200 ${rowGlow[index] ?? "hover:border-white/10 hover:bg-white/[0.03]"}`}
                      >
                        {/* rank + avatar */}
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                            <RankIcon index={index} />
                          </div>
                          <div className="relative">
                            <img
                              src={avatarUrl(player.username, 40)}
                              alt={player.username}
                              className={`h-10 w-10 rounded-xl ring-2 ${index === 0 ? "ring-amber-300/30" : index === 1 ? "ring-slate-300/20" : index === 2 ? "ring-orange-400/20" : "ring-white/10"}`}
                            />
                            {index === 0 && (
                              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[8px] font-black text-slate-900">1</span>
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-white">{player.username}</div>
                            <div className="mt-1 flex flex-wrap gap-1.5">
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

                        {/* stat */}
                        <div className="text-right">
                          <div className={`text-lg font-black tabular-nums ${index === 0 ? "text-amber-300" : "text-cyan-200"}`}>
                            {formatNumber(player.final_kills)}
                          </div>
                          <div className="text-[11px] text-slate-500">final kills</div>
                        </div>
                      </Link>
                    </motion.div>
                  ))
                )}
              </div>

              <div className="border-t border-white/8 px-6 py-4">
                <Link
                  to="/leaderboard"
                  className="flex items-center justify-center gap-2 text-sm font-medium text-cyan-300 transition hover:text-cyan-200"
                >
                  View full leaderboard <ArrowRight size={15} />
                </Link>
              </div>
            </motion.div>

            {/* Visitors card */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, delay: 0.08 }}
              className="glass-panel px-6 py-5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs uppercase tracking-[0.25em] text-emerald-200/80">Community</span>
                  <h2 className="mt-1 text-lg font-bold text-white">
                    {formatNumber(siteStats.uniqueVisitors)} unique visitors
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    {formatNumber(siteStats.totalVisits)} total visits tracked
                  </p>
                </div>
                <Users className="text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" size={22} />
              </div>
            </motion.div>

            {/* Season 3 teaser */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, delay: 0.14 }}
              className="glass-panel relative overflow-hidden px-6 py-5"
            >
              <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-violet-500/20 blur-2xl" />
              <div className="relative flex items-center justify-between">
                <div>
                  <span className="text-xs uppercase tracking-[0.25em] text-violet-300/80">Coming soon</span>
                  <h2 className="mt-1 text-lg font-bold text-white">Season 3 stats</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Fresh leaderboards and next-wave profiles are on the way.
                  </p>
                </div>
                <Sparkles className="text-violet-300 drop-shadow-[0_0_8px_rgba(139,92,246,0.5)]" size={22} />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ══════════ CTA STRIP ══════════ */}
      <motion.section
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="relative mx-auto mb-20 max-w-7xl px-4 sm:px-6 lg:px-8"
      >
        <div className="cta-strip relative overflow-hidden rounded-3xl px-8 py-10 text-center sm:px-14">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(34,211,238,0.18),transparent_65%)]" />
          <h2 className="relative text-3xl font-black text-white sm:text-4xl">
            Ready to check your stats?
          </h2>
          <p className="relative mt-3 text-slate-300">
            Search your username and see where you rank in McFleet Season 2.
          </p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-4">
            <Link
              to="/compare"
              className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-6 py-3 font-semibold text-white backdrop-blur transition hover:bg-white/15"
            >
              <Swords size={16} /> Compare players
            </Link>
            <Link
              to="/leaderboard"
              className="flex items-center gap-2 rounded-2xl bg-cyan-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              <Trophy size={16} /> View leaderboard <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </motion.section>
    </main>
  );
}

export default Home;
