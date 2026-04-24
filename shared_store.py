import json
import secrets
from datetime import datetime


RANK_PRIORITY = ("global", "bedwars", "skywars", "lifesteal", "survival", "practice")


def normalize_rank_details(rank_details):
    return {
        str(mode): str(rank)
        for mode, rank in (rank_details or {}).items()
        if mode and rank
    }


def determine_primary_rank(rank_details):
    rank_details = normalize_rank_details(rank_details)
    for mode in RANK_PRIORITY:
        rank = rank_details.get(mode)
        if rank:
            return rank
    return "default"


def rank_payload(rank_details):
    details = normalize_rank_details(rank_details)
    return {
        "primary_rank": determine_primary_rank(details),
        "rank_details": details,
    }


def build_purchase_metadata(user, items, rank_info, payment_method, payment_status, payment_details, source_app):
    now = datetime.now()
    order_code = f"HC-{secrets.token_hex(4).upper()}"
    primary_rank = rank_info.get("primary_rank", "default")
    item_rows = []
    total_usd = 0.0

    for item in items:
        price = float(item.get("price") or item.get("item_price") or 0)
        gamemode = item.get("gamemode") or item.get("subcategory") or item.get("mode") or "global"
        item_rows.append({
            "name": item.get("name") or item.get("item_name") or "Unknown Item",
            "price": price,
            "gamemode": gamemode,
            "item_id": str(item.get("item_id") or item.get("id") or ""),
        })
        total_usd += price

    payment_data = {
        "method": payment_method,
        "status": payment_status,
        **(payment_details or {}),
    }

    details_json = {
        "order_code": order_code,
        "source_app": source_app,
        "created_at": now.isoformat(),
        "payment": payment_data,
        "items": item_rows,
        "primary_rank": primary_rank,
        "rank_details": rank_info.get("rank_details", {}),
    }

    items_desc = ", ".join(
        f"{row['name']} ({row['gamemode']})" if row["gamemode"] else row["name"]
        for row in item_rows
    ) or "No items"
    payment_lines = [f"- Method: {payment_method}", f"- Status: {payment_status}"]
    for key, value in (payment_details or {}).items():
        if value in (None, ""):
            continue
        payment_lines.append(f"- {str(key).replace('_', ' ').title()}: {value}")

    ticket_title = f"Order #{order_code} - {user['username']}"
    ticket_desc = (
        f"Store purchase created from {source_app}.\n\n"
        f"Username: {user['username']}\n"
        f"Email: {user.get('email', '')}\n"
        f"Primary Rank: {primary_rank}\n"
        f"Purchased Items: {items_desc}\n"
        f"Total: ${total_usd:.2f}\n"
        f"Timestamp: {now.strftime('%Y-%m-%d %H:%M:%S')}\n"
        f"Payment Details:\n" + "\n".join(payment_lines)
    )
    system_message = (
        f"Hello **{user['username']}**. Your order `{order_code}` has been created.\n\n"
        f"Please complete payment using **{payment_method.upper()}** and reply here with proof once paid.\n\n"
        f"Items:\n" +
        "\n".join(f"- {row['name']} ({row['gamemode']}) - ${row['price']:.2f}" for row in item_rows) +
        f"\n\nCurrent rank snapshot: **{primary_rank.upper()}**"
    )

    return {
        "order_code": order_code,
        "created_at": now,
        "items": item_rows,
        "items_json": json.dumps(item_rows),
        "details_json": json.dumps(details_json),
        "rank_snapshot": json.dumps(rank_info),
        "ticket_title": ticket_title,
        "ticket_desc": ticket_desc,
        "system_message": system_message,
        "total_usd": total_usd,
        "payment_method": payment_method,
        "payment_status": payment_status,
    }

