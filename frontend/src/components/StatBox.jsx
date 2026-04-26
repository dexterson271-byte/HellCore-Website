const colorMap = {
  cyan: "from-cyan-400/20 to-transparent text-cyan-200",
  emerald: "from-emerald-400/20 to-transparent text-emerald-200",
  violet: "from-violet-400/20 to-transparent text-violet-200",
  amber: "from-amber-400/20 to-transparent text-amber-200"
};

function StatBox({ label, value, subtext, icon: Icon, color = "cyan" }) {
  return (
    <div className={`glass-panel bg-gradient-to-br ${colorMap[color] || colorMap.cyan} p-5`}>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-xs uppercase tracking-[0.24em] text-slate-400">{label}</div>
        {Icon ? <Icon size={18} className="text-current opacity-80" /> : null}
      </div>
      <div className="text-3xl font-bold text-white">{value}</div>
      {subtext ? <div className="mt-2 text-sm text-slate-400">{subtext}</div> : null}
    </div>
  );
}

export default StatBox;
