import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { searchPlayers } from "../lib/api";
import { avatarUrl, formatNumber, formatRatio, rankStyle } from "../lib/formatters";

function PlayerSearchForm({
  value,
  onChange,
  onSubmit,
  placeholder,
  buttonLabel = "Search",
  compact = false,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
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
        <div
          className={`panel panel-static flex items-center gap-3 transition-[border-color,box-shadow] ${
            compact ? "p-2" : "p-2.5 sm:p-3"
          } ${focused ? "border-[var(--accent)]! shadow-[0_0_0_1px_var(--accent)]" : ""}`}
        >
          <Search
            className={`ml-2 shrink-0 transition-colors ${focused ? "text-[var(--accent)]" : "text-[var(--text-faint)]"}`}
            size={compact ? 18 : 20}
          />
          <input
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onFocus={() => {
              setFocused(true);
              if (suggestions.length) setOpen(true);
            }}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            className={`w-full bg-transparent outline-none text-[var(--text)] placeholder:text-[var(--text-faint)] ${
              compact ? "px-1 py-2 text-base" : "px-1 py-3 text-base sm:text-lg"
            }`}
          />
          <button
            type="submit"
            className={`btn-accent shrink-0 px-4 ${compact ? "py-2 text-sm" : "py-3 text-sm sm:px-5"}`}
          >
            {buttonLabel}
          </button>
        </div>
      </form>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[#0f1319] shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
          {loading && (
            <div className="px-4 py-3 text-sm text-[var(--text-dim)]">Searching players...</div>
          )}
          {!loading && suggestions.length === 0 && (
            <div className="px-4 py-3 text-sm text-[var(--text-dim)]">No matching players found.</div>
          )}
          {!loading &&
            suggestions.map((player) => (
              <button
                key={player.username}
                type="button"
                onClick={() => pickSuggestion(player.username)}
                className="flex w-full items-center justify-between gap-4 border-b border-[var(--line)] px-4 py-3 text-left transition last:border-b-0 hover:bg-[rgba(200,245,66,0.05)]"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={avatarUrl(player.username, 48)}
                    alt={player.username}
                    className="h-9 w-9 rounded-[6px] border border-[var(--line)]"
                  />
                  <div>
                    <div className="font-semibold text-[var(--text)]">{player.username}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {player.custom_rank ? (
                        <span
                          className="rounded-[4px] border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em]"
                          style={rankStyle(player.custom_rank_color)}
                        >
                          {player.custom_rank}
                        </span>
                      ) : null}
                      <span
                        className="rounded-[4px] border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em]"
                        style={rankStyle(player.level_color)}
                      >
                        {player.stars ?? 0}★
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right text-xs text-[var(--text-dim)]">
                  <div className="font-mono-stat text-[var(--accent)]">
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
