import { motion } from "framer-motion";
import { CalendarClock, Clock3, Hash, Star } from "lucide-react";
import { avatarUrl, bodyUrl, formatNumber, formatRatio, formatUpdated, rankStyle } from "../lib/formatters";

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

function PlayerCard({ stats }) {
  const xpPercent = stats.xp_to_next_level
    ? Math.min((stats.xp_progress / stats.xp_to_next_level) * 100, 100)
    : 0;

  return (
    <motion.section
      initial="hidden"
      animate="show"
      variants={containerVariants}
      className="panel panel-static relative overflow-hidden"
    >
      <div className="accent-bar anim-line w-full" />

      <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[200px_1fr]">
        <motion.div
          variants={itemVariants}
          className="flex flex-col items-center justify-start gap-4 pt-1"
        >
          <img
            src={bodyUrl(stats.username)}
            alt={stats.username}
            className="relative h-auto w-40 drop-shadow-[0_16px_32px_rgba(0,0,0,0.5)]"
          />

          <div className="flex flex-wrap items-center justify-center gap-2">
            {stats.custom_rank && (
              <div
                className="inline-flex items-center gap-1.5 rounded-[5px] border px-2.5 py-1 text-[11px] uppercase tracking-[0.14em]"
                style={rankStyle(stats.custom_rank_color)}
              >
                {stats.custom_rank}
              </div>
            )}
            <div
              className="inline-flex items-center gap-1.5 rounded-[5px] border px-2.5 py-1 text-[11px] uppercase tracking-[0.14em]"
              style={rankStyle(stats.level_color)}
            >
              <Star size={10} />
              {formatNumber(stats.stars)}★
            </div>
          </div>

          <div className="w-full rounded-[var(--radius)] border border-[var(--line)] bg-[rgba(243,241,236,0.02)] px-4 py-3">
            <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-[var(--text-faint)]">
              <span>XP Progress</span>
              <span className="font-mono-stat text-[var(--accent)]">{xpPercent.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-sm bg-[rgba(243,241,236,0.06)]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${xpPercent}%` }}
                transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
                className="h-full bg-[var(--accent)]"
              />
            </div>
            <div className="mt-2 text-center font-mono-stat text-xs text-[var(--text-dim)]">
              {formatNumber(stats.xp_progress)} / {formatNumber(stats.xp_to_next_level)}
            </div>
          </div>
        </motion.div>

        <div className="space-y-6">
          <motion.div
            variants={itemVariants}
            className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start"
          >
            <div>
              <div className="mb-1 flex items-center gap-3">
                <img
                  src={avatarUrl(stats.username, 64)}
                  alt={stats.username}
                  className="h-11 w-11 rounded-[7px] border border-[var(--line)]"
                />
                <div>
                  <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--text-faint)]">
                    Player profile
                  </div>
                  <h1 className="font-display text-4xl font-extrabold leading-none text-[var(--text)] sm:text-5xl">
                    {stats.username}
                  </h1>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <span className="chip">
                  <Hash size={12} className="text-[var(--accent)]" />
                  Rank #{stats.rank}
                </span>
                <span className="chip">
                  <Star size={12} style={{ color: stats.level_color || "#9a958c" }} />
                  Level {formatNumber(stats.level)}
                </span>
                <span className="chip">
                  <CalendarClock size={12} />
                  {formatUpdated(stats.updated)}
                </span>
                <span className="chip">
                  <Clock3 size={12} />
                  {stats.time_played}
                </span>
              </div>
            </div>

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
                  className="rounded-[var(--radius)] border border-[var(--line)] bg-[rgba(243,241,236,0.02)] p-3 text-center transition hover:border-[var(--line-strong)]"
                >
                  <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-faint)]">
                    {item.label}
                  </div>
                  <div className="font-mono-stat mt-1.5 text-xl font-bold text-[var(--text)]">
                    {item.value}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

          <motion.div
            variants={containerVariants}
            className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5"
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
                className="rounded-[var(--radius)] border border-[var(--line)] px-4 py-3 transition hover:border-[var(--line-strong)]"
              >
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
                  {label}
                </div>
                <div className="font-mono-stat mt-1.5 text-lg font-bold text-[var(--text)]">
                  {value}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}

export default PlayerCard;
