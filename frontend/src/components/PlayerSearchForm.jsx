import { useEffect, useRef, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { searchPlayers } from "../lib/api";
import { avatarUrl, formatNumber, formatRatio, rankStyle } from "../lib/formatters";

function PlayerSearchForm({
  value,
  onChange,
  onSubmit,
  placeholder,
  buttonLabel = "Search",
  compact = false
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();

    if (!value.trim()) {
      setSuggestions([]);
      setOpen(false);
      return undefined;
    }

    const timeout = setTimeout(async () => {
      try {
        setLoading(true);
        const results = await searchPlayers(value.trim(), 5, controller.signal);
        setSuggestions(results);
        setOpen(true);
      } catch (_error) {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function pickSuggestion(username) {
    onChange(username);
    setOpen(false);
  }

  return (
    <div className="relative w-full" ref={containerRef}>
      <form onSubmit={onSubmit} className="relative">
        <div className={`glass-panel flex items-center gap-3 ${compact ? "p-2" : "p-3"}`}>
          <Search className="ml-2 shrink-0 text-cyan-300/75" size={compact ? 20 : 24} />
          <input
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onFocus={() => suggestions.length && setOpen(true)}
            placeholder={placeholder}
            className={`w-full bg-transparent outline-none text-white placeholder:text-slate-500 ${compact ? "px-1 py-2 text-base" : "px-1 py-4 text-lg"}`}
          />
          <button
            type="submit"
            className={`rounded-2xl bg-cyan-400 px-5 font-semibold text-slate-950 transition hover:bg-cyan-300 active:scale-[0.98] ${compact ? "py-2" : "py-4"}`}
          >
            {buttonLabel}
          </button>
        </div>
      </form>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.75rem)] z-30 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur-xl">
          {loading && (
            <div className="px-5 py-4 text-sm text-slate-400">Searching players...</div>
          )}
          {!loading && suggestions.length === 0 && (
            <div className="px-5 py-4 text-sm text-slate-400">No matching players found.</div>
          )}
          {!loading &&
            suggestions.map((player) => (
              <button
                key={player.username}
                type="button"
                onClick={() => pickSuggestion(player.username)}
                className="flex w-full items-center justify-between gap-4 border-b border-white/5 px-5 py-4 text-left transition hover:bg-white/5 last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={avatarUrl(player.username, 48)}
                    alt={player.username}
                    className="h-10 w-10 rounded-xl border border-white/10"
                  />
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
                        {player.stars ?? 0} Stars
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right text-xs text-slate-400">
                  <div className="flex items-center justify-end gap-1 text-cyan-300">
                    <Sparkles size={12} />
                    {formatRatio(player.final_k_d)} FKDR
                  </div>
                  <div>{formatNumber(player.won)} wins</div>
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

export default PlayerSearchForm;
