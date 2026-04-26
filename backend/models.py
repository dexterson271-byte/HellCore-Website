from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class PlayerStats(BaseModel):
    username: str
    rank: int
    current_win_streak: int
    top_win_streak: int
    won: int
    lost: int
    rounds_played: int
    w_l: float
    kills: int
    top_kill_streak: int
    final_kills: int
    deaths: int
    final_deaths: int
    k_d: float
    final_k_d: float
    beds_destroyed: int
    time_played: str
    updated: int

class LeaderboardEntry(BaseModel):
    username: str
    won: int
    k_d: float
    final_k_d: float
    rank: int
