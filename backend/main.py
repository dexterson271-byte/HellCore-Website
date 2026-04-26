from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import database
import models

app = FastAPI(title="Minecraft Stats API")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_db_client():
    await database.seed_data()

@app.get("/api/player/{username}", response_model=models.PlayerStats)
async def get_player_stats(username: str):
    player = await database.get_player(username)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    # MongoDB _id needs to be handled or removed for Pydantic
    player["id"] = str(player["_id"])
    return player

@app.get("/api/compare")
async def compare_players(p1: str, p2: str):
    player1 = await database.get_player(p1)
    player2 = await database.get_player(p2)
    
    if not player1 or not player2:
        missing = []
        if not player1: missing.append(p1)
        if not player2: missing.append(p2)
        raise HTTPException(status_code=404, detail=f"Player(s) not found: {', '.join(missing)}")
    
    player1["id"] = str(player1["_id"])
    player2["id"] = str(player2["_id"])
    
    return {"player1": player1, "player2": player2}

@app.get("/api/leaderboard", response_model=List[models.PlayerStats])
async def get_leaderboard(limit: int = 10, sort_by: str = "won"):
    players = await database.get_top_players(limit, sort_by)
    for p in players:
        p["id"] = str(p["_id"])
    return players

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
