"""Tune Pick/Fight/Poke style weight on top of live matchPredict."""

from __future__ import annotations

import json
import math
import re
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROLE_KEYS = ("top", "jng", "mid", "adc", "sup")
ELO_SCALE = 400.0
CHAMP_SCORE_CLAMP = 15.0
CHAMP_RESIDUAL_CLAMP = 5.0
CHAMP_MIN_GAMES = 6
TEAM_SCORE_ELO = 18.0
CHAMP_SCORE_ELO = 9.0
BLUE_SIDE_ELO = 10.0
CYCLE = ("pick", "fight", "poke")
BEATS = {"pick": "fight", "fight": "poke", "poke": "pick"}
WEIGHTS = (3.0, 1.5, 1.0)


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


def hard_cycle_sign(bm, rm) -> float:
    if bm == rm:
        return 0.0
    if BEATS[bm] == rm:
        return 1.0
    if BEATS[rm] == bm:
        return -1.0
    return 0.0


class Ratings:
    def __init__(self, ratings):
        self.roles = ratings.get("roles") or {}
        self.champs = ratings.get("champs") or {}

    def player_score(self, name, role):
        key = player_key(name)
        if not key:
            return None
        role_name = (role or "").lower()
        rec = (self.roles.get(role_name) or {}).get(key)
        if rec and rec.get("s") is not None:
            return float(rec["s"])
        best = None
        for r in ROLE_KEYS:
            rec = (self.roles.get(r) or {}).get(key)
            if rec and rec.get("s") is not None:
                s = float(rec["s"])
                if best is None or s > best:
                    best = s
        return best

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
            s = self.player_score(row.get("name"), row.get("role"))
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
        rows.append({"id": champs[i], "name": (names[i] if names and i < len(names) else "") or "", "role": ROLE_KEYS[i]})
    return rows


def window_rows(rows, newest: str, days: int | None):
    if days is None:
        return rows
    latest = datetime.strptime(newest, "%Y-%m-%d")
    cutoff = (latest - timedelta(days=days)).strftime("%Y-%m-%d")
    return [r for r in rows if r["d"] >= cutoff]


def score(rows, style_key: str, style_mult: float):
    hits = n = 0
    brier = 0.0
    for row in rows:
        elo = row["base"] + style_mult * row[style_key]
        p = expected_from_elo(elo)
        if abs(p - 0.5) < 1e-12:
            continue
        y = row["y"]
        n += 1
        hits += int((p > 0.5) == (y == 1.0))
        brier += (p - y) ** 2
    if not n:
        return {"n": 0, "acc": 0.0, "brier": 1.0}
    return {"n": n, "acc": hits / n, "brier": brier / n}


def fmt(rec):
    return f"acc={rec['acc']*100:5.1f}%  brier={rec['brier']:.4f}  n={rec['n']}"


def main() -> None:
    print("Loading...", flush=True)
    games_bundle = load_js(ROOT / "pro-games.js", "window.RIFT_PRO_GAMES = ")
    ratings = Ratings(load_js(ROOT / "player-ratings.js", "window.RIFT_PLAYER_RATINGS = "))
    tags = load_champ_tags()
    games = sorted(games_bundle.get("games") or [], key=lambda g: (g.get("d") or "", g.get("g") or ""))
    newest = games_bundle.get("to") or max(g["d"] for g in games if g.get("d"))
    print(f"{len(games)} games -> {newest}", flush=True)

    # Expanding-window sub H2H for honest style_sub feature
    sub_h2h = defaultdict(lambda: [0, 0])  # (a,b) wins, games for a vs b
    rows = []
    for i, game in enumerate(games):
        blue, red = lineup(game, "blue"), lineup(game, "red")
        if len(blue) < 5 or len(red) < 5:
            continue
        bs = ratings.roster(blue)
        rs = ratings.roster(red)
        team = (bs - rs) * TEAM_SCORE_ELO if bs is not None and rs is not None else 0.0
        comfort = ratings.comfort(blue, red)
        base = team + comfort + BLUE_SIDE_ELO

        bsc = sub_scores(game["b"], tags)
        rsc = sub_scores(game["r"], tags)
        bsoft, rsoft = soft_major(bsc), soft_major(rsc)
        bm, bsub = hard_sub(bsc)
        rm, rsub = hard_sub(rsc)
        soft = cycle_score(bsoft, rsoft)
        hard = hard_cycle_sign(bm, rm)

        # Expanding-window empirical sub edge for blue
        w, n = sub_h2h[(bsub, rsub)]
        if bsub != rsub and n >= 8:
            wr = w / n
            # shrink to 50%
            prior = 20.0
            wr_s = (w + prior * 0.5) / (n + prior)
            sub_edge = (wr_s - 0.5) * 2.0  # ~[-1,1]
        else:
            sub_edge = 0.0

        # Major empirical expanding
        mw, mn = sub_h2h[(bm, rm)]  # reuse dict with major keys mixed? separate
        # use dedicated major table
        # (filled below after append using major keys prefixed)
        rows.append(
            {
                "d": game.get("d") or "",
                "y": 1.0 if game.get("w") == 1 else 0.0,
                "base": base,
                "soft": soft,
                "hard": hard,
                "sub": sub_edge,
                "bsub": bsub,
                "rsub": rsub,
                "bm": bm,
                "rm": rm,
            }
        )

        # update tables AFTER feature (no leakage)
        bw = game.get("w") == 1
        if bsub != rsub:
            if bw:
                sub_h2h[(bsub, rsub)][0] += 1
                sub_h2h[(bsub, rsub)][1] += 1
                sub_h2h[(rsub, bsub)][1] += 1
            else:
                sub_h2h[(rsub, bsub)][0] += 1
                sub_h2h[(rsub, bsub)][1] += 1
                sub_h2h[(bsub, rsub)][1] += 1
        if bm != rm:
            if bw:
                sub_h2h[("M:" + bm, "M:" + rm)][0] += 1
                sub_h2h[("M:" + bm, "M:" + rm)][1] += 1
                sub_h2h[("M:" + rm, "M:" + bm)][1] += 1
            else:
                sub_h2h[("M:" + rm, "M:" + bm)][0] += 1
                sub_h2h[("M:" + rm, "M:" + bm)][1] += 1
                sub_h2h[("M:" + bm, "M:" + rm)][1] += 1

        if (i + 1) % 400 == 0:
            print(f"  {i+1}/{len(games)}", flush=True)

    # Recompute major_emp with expanding window properly
    maj_h2h = defaultdict(lambda: [0, 0])
    for row in rows:
        bm, rm = row["bm"], row["rm"]
        w, n = maj_h2h[(bm, rm)]
        if bm != rm and n >= 12:
            prior = 30.0
            wr_s = (w + prior * 0.5) / (n + prior)
            row["maj"] = (wr_s - 0.5) * 2.0
        else:
            row["maj"] = 0.0
        bw = row["y"] == 1.0
        if bm != rm:
            if bw:
                maj_h2h[(bm, rm)][0] += 1
                maj_h2h[(bm, rm)][1] += 1
                maj_h2h[(rm, bm)][1] += 1
            else:
                maj_h2h[(rm, bm)][0] += 1
                maj_h2h[(rm, bm)][1] += 1
                maj_h2h[(bm, rm)][1] += 1

    # Blend features
    for row in rows:
        row["blend"] = row["soft"] + 0.65 * row["sub"]
        row["blend2"] = 0.5 * row["soft"] + 0.5 * row["sub"] + 0.35 * row["maj"]
        row["blend3"] = row["hard"] * 0.25 + row["soft"] + 0.5 * row["sub"]

    windows = [("season", None), ("90d", 90), ("60d", 60), ("30d", 30)]
    split = {label: window_rows(rows, newest, days) for label, days in windows}

    print("\n=== baseline (live, no style) ===", flush=True)
    for label, _ in windows:
        print(f"  {label:<7} {fmt(score(split[label], 'soft', 0.0))}", flush=True)

    features = ["soft", "hard", "sub", "maj", "blend", "blend2", "blend3"]
    mults = [0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100, 120]

    print("\n=== best STYLE_MULT by feature (optimize 60d acc, tie-break brier) ===", flush=True)
    best_overall = None
    for feat in features:
        best = None
        for m in mults:
            rec = score(split["60d"], feat, float(m))
            cand = (rec["acc"], -rec["brier"], m, rec)
            if best is None or cand > best:
                best = cand
        _, _, m, rec = best
        print(f"  {feat:<7} mult={m:<4} {fmt(rec)}", flush=True)
        # report other windows at that mult
        for label, _ in windows:
            if label == "60d":
                continue
            print(f"           {label:<7} {fmt(score(split[label], feat, float(m)))}", flush=True)
        key = (best[0], -best[1], feat, m)
        if best_overall is None or key > best_overall[:2] + best_overall[2:]:
            best_overall = (best[0], -best[1], feat, m)

    feat, m = best_overall[2], best_overall[3]
    print(f"\n=== WINNER: {feat} @ mult={m} ===", flush=True)
    base60 = score(split["60d"], "soft", 0.0)
    win60 = score(split["60d"], feat, float(m))
    print(f"  baseline 60d {fmt(base60)}", flush=True)
    print(f"  styled   60d {fmt(win60)}", flush=True)
    print(f"  lift {100*(win60['acc']-base60['acc']):+.2f}pp  brier {win60['brier']-base60['brier']:+.4f}", flush=True)

    # Also check if style helps when |team elo| is small
    print("\n=== 60d by |base elo| @ winner ===", flush=True)
    for lo, hi, name in ((0, 20, "0-20"), (20, 50, "20-50"), (50, 100, "50-100"), (100, 1e9, "100+")):
        bucket = [r for r in split["60d"] if lo <= abs(r["base"]) < hi]
        b0 = score(bucket, "soft", 0.0)
        b1 = score(bucket, feat, float(m))
        print(f"  {name:<7} n={len(bucket):<4} base {fmt(b0)} | style {fmt(b1)} lift {100*(b1['acc']-b0['acc']):+.1f}pp", flush=True)


if __name__ == "__main__":
    main()
