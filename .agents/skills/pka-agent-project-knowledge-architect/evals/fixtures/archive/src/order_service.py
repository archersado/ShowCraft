ALLOWED = {
    "created": {"paid"},
    "paid": {"allocated", "review_required"},
    "review_required": {"allocated", "completed"},
    "allocated": {"picked"},
    "picked": {"completed"},
}


def transition(order, target, actor, now):
    if target not in ALLOWED.get(order["status"], set()):
        raise ValueError("invalid transition")
    order["status"] = target
    order.setdefault("history", []).append({"status": target, "actor": actor, "at": now})
