import { BarChart2, LayoutDashboard, Search, Swords, Trophy } from "lucide-react";
import { Link, NavLink } from "react-router-dom";

const items = [
  { to: "/", label: "Search", icon: Search, exact: true },
  { to: "/compare", label: "Compare", icon: Swords },
  { to: "/leaderboard", label: "Leaderboard", icon: Trophy },
];

function Navbar() {
  return (
    <nav className="sticky top-0 z-40 border-b border-white/[0.07] bg-slate-950/75 backdrop-blur-2xl">
      {/* top accent line */}
      <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />

      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
        {/* Logo */}
        <Link to="/" className="group flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-400/12 shadow-[0_0_28px_rgba(34,211,238,0.15)] transition group-hover:border-cyan-300/40 group-hover:shadow-[0_0_40px_rgba(34,211,238,0.22)]">
            <BarChart2 className="text-cyan-300" size={20} />
          </div>
          <div>
            <div className="text-[17px] font-black tracking-tight text-white leading-none">McStats</div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-cyan-300/70 leading-none mt-0.5">McFleet Season 2</div>
          </div>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {items.map(({ to, label, icon: Icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "border-cyan-300/35 bg-cyan-400/12 text-cyan-200 shadow-[0_0_20px_rgba(34,211,238,0.10)]"
                    : "border-white/[0.05] bg-white/[0.025] text-slate-400 hover:border-white/10 hover:bg-white/[0.05] hover:text-slate-200"
                }`
              }
            >
              <Icon size={15} />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
