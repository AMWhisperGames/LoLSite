"""Per-champion backtest of live matchPredict (team+comfort+blue+style)."""

from __future__ import annotations

import json
import re
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROLE_KEYS = ("top", "jng", "mid", "adc", "sup")
ELO_SCALE = 400.0
TEAM_SCORE_ELO = 14.0
CHAMP_SCORE_ELO = 14.0
BLUE_SIDE_ELO = 12.0
ROSTER_ROLE_W = 0.35
ROSTER_POOL_W = 0.65
CHAMP_SCORE_CLAMP = 15.0
CHAMP_RESIDUAL_CLAMP = 5.0
CHAMP_MIN_GAMES = 6
STYLE_SUB_MULT = 60.0
STYLE_SOFT_MULT = 10.0
STYLE_SUB_MIN = 8
CYCLE = ("pick", "fight", "poke")
WEIGHTS = (3.0, 1.5, 1.0)
SUB_MAJOR = {
    "hook": "pick",
    "skirmish": "pick",
    "burst": "pick",
    "engage": "fight",
    "dive": "fight",
    "protect": "fight",
    "artillery": "poke",
    "siege": "poke",
}
SUBS = list(SUB_MAJOR)
MIN_GAMES = 25


def load_js(path: Path, prefix: str) -> dict:
    text = path.read_text(encoding="utf-8-sig")
    text = text.replace(prefix, "", 1).strip()
    if text.endswith(";"):
        text = text[:-1]
    return json.loads(text)


def player_key(name: str) -> str:
    return re.sub(r"\s+", "", (name or "").lower())


def champ_slug(cid: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (cid or "").lower())


def expected_from_elo(diff: float) -> float:
    return 1.0 / (1.0 + 10.0 ** (-diff / ELO_SCALE))


def load_champ_tags() -> dict[str, list[str]]:
    text = (ROOT / "comp-styles.js").read_text(encoding="utf-8")
    block = re.search(r"var CHAMP = \{([\s\S]*?)\n  \};", text).group(1)
    out = {}
    for line in block.splitlines():
        line = line.strip().rstrip(",")
        m = re.match(r"(\w+):\s*\[([^\]]*)\]", line)
        if not m:
            continue
        out[m.group(1)] = [t.strip().strip("'\"") for t in m.group(2).split(",") if t.strip()]
    return out


def sub_scores(champs, tags):
    sc = {s: 0.0 for s in SUBS}
    for cid in champs or []:
        for i, sub in enumerate(tags.get(cid) or []):
            if sub in sc:
                sc[sub] += WEIGHTS[i] if i < len(WEIGHTS) else 1.0
    return sc


def soft_major(sc):
    m = {k: 0.0 for k in CYCLE}
    for s, v in sc.items():
        m[SUB_MAJOR[s]] += v
    tot = sum(m.values()) or 1.0
    return {k: m[k] / tot for k in CYCLE}


def hard_sub(sc):
    major_scores = {k: 0.0 for k in CYCLE}
    for s, v in sc.items():
        major_scores[SUB_MAJOR[s]] += v
    major = max(CYCLE, key=lambda k: major_scores[k])
    group = [s for s in SUBS if SUB_MAJOR[s] == major]
    return major, max(group, key=lambda s: sc[s])


def cycle_score(a_soft, b_soft) -> float:
    s = 0.0
    for i in range(3):
        atk, vic = CYCLE[i], CYCLE[(i + 1) % 3]
        s += a_soft[atk] * b_soft[vic] - b_soft[atk] * a_soft[vic]
    return s


class Ratings:
    def __init__(self, ratings):
        self.roles = ratings.get("roles") or {}
        self.champs = ratings.get("champs") or {}

    def player_rec(self, name, role):
        key = player_key(name)
        if not key:
            return None
        role_name = (role or "").lower()
        rec = (self.roles.get(role_name) or {}).get(key)
        if rec and rec.get("s") is not None:
            return rec
        best = None
        for r in ROLE_KEYS:
            rec = (self.roles.get(r) or {}).get(key)
            if rec and rec.get("s") is not None:
                if best is None or float(rec["s"]) > float(best["s"]):
                    best = rec
        return best

    def player_score(self, name, role):
        rec = self.player_rec(name, role)
        return float(rec["s"]) if rec and rec.get("s") is not None else None

    def player_team_score(self, name, role):
        rec = self.player_rec(name, role)
        if not rec:
            return None
        role_s = float(rec["s"]) if rec.get("s") is not None else None
        pool_s = float(rec["cs"]) if rec.get("cs") is not None else role_s
        if role_s is None and pool_s is None:
            return None
        if role_s is None:
            return pool_s
        if pool_s is None:
            return role_s
        return ROSTER_ROLE_W * role_s + ROSTER_POOL_W * pool_s

    def champ_residual(self, name, role, champ_id):
        key = player_key(name)
        rec = self.champs.get(champ_slug(champ_id))
        rows = rec.get("players") if rec else None
        if not rows:
            return None
        champ = None
        for row in rows:
            if player_key(row.get("n")) == key:
                if float(row.get("g") or 0) < CHAMP_MIN_GAMES:
                    return None
                champ = max(-CHAMP_SCORE_CLAMP, min(CHAMP_SCORE_CLAMP, float(row["s"])))
                break
        overall = self.player_score(name, role)
        if champ is None or overall is None:
            return None
        return max(-CHAMP_RESIDUAL_CLAMP, min(CHAMP_RESIDUAL_CLAMP, champ - overall))

    def roster(self, rows):
        num = den = 0.0
        for row in rows:
            s = self.player_team_score(row.get("name"), row.get("role"))
            if s is None:
                continue
            num += s
            den += 1
        return num / den if den else None

    def comfort(self, blue, red):
        by = lambda rows: {(r.get("role") or "").lower(): r for r in rows}
        us, them = by(blue), by(red)
        total = 0.0
        for role in ROLE_KEYS:
            b, r = us.get(role), them.get(role)
            bhit = self.champ_residual(b["name"], b["role"], b["id"]) if b else None
            rhit = self.champ_residual(r["name"], r["role"], r["id"]) if r else None
            if bhit is None and rhit is None:
                continue
            total += (bhit or 0.0) - (rhit or 0.0)
        return (total / len(ROLE_KEYS)) * CHAMP_SCORE_ELO


def lineup(game, side):
    champs = game["b"] if side == "blue" else game["r"]
    names = game["bp"] if side == "blue" else game["rp"]
    rows = []
    for i in range(5):
        if not champs or i >= len(champs) or not champs[i]:
            continue
        rows.append(
            {
                "id": champs[i],
                "name": (names[i] if names and i < len(names) else "") or "",
                "role": ROLE_KEYS[i],
            }
        )
    return rows


def style_elo(b_ids, r_ids, tags, h2h):
    bsc, rsc = sub_scores(b_ids, tags), sub_scores(r_ids, tags)
    bsoft, rsoft = soft_major(bsc), soft_major(rsc)
    _, bsub = hard_sub(bsc)
    _, rsub = hard_sub(rsc)
    soft = cycle_score(bsoft, rsoft)
    if bsub == rsub:
        return soft * STYLE_SOFT_MULT, bsub, rsub
    key = f"{bsub}|{rsub}"
    w, n = h2h.get(key, [0, 0])
    if n >= STYLE_SUB_MIN:
        prior = 20.0
        wr = (w + prior * 0.5) / (n + prior)
        edge = (wr - 0.5) * 2
        return edge * STYLE_SUB_MULT, bsub, rsub
    return soft * STYLE_SOFT_MULT, bsub, rsub


def main() -> None:
    print("Loading...", flush=True)
    games_bundle = load_js(ROOT / "pro-games.js", "window.RIFT_PRO_GAMES = ")
    ratings = Ratings(load_js(ROOT / "player-ratings.js", "window.RIFT_PLAYER_RATINGS = "))
    tags = load_champ_tags()
    games = sorted(games_bundle.get("games") or [], key=lambda g: (g.get("d") or "", g.get("g") or ""))
    newest = games_bundle.get("to") or max(g["d"] for g in games if g.get("d"))
    print(f"{len(games)} games -> {newest}", flush=True)

    sub_h2h: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    stats = defaultdict(
        lambda: {
            "n": 0,
            "hits": 0,
            "brier": 0.0,
            "team_won": 0,
            "pred_team_win": 0,
            "roles": defaultdict(int),
        }
    )
    overall = {"n": 0, "hits": 0, "brier": 0.0}
    by_window = {60: {"n": 0, "hits": 0}, 90: {"n": 0, "hits": 0}}
    champ_window = {
        60: defaultdict(lambda: {"n": 0, "hits": 0, "team_won": 0, "pred_team_win": 0}),
        90: defaultdict(lambda: {"n": 0, "hits": 0, "team_won": 0, "pred_team_win": 0}),
    }
    latest = datetime.strptime(newest, "%Y-%m-%d")
    cut60 = (latest - timedelta(days=60)).strftime("%Y-%m-%d")
    cut90 = (latest - timedelta(days=90)).strftime("%Y-%m-%d")

    for i, game in enumerate(games):
        blue, red = lineup(game, "blue"), lineup(game, "red")
        if len(blue) < 5 or len(red) < 5:
            continue
        bs = ratings.roster(blue)
        rs = ratings.roster(red)
        team = (bs - rs) * TEAM_SCORE_ELO if bs is not None and rs is not None else 0.0
        comfort = ratings.comfort(blue, red)
        s_elo, bsub, rsub = style_elo(game["b"], game["r"], tags, sub_h2h)
        elo = team + comfort + BLUE_SIDE_ELO + s_elo
        p = expected_from_elo(elo)

        if abs(p - 0.5) >= 1e-12:
            y = 1.0 if game.get("w") == 1 else 0.0
            hit = int((p > 0.5) == (y == 1.0))
            pred_blue = p > 0.5
            overall["n"] += 1
            overall["hits"] += hit
            overall["brier"] += (p - y) ** 2
            d = game.get("d") or ""
            for cut, bucket in ((cut60, by_window[60]), (cut90, by_window[90])):
                if d >= cut:
                    bucket["n"] += 1
                    bucket["hits"] += hit

            for rows, team_won, side_fav in (
                (blue, y == 1.0, pred_blue),
                (red, y == 0.0, not pred_blue),
            ):
                for row in rows:
                    cid = row["id"]
                    st = stats[cid]
                    st["n"] += 1
                    st["hits"] += hit
                    st["brier"] += (p - y) ** 2
                    st["roles"][row["role"]] += 1
                    if team_won:
                        st["team_won"] += 1
                    if side_fav:
                        st["pred_team_win"] += 1
                    for cut, cwin in ((cut60, champ_window[60]), (cut90, champ_window[90])):
                        if d >= cut:
                            rec = cwin[cid]
                            rec["n"] += 1
                            rec["hits"] += hit
                            if team_won:
                                rec["team_won"] += 1
                            if side_fav:
                                rec["pred_team_win"] += 1

        if bsub != rsub:
            bw = game.get("w") == 1
            ab, ba = f"{bsub}|{rsub}", f"{rsub}|{bsub}"
            if bw:
                sub_h2h[ab][0] += 1
                sub_h2h[ab][1] += 1
                sub_h2h[ba][1] += 1
            else:
                sub_h2h[ba][0] += 1
                sub_h2h[ba][1] += 1
                sub_h2h[ab][1] += 1
        if (i + 1) % 400 == 0:
            print(f"  {i + 1}/{len(games)}", flush=True)

    print("\n=== overall ===", flush=True)
    print(
        f"  season  acc={overall['hits'] / overall['n'] * 100:5.1f}%  "
        f"brier={overall['brier'] / overall['n']:.4f}  n={overall['n']}",
        flush=True,
    )
    for days in (90, 60):
        b = by_window[days]
        if b["n"]:
            print(f"  {days}d     acc={b['hits'] / b['n'] * 100:5.1f}%  n={b['n']}", flush=True)

    base_acc = overall["hits"] / overall["n"]
    rows = []
    for cid, st in stats.items():
        if st["n"] < MIN_GAMES:
            continue
        acc = st["hits"] / st["n"]
        wr = st["team_won"] / st["n"]
        pred_wr = st["pred_team_win"] / st["n"]
        role = max(st["roles"], key=st["roles"].get)
        w60 = champ_window[60][cid]
        a60 = w60["hits"] / w60["n"] if w60["n"] >= 15 else None
        rows.append(
            {
                "id": cid,
                "n": st["n"],
                "acc": acc,
                "gap": acc - base_acc,
                "brier": st["brier"] / st["n"],
                "wr": wr,
                "pred_wr": pred_wr,
                "bias": pred_wr - wr,
                "role": role,
                "n60": w60["n"],
                "a60": a60,
            }
        )

    rows.sort(key=lambda r: (r["acc"], -r["n"]))
    print(
        f"\n=== worst accuracy (season, n>={MIN_GAMES}, baseline {base_acc * 100:.1f}%) ===",
        flush=True,
    )
    print(
        f"{'champ':16} {'acc':>6} {'gap':>6} {'n':>5} {'wr':>6} {'pred':>6} "
        f"{'bias':>6} {'60d':>6} {'n60':>4} role",
        flush=True,
    )
    for r in rows[:30]:
        a60 = f"{r['a60'] * 100:5.1f}%" if r["a60"] is not None else "   - "
        print(
            f"{r['id']:16} {r['acc'] * 100:5.1f}% {r['gap'] * 100:+5.1f} {r['n']:5d} "
            f"{r['wr'] * 100:5.1f}% {r['pred_wr'] * 100:5.1f}% {r['bias'] * 100:+5.1f} "
            f"{a60} {r['n60']:4d} {r['role']}",
            flush=True,
        )

    print(f"\n=== best accuracy (season, n>={MIN_GAMES}) ===", flush=True)
    print(
        f"{'champ':16} {'acc':>6} {'gap':>6} {'n':>5} {'wr':>6} {'pred':>6} {'bias':>6} role",
        flush=True,
    )
    for r in rows[-15:][::-1]:
        print(
            f"{r['id']:16} {r['acc'] * 100:5.1f}% {r['gap'] * 100:+5.1f} {r['n']:5d} "
            f"{r['wr'] * 100:5.1f}% {r['pred_wr'] * 100:5.1f}% {r['bias'] * 100:+5.1f} {r['role']}",
            flush=True,
        )

    base60 = by_window[60]["hits"] / by_window[60]["n"]
    rows60 = []
    for cid, st in champ_window[60].items():
        if st["n"] < 20:
            continue
        wr = st["team_won"] / st["n"]
        pred_wr = st["pred_team_win"] / st["n"]
        rows60.append(
            {
                "id": cid,
                "n": st["n"],
                "acc": st["hits"] / st["n"],
                "gap": st["hits"] / st["n"] - base60,
                "role": max(stats[cid]["roles"], key=stats[cid]["roles"].get),
                "bias": pred_wr - wr,
            }
        )
    rows60.sort(key=lambda r: (r["acc"], -r["n"]))
    print(f"\n=== worst accuracy (60d, n>=20, baseline {base60 * 100:.1f}%) ===", flush=True)
    print(f"{'champ':16} {'acc':>6} {'gap':>6} {'n':>5} {'bias':>6} role", flush=True)
    for r in rows60[:25]:
        print(
            f"{r['id']:16} {r['acc'] * 100:5.1f}% {r['gap'] * 100:+5.1f} {r['n']:5d} "
            f"{r['bias'] * 100:+5.1f} {r['role']}",
            flush=True,
        )

    print(f"\n=== most overrated (pred WR - actual WR, n>={MIN_GAMES}) ===", flush=True)
    print(f"{'champ':16} {'bias':>6} {'pred':>6} {'wr':>6} {'acc':>6} {'n':>5}", flush=True)
    for r in sorted(rows, key=lambda r: -r["bias"])[:15]:
        print(
            f"{r['id']:16} {r['bias'] * 100:+5.1f} {r['pred_wr'] * 100:5.1f}% "
            f"{r['wr'] * 100:5.1f}% {r['acc'] * 100:5.1f}% {r['n']:5d}",
            flush=True,
        )

    print(f"\n=== most underrated (actual - pred, n>={MIN_GAMES}) ===", flush=True)
    print(f"{'champ':16} {'bias':>6} {'pred':>6} {'wr':>6} {'acc':>6} {'n':>5}", flush=True)
    for r in sorted(rows, key=lambda r: r["bias"])[:15]:
        print(
            f"{r['id']:16} {r['bias'] * 100:+5.1f} {r['pred_wr'] * 100:5.1f}% "
            f"{r['wr'] * 100:5.1f}% {r['acc'] * 100:5.1f}% {r['n']:5d}",
            flush=True,
        )

    print(
        f"\n=== worst by primary role (season bottom quartile, n>={MIN_GAMES}) ===",
        flush=True,
    )
    q = sorted(rows, key=lambda r: r["acc"])
    bottom = q[: max(1, len(q) // 4)]
    by_role = defaultdict(list)
    for r in bottom:
        by_role[r["role"]].append(r["id"])
    for role in ROLE_KEYS:
        ids = by_role.get(role) or []
        print(f"  {role}: {', '.join(ids) if ids else '-'}", flush=True)

    print(f"\nchamps ranked: {len(rows)} (of {len(stats)} distinct)", flush=True)


if __name__ == "__main__":
    main()
