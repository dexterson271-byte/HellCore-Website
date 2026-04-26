import { LayoutDashboard, Search, Swords, Trophy } from "lucide-react";
import { Link, NavLink } from "react-router-dom";

const items = [
  { to: "/", label: "Search", icon: Search },
  { to: "/compare", label: "Compare", icon: Swords },
  { to: "/leaderboard", label: "Leaderboard", icon: Trophy }
];

function Navbar() {
  return (
    <nav className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link to="/" className="flex items-center gap-3">
          <div className="rounded-2xl border border-cyan-300/30 bg-cyan-400/15 p-2.5 shadow-[0_0_40px_rgba(34,211,238,0.15)]">
            <LayoutDashboard className="text-cyan-300" size={22} />
          </div>
          <div>
            <div className="text-lg font-black tracking-tight text-white">McStats</div>
            <div className="text-xs uppercase text-cyan-300/80">McFleet Season 2</div>
          </div>
        </Link>

        <div className="flex items-center gap-2 overflow-x-auto">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm transition ${
                  isActive
                    ? "border-cyan-300/40 bg-cyan-400/15 text-cyan-200"
                    : "border-white/5 bg-white/[0.03] text-slate-300 hover:border-white/10 hover:bg-white/[0.06]"
                }`
              }
            >
              <Icon size={16} />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
