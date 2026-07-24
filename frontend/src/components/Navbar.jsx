import { Link, NavLink } from "react-router-dom";

const items = [
  { to: "/", label: "Search", exact: true },
  { to: "/compare", label: "Compare" },
  { to: "/leaderboard", label: "Leaderboard" },
];

function Navbar() {
  return (
    <nav className="sticky top-0 z-40 border-b border-[var(--line)] bg-[#0b0d10]/90 backdrop-blur-md">
      <div className="accent-bar anim-line w-full" />

      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link to="/" className="group flex items-baseline gap-2">
          <span className="font-display text-3xl font-extrabold leading-none tracking-tight text-[var(--text)] transition group-hover:text-[var(--accent)]">
            McStats
          </span>
          <span className="hidden text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)] sm:inline">
            Season 2
          </span>
        </Link>

        <div className="flex items-center gap-1">
          {items.map(({ to, label, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `relative px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "text-[var(--accent)]"
                    : "text-[var(--text-dim)] hover:text-[var(--text)]"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {label}
                  {isActive ? (
                    <span className="absolute inset-x-3 -bottom-[13px] h-[2px] bg-[var(--accent)]" />
                  ) : null}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
