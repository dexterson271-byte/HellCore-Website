import { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";

const colorMap = {
  cyan: { text: "text-[var(--accent)]", bar: "bg-[var(--accent)]" },
  emerald: { text: "text-[var(--accent)]", bar: "bg-[var(--accent)]" },
  violet: { text: "text-[var(--danger)]", bar: "bg-[var(--danger)]" },
  amber: { text: "text-[var(--gold)]", bar: "bg-[var(--gold)]" },
};

function StatBox({ label, value, subtext, icon: Icon, color = "cyan" }) {
  const acc = colorMap[color] || colorMap.cyan;
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [displayed, setDisplayed] = useState(value);

  useEffect(() => {
    const numeric = parseFloat(String(value).replace(/,/g, ""));
    if (isNaN(numeric) || !inView) return;

    const duration = 1100;
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
      else setDisplayed(value);
    }

    requestAnimationFrame(step);
  }, [inView, value]);

  return (
    <div ref={ref} className="panel group relative overflow-hidden p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-faint)]">
          {label}
        </div>
        {Icon ? (
          <Icon size={15} className={`${acc.text} opacity-80`} />
        ) : null}
      </div>

      <div className="font-mono-stat text-3xl font-bold text-[var(--text)]">{displayed}</div>

      {subtext ? (
        <div className={`mt-2 text-sm ${acc.text} opacity-80`}>{subtext}</div>
      ) : null}

      <div
        className={`absolute bottom-0 left-0 h-[2px] w-0 ${acc.bar} transition-all duration-500 group-hover:w-full`}
      />
    </div>
  );
}

export default StatBox;
