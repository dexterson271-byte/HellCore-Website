import json
import secrets
import os
import requests
import threading
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
    if payment_method.lower() == "upi":
        amount_inr = payment_details.get("amount_inr", "0.00")
        upi_id = payment_details.get("upi_id", "lakshitdhirani@fam")
        rank_names = ", ".join(r['name'] for r in item_rows) or "Items"
        
        system_message = (
            f"Hello **{user['username']}**!\n\n"
            f"To complete your purchase of **{rank_names}**, please follow these steps:\n\n"
            f"1. **Pay via UPI**: Send **₹{amount_inr}** to UPI ID: `{upi_id}`\n"
            f"2. **Attach Screenshot**: Once paid, reply to this ticket with a screenshot of the transaction.\n\n"
            f"An administrator will verify your payment and grant your rank manually. Thank you!"
        )
    else:
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


def notify_discord_ticket(ticket_id, title, description, author_name, category="general", order_code=None):
    """Sends a Discord notification via webhook for a new ticket."""
    webhook_url = os.environ.get("STAFF_WEBHOOK", "").strip()
    if not webhook_url:
        return

    public_base = (os.environ.get("WEBSITE_PUBLIC_URL") or "https://www.hellcore.net").strip().rstrip("/")
    if public_base in ("https://hellcore.net", "http://hellcore.net"):
        public_base = "https://www.hellcore.net"
    ticket_url = f"{public_base}/tickets?id={ticket_id}"

    def run():
        try:
            color = 0x3498db # Blue (General)
            if category == "purchase": color = 0x2ecc71 # Green (Purchase)
            elif category == "bug": color = 0xe74c3c # Red (Bug)

            content = f"🎫 **New Ticket #{ticket_id}** created by **{author_name}**"
            if category == "purchase":
                content = f"🛒 **New Order Ticket #{ticket_id}** by **{author_name}**"

            embed = {
                "title": title,
                "description": description[:1000],
                "url": ticket_url,
                "color": color,
                "fields": [
                    {"name": "Category", "value": category.capitalize(), "inline": True},
                    {"name": "Author", "value": author_name, "inline": True},
                    {"name": "Open Ticket", "value": f"[View on website]({ticket_url})", "inline": False},
                ],
                "footer": {"text": f"Hellcore Ticket System • ID: {ticket_id}"},
                "timestamp": datetime.utcnow().isoformat()
            }

            if order_code:
                embed["fields"].append({"name": "Order Code", "value": f"`{order_code}`", "inline": True})

            requests.post(webhook_url, json={"content": content, "embeds": [embed]}, timeout=5)
        except Exception:
            pass

    threading.Thread(target=run, daemon=True).start()
