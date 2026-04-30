import { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";

const colorMap = {
  cyan: {
    gradient: "from-cyan-400/15 to-transparent",
    text: "text-cyan-200",
    border: "border-cyan-300/15",
    iconBg: "bg-cyan-400/10",
    glow: "group-hover:shadow-[0_0_40px_rgba(34,211,238,0.08)]",
    bar: "from-cyan-400 to-cyan-300",
    orb: "bg-cyan-400/15",
  },
  emerald: {
    gradient: "from-emerald-400/15 to-transparent",
    text: "text-emerald-200",
    border: "border-emerald-300/15",
    iconBg: "bg-emerald-400/10",
    glow: "group-hover:shadow-[0_0_40px_rgba(52,211,153,0.08)]",
    bar: "from-emerald-400 to-emerald-300",
    orb: "bg-emerald-400/15",
  },
  violet: {
    gradient: "from-violet-400/15 to-transparent",
    text: "text-violet-200",
    border: "border-violet-300/15",
    iconBg: "bg-violet-400/10",
    glow: "group-hover:shadow-[0_0_40px_rgba(139,92,246,0.08)]",
    bar: "from-violet-400 to-violet-300",
    orb: "bg-violet-400/15",
  },
  amber: {
    gradient: "from-amber-400/15 to-transparent",
    text: "text-amber-200",
    border: "border-amber-300/15",
    iconBg: "bg-amber-400/10",
    glow: "group-hover:shadow-[0_0_40px_rgba(251,191,36,0.08)]",
    bar: "from-amber-400 to-amber-300",
    orb: "bg-amber-400/15",
  },
};

function StatBox({ label, value, subtext, icon: Icon, color = "cyan" }) {
  const acc = colorMap[color] || colorMap.cyan;

  // Attempt animated count-up if the value is a plain number
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [displayed, setDisplayed] = useState(value);

  useEffect(() => {
    const numeric = parseFloat(String(value).replace(/,/g, ""));
    if (isNaN(numeric) || !inView) return;

    const duration = 1200;
    let start = null;
    const isInteger = Number.isInteger(numeric);

    function step(timestamp) {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = eased * numeric;
      setDisplayed(
        isInteger
          ? new Intl.NumberFormat("en-US").format(Math.floor(current))
          : current.toFixed(2)
      );
      if (progress < 1) requestAnimationFrame(step);
      else setDisplayed(value); // snap to final
    }

    requestAnimationFrame(step);
  }, [inView, value]);

  return (
    <div
      ref={ref}
      className={`glass-panel group relative overflow-hidden bg-gradient-to-br ${acc.gradient} p-5 transition-all duration-300 ${acc.glow}`}
    >
      {/* ambient orb */}
      <div className={`absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl ${acc.orb} opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />

      <div className="relative mb-4 flex items-start justify-between gap-2">
        <div className={`text-xs font-semibold uppercase tracking-[0.24em] text-slate-400`}>{label}</div>
        {Icon ? (
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${acc.border} ${acc.iconBg}`}>
            <Icon size={15} className={acc.text} />
          </div>
        ) : null}
      </div>

      <div className={`relative text-3xl font-black tabular-nums text-white`}>{displayed}</div>

      {subtext ? (
        <div className={`relative mt-2 text-sm ${acc.text} opacity-75`}>{subtext}</div>
      ) : null}

      {/* bottom accent line */}
      <div className={`absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r ${acc.bar} opacity-0 transition-opacity duration-300 group-hover:opacity-30`} />
    </div>
  );
}

export default StatBox;
