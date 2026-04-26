import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DB_NAME = "minecraft_stats"

# In-memory storage for demonstration if MongoDB connection fails
memory_players = []

try:
    client = AsyncIOMotorClient(MONGODB_URL, serverSelectionTimeoutMS=2000)
    db = client[DB_NAME]
    players_collection = db["players"]
except Exception:
    players_collection = None

async def get_player(username: str):
    if players_collection is not None:
        try:
            return await players_collection.find_one({"username": {"$regex": f"^{username}$", "$options": "i"}})
        except Exception:
            pass
    
    # Fallback to memory
    for p in memory_players:
        if p["username"].lower() == username.lower():
            return p
    return None

async def get_top_players(limit: int = 10, sort_by: str = "won"):
    if players_collection is not None:
        try:
            cursor = players_collection.find().sort(sort_by, -1).limit(limit)
            return await cursor.to_list(length=limit)
        except Exception:
            pass
    
    # Fallback to memory
    sorted_players = sorted(memory_players, key=lambda x: x.get(sort_by, 0), reverse=True)
    return sorted_players[:limit]

async def seed_data():
    global memory_players
    sample_data = [
        {
            "_id": "1",
            "username": "KqTF",
            "rank": 1,
            "current_win_streak": 25,
            "top_win_streak": 40,
            "won": 1536,
            "lost": 630,
            "rounds_played": 2050,
            "w_l": 3.72,
            "kills": 8538,
            "top_kill_streak": 56,
            "final_kills": 4244,
            "deaths": 5794,
            "final_deaths": 447,
            "k_d": 1.47,
            "final_k_d": 9.49,
            "beds_destroyed": 1693,
            "time_played": "7d 13h 57m 21s",
            "updated": 1775037200617
        },
        {
            "_id": "2",
            "username": "Technoblade",
            "rank": 2,
            "current_win_streak": 100,
            "top_win_streak": 1400,
            "won": 15000,
            "lost": 500,
            "rounds_played": 15500,
            "w_l": 30.0,
            "kills": 50000,
            "top_kill_streak": 200,
            "final_kills": 25000,
            "deaths": 2000,
            "final_deaths": 100,
            "k_d": 25.0,
            "final_k_d": 250.0,
            "beds_destroyed": 10000,
            "time_played": "50d 10h 20m 10s",
            "updated": 1775037200617
        },
        {
            "_id": "3",
            "username": "Dream",
            "rank": 3,
            "current_win_streak": 10,
            "top_win_streak": 50,
            "won": 5000,
            "lost": 1200,
            "rounds_played": 6200,
            "w_l": 4.16,
            "kills": 15000,
            "top_kill_streak": 80,
            "final_kills": 8000,
            "deaths": 4000,
            "final_deaths": 800,
            "k_d": 3.75,
            "final_k_d": 10.0,
            "beds_destroyed": 4500,
            "time_played": "20d 5h 15m 30s",
            "updated": 1775037200617
        }
    ]
    memory_players = sample_data
    
    if players_collection is not None:
        try:
            count = await players_collection.count_documents({})
            if count == 0:
                await players_collection.insert_many(sample_data)
        except Exception:
            print("MongoDB not available, using in-memory data.")
