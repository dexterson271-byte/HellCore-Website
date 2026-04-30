import { motion } from "framer-motion";
import { CalendarClock, Clock3, Hash, Sparkles, Star, TrendingUp } from "lucide-react";
import { avatarUrl, bodyUrl, formatNumber, formatRatio, formatUpdated, rankStyle } from "../lib/formatters";

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } },
};

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

function QuickStat({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 transition hover:border-cyan-300/15 hover:bg-white/[0.05]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-black text-white">{value}</div>
    </div>
  );
}

function PlayerCard({ stats }) {
  // XP progress percentage
  const xpPercent = stats.xp_to_next_level
    ? Math.min((stats.xp_progress / stats.xp_to_next_level) * 100, 100)
    : 0;

  return (
    <motion.section
      initial="hidden"
      animate="show"
      variants={containerVariants}
      className="glass-panel relative overflow-hidden"
    >
      {/* background glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(34,211,238,0.12),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(139,92,246,0.09),transparent_50%)]" />

      {/* top accent bar */}
      <div className="h-[3px] w-full bg-gradient-to-r from-cyan-400 via-violet-500 to-transparent" />

      <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[220px_1fr]">
        {/* ── Avatar column ── */}
        <motion.div
          variants={itemVariants}
          className="flex flex-col items-center justify-start gap-4 pt-2"
        >
          {/* 3-D body render */}
          <div className="relative">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-cyan-400/10 to-transparent blur-xl" />
            <img
              src={bodyUrl(stats.username)}
              alt={stats.username}
              className="relative h-auto w-44 drop-shadow-[0_20px_48px_rgba(0,0,0,0.55)]"
            />
          </div>

          {/* rank badges */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {stats.custom_rank && (
              <div
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
                style={rankStyle(stats.custom_rank_color)}
              >
                <Sparkles size={10} />
                {stats.custom_rank}
              </div>
            )}
            <div
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
              style={rankStyle(stats.level_color)}
            >
              <Star size={10} />
              {formatNumber(stats.stars)} Stars
            </div>
          </div>

          {/* XP bar */}
          <div className="w-full rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
            <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-slate-500">
              <span>XP Progress</span>
              <span className="text-cyan-400">{xpPercent.toFixed(0)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${xpPercent}%` }}
                transition={{ duration: 1.1, ease: "easeOut", delay: 0.3 }}
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500"
              />
            </div>
            <div className="mt-2 text-center text-xs text-slate-400">
              {formatNumber(stats.xp_progress)} / {formatNumber(stats.xp_to_next_level)} XP
            </div>
          </div>
        </motion.div>

        {/* ── Stats column ── */}
        <div className="space-y-6">
          {/* header */}
          <motion.div
            variants={itemVariants}
            className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start"
          >
            <div>
              <div className="mb-1 flex items-center gap-3">
                <img
                  src={avatarUrl(stats.username, 64)}
                  alt={stats.username}
                  className="h-11 w-11 rounded-2xl border border-white/10 shadow-lg"
                />
                <div>
                  <div className="text-xs uppercase tracking-[0.28em] text-cyan-300/70">Player profile</div>
                  <h1 className="text-4xl font-black text-white leading-none mt-0.5">{stats.username}</h1>
                </div>
              </div>

              {/* meta chips */}
              <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-300">
                <span className="chip">
                  <Hash size={13} className="text-cyan-300" />
                  Rank #{stats.rank}
                </span>
                <span className="chip">
                  <Star size={13} style={{ color: stats.level_color || "#94a3b8" }} />
                  Level {formatNumber(stats.level)}
                </span>
                <span className="chip">
                  <CalendarClock size={13} className="text-violet-300" />
                  {formatUpdated(stats.updated)}
                </span>
                <span className="chip">
                  <Clock3 size={13} className="text-emerald-300" />
                  {stats.time_played}
                </span>
              </div>
            </div>

            {/* key ratio grid */}
            <motion.div
              variants={containerVariants}
              className="grid grid-cols-3 gap-2 xl:min-w-[300px]"
            >
              {[
                { label: "FKDR", value: formatRatio(stats.final_k_d) },
                { label: "W/L", value: formatRatio(stats.w_l) },
                { label: "K/D", value: formatRatio(stats.k_d) },
                { label: "Stars", value: formatNumber(stats.stars) },
                { label: "Wins", value: formatNumber(stats.won) },
                { label: "Finals", value: formatNumber(stats.final_kills) },
              ].map((item) => (
                <motion.div
                  key={item.label}
                  variants={itemVariants}
                  className="rounded-2xl border border-white/8 bg-white/[0.03] p-3 text-center transition hover:border-cyan-300/15 hover:bg-white/[0.05]"
                >
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{item.label}</div>
                  <div className="mt-1.5 text-xl font-black text-white">{item.value}</div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

          {/* secondary stats row */}
          <motion.div
            variants={containerVariants}
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
          >
            {[
              { label: "Current WS", value: formatNumber(stats.current_win_streak) },
              { label: "Top WS", value: formatNumber(stats.top_win_streak) },
              { label: "Beds Destroyed", value: formatNumber(stats.beds_destroyed) },
              { label: "Rounds Played", value: formatNumber(stats.rounds_played) },
              { label: "Time Played", value: stats.time_played },
            ].map(({ label, value }) => (
              <motion.div
                key={label}
                variants={itemVariants}
                className="rounded-2xl border border-white/8 bg-slate-950/40 p-4 transition hover:border-white/12"
              >
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
                <div className="mt-2 text-lg font-bold text-white">{value}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}

export default PlayerCard;
