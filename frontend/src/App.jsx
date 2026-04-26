import { BrowserRouter, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import PlayerStats from "./pages/PlayerStats";
import Compare from "./pages/Compare";
import Leaderboard from "./pages/Leaderboard";

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#07111f] text-slate-100">
        <Navbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/player/:username" element={<PlayerStats />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
