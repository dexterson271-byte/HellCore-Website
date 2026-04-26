import { CalendarClock, Clock3, Hash, Sparkles, Star } from "lucide-react";
import { avatarUrl, bodyUrl, formatNumber, formatRatio, formatUpdated, rankStyle } from "../lib/formatters";

function PlayerCard({ stats }) {
  return (
    <section className="glass-panel relative overflow-hidden p-6 sm:p-8">
      <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_55%)]" />
      <div className="relative grid gap-8 lg:grid-cols-[260px_1fr]">
        <div className="flex flex-col items-center justify-center">
          <img
            src={bodyUrl(stats.username)}
            alt={stats.username}
            className="h-auto w-48 drop-shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
          />
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {stats.custom_rank ? (
              <div
                className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs uppercase tracking-[0.2em]"
                style={rankStyle(stats.custom_rank_color)}
              >
                <Sparkles size={12} />
                {stats.custom_rank}
              </div>
            ) : null}
            <div
              className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs uppercase tracking-[0.2em]"
              style={rankStyle(stats.level_color)}
            >
              <Star size={12} />
              {formatNumber(stats.stars)} Stars
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
            <div>
              <div className="mb-3 flex items-center gap-3">
                <img
                  src={avatarUrl(stats.username, 64)}
                  alt={stats.username}
                  className="h-12 w-12 rounded-2xl border border-white/10"
                />
                <div>
                  <div className="text-sm uppercase tracking-[0.28em] text-cyan-300/70">Player profile</div>
                  <h1 className="text-4xl font-black text-white">{stats.username}</h1>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 text-sm text-slate-300">
                <div className="chip">
                  <Hash size={14} className="text-cyan-300" />
                  Placement #{stats.rank}
                </div>
                <div className="chip">
                  <Star size={14} style={{ color: stats.level_color }} />
                  Level {formatNumber(stats.level)}
                </div>
                <div className="chip">
                  <CalendarClock size={14} className="text-violet-300" />
                  {formatUpdated(stats.updated)}
                </div>
                <div className="chip">
                  <Clock3 size={14} className="text-emerald-300" />
                  {stats.time_played}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:min-w-[360px]">
              {[ 
                { label: "Stars", value: formatNumber(stats.stars) },
                { label: "W/L", value: formatRatio(stats.w_l) },
                { label: "K/D", value: formatRatio(stats.k_d) },
                { label: "FKDR", value: formatRatio(stats.final_k_d) },
                { label: "Wins", value: formatNumber(stats.won) }
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{item.label}</div>
                  <div className="mt-2 text-2xl font-bold text-white">{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Current WS", formatNumber(stats.current_win_streak)],
              ["Top WS", formatNumber(stats.top_win_streak)],
              ["Final Kills", formatNumber(stats.final_kills)],
              ["Beds Destroyed", formatNumber(stats.beds_destroyed)],
              ["XP Progress", `${formatNumber(stats.xp_progress)} / ${formatNumber(stats.xp_to_next_level)}`]
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <div className="text-sm text-slate-400">{label}</div>
                <div className="mt-2 text-xl font-semibold text-white">{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default PlayerCard;
