"""Backtest matchPredict weights on stored pro games."""

from __future__ import annotations

import json
import math
import re
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROLE_KEYS = ("top", "jng", "mid", "adc", "sup")
ELO_SCALE = 400.0
CHAMP_SCORE_CLAMP = 15.0
CHAMP_RESIDUAL_CLAMP = 5.0
CHAMP_MIN_GAMES = 6


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


def clamp_prob(p: float) -> float:
    return max(0.01, min(0.99, p))


def elo_from_delta(delta: float) -> float:
    p = clamp_prob(0.5 + (delta or 0.0) / 100.0)
    return ELO_SCALE * math.log10(p / (1.0 - p))


def expected_from_elo(diff: float) -> float:
    return 1.0 / (1.0 + 10.0 ** (-diff / ELO_SCALE))


def matchup_rec(table: dict, us: str, them: str):
    direct = (table.get(us) or {}).get(them)
    if direct and isinstance(direct.get("delta"), (int, float)):
        return {"delta": float(direct["delta"]), "games": float(direct.get("games") or 0)}
    inverse = (table.get(them) or {}).get(us)
    if inverse and isinstance(inverse.get("delta"), (int, float)):
        return {"delta": -float(inverse["delta"]), "games": float(inverse.get("games") or 0)}
    return None


def synergy_rec(table: dict, us: str, them: str):
    direct = (table.get(us) or {}).get(them)
    if direct and isinstance(direct.get("delta"), (int, float)):
        return direct
    inverse = (table.get(them) or {}).get(us)
    if inverse and isinstance(inverse.get("delta"), (int, float)):
        return inverse
    return None


def lane_weight(us_role: str, them_role: str) -> float:
    if us_role and them_role:
        return 1.0 if us_role.lower() == them_role.lower() else 0.2
    return 0.35


def pairing_of(rows, synergies, pair_prior: float):
    elo_num = den = 0.0
    for i in range(len(rows)):
        for j in range(i + 1, len(rows)):
            entry = synergy_rec(synergies, rows[i]["id"], rows[j]["id"])
            if not entry:
                continue
            games = float(entry.get("games") or 0)
            conf = games / (games + pair_prior) if pair_prior else 1.0
            elo_num += elo_from_delta(float(entry["delta"])) * conf
            den += conf
    return elo_num / den if den else 0.0


def counter_of(us_rows, them_rows, matchups, pair_prior: float, floor: float, exclude_win: int | None = None):
    elo_num = den = 0.0
    for us in us_rows:
        for them in them_rows:
            rec = matchup_rec(matchups, us["id"], them["id"])
            if not rec:
                continue
            games = float(rec["games"])
            delta = float(rec["delta"])
            if exclude_win is not None and games > 0:
                # Leave-one-out: remove this game from the OE aggregate.
                wins = (delta / 100.0 + 0.5) * games
                games = max(0.0, games - 1.0)
                if games < 3:
                    continue
                wins = max(0.0, min(games, wins - (1.0 if exclude_win else 0.0)))
                delta = (wins / games - 0.5) * 100.0
            conf = games / (games + pair_prior) if pair_prior else 1.0
            weight = lane_weight(us.get("role"), them.get("role")) * max(conf, floor)
            elo_num += elo_from_delta(delta) * weight
            den += weight
    return elo_num / den if den else 0.0


class Features:
    def __init__(self, counters, synergies, oe_matchups, ratings):
        self.counters = counters
        self.synergies = synergies
        self.oe_matchups = oe_matchups
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

    def roster_score(self, rows):
        num = den = 0.0
        for row in rows:
            s = self.player_score(row.get("name"), row.get("role"))
            if s is None:
                continue
            num += s
            den += 1
        return num / den if den else None

    def champ_mean(self, blue, red):
        by_role = lambda rows: {(r.get("role") or "").lower(): r for r in rows}
        us, them = by_role(blue), by_role(red)
        total = 0.0
        for role in ROLE_KEYS:
            b = us.get(role)
            r = them.get(role)
            bhit = self.champ_residual(b["name"], b["role"], b["id"]) if b else None
            rhit = self.champ_residual(r["name"], r["role"], r["id"]) if r else None
            if bhit is None and rhit is None:
                continue
            total += (bhit or 0.0) - (rhit or 0.0)
        return total / len(ROLE_KEYS)

    def extract(self, blue, red, blue_won: int | None = None):
        counter = counter_of(blue, red, self.counters, 400.0, 0.15)
        pair = pairing_of(blue, self.synergies, 400.0) - pairing_of(red, self.synergies, 400.0)
        counter_tight = counter_of(blue, red, self.counters, 800.0, 0.10)
        oe = counter_of(blue, red, self.oe_matchups, 40.0, 0.05)
        oe_tight = counter_of(blue, red, self.oe_matchups, 80.0, 0.05)
        oe_loo = counter_of(blue, red, self.oe_matchups, 40.0, 0.05, exclude_win=blue_won)
        oe_tight_loo = counter_of(blue, red, self.oe_matchups, 80.0, 0.05, exclude_win=blue_won)
        bs = self.roster_score(blue)
        rs = self.roster_score(red)
        team = (bs - rs) if bs is not None and rs is not None else 0.0
        comfort = self.champ_mean(blue, red)
        return {
            "draft": counter + pair,
            "draft_nosyn": counter,
            "draft_tight": counter_tight + pair,
            "oe": oe,
            "oe_tight": oe_tight,
            "oe_loo": oe_loo,
            "oe_tight_loo": oe_tight_loo,
            "team": team,
            "comfort": comfort,
        }


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


def score_rows(rows, mix):
    hits = n = 0
    brier = 0.0
    for row in rows:
        elo = (
            mix.get("draft", 0.0) * row["draft"]
            + mix.get("draft_nosyn", 0.0) * row["draft_nosyn"]
            + mix.get("draft_tight", 0.0) * row["draft_tight"]
            + mix.get("oe", 0.0) * row["oe"]
            + mix.get("oe_tight", 0.0) * row["oe_tight"]
            + mix.get("oe_loo", 0.0) * row["oe_loo"]
            + mix.get("oe_tight_loo", 0.0) * row["oe_tight_loo"]
            + mix.get("team", 0.0) * row["team"]
            + mix.get("comfort", 0.0) * row["comfort"]
            + mix.get("blue", 0.0)
        )
        p = expected_from_elo(elo)
        if abs(p - 0.5) < 1e-12:
            continue
        y = row["y"]
        n += 1
        hits += int((p > 0.5) == (y == 1.0))
        brier += (p - y) ** 2
    if not n:
        return {"n": 0, "acc": 0.0, "brier": 1.0, "hits": 0}
    return {"n": n, "acc": hits / n, "brier": brier / n, "hits": hits}


def window_rows(rows, newest: str, days: int | None):
    if days is None:
        return rows
    latest = datetime.strptime(newest, "%Y-%m-%d")
    cutoff = (latest - timedelta(days=days)).strftime("%Y-%m-%d")
    return [r for r in rows if r["d"] >= cutoff]


def fmt(rec):
    return f"acc={rec['acc']*100:5.1f}%  brier={rec['brier']:.4f}  n={rec['n']}"


def mix_str(mix):
    bits = []
    for key in (
        "draft",
        "draft_nosyn",
        "draft_tight",
        "oe",
        "oe_tight",
        "oe_loo",
        "oe_tight_loo",
        "team",
        "comfort",
        "blue",
    ):
        val = mix.get(key, 0)
        if val:
            bits.append(f"{key}={val}")
    return " ".join(bits) or "zero"


def main() -> None:
    print("Loading data...", flush=True)
    games_bundle = load_js(ROOT / "pro-games.js", "window.RIFT_PRO_GAMES = ")
    print("  games ok", flush=True)
    counters = load_js(ROOT / "counters.js", "window.RIFT_COUNTERS = ")
    print("  counters ok", flush=True)
    synergies = load_js(ROOT / "synergies.js", "window.RIFT_SYNERGIES = ")
    print("  synergies ok", flush=True)
    ratings = load_js(ROOT / "player-ratings.js", "window.RIFT_PLAYER_RATINGS = ")
    oracles = load_js(ROOT / "oracles.js", "window.RIFT_ORACLES = ")
    games = games_bundle.get("games") or []
    newest = games_bundle.get("to") or max(g["d"] for g in games if g.get("d"))
    feat = Features(
        counters.get("matchups") or {},
        synergies.get("synergies") or {},
        oracles.get("matchups") or {},
        ratings,
    )
    print(f"{len(games)} games  {games_bundle.get('from')} -> {newest}", flush=True)
    print("Extracting features...", flush=True)
    rows = []
    for i, game in enumerate(games):
        blue_won = 1 if game.get("w") == 1 else 0
        rec = feat.extract(lineup(game, "blue"), lineup(game, "red"), blue_won=blue_won)
        rec["y"] = 1.0 if blue_won else 0.0
        rec["d"] = game.get("d") or ""
        rec["l"] = game.get("l") or ""
        rec["g"] = game.get("g") or ""
        rec["bt"] = game.get("bt") or ""
        rec["rt"] = game.get("rt") or ""
        rows.append(rec)
        if (i + 1) % 400 == 0:
            print(f"  {i + 1}/{len(games)}", flush=True)
    print("  done", flush=True)

    # Live predict.js constants (locked 2026-09 from 60d/30d sweep).
    current = {"team": 18.0, "comfort": 9.0, "blue": 10.0}
    print("\n=== live formula (predict.js) ===", flush=True)
    print(f"  mix {mix_str(current)}", flush=True)
    windows = [("season", None), ("90d", 90), ("60d", 60), ("30d", 30)]
    split = {label: window_rows(rows, newest, days) for label, days in windows}
    for label, days in windows:
        print(f"  {label:<7} {fmt(score_rows(split[label], current))}", flush=True)

    blue_wr60 = sum(r["y"] for r in split["60d"]) / max(1, len(split["60d"]))
    blue_wr30 = sum(r["y"] for r in split["30d"]) / max(1, len(split["30d"]))
    blue_elo60 = elo_from_delta((blue_wr60 - 0.5) * 100.0)
    blue_elo30 = elo_from_delta((blue_wr30 - 0.5) * 100.0)
    print(
        f"\n=== empirical blue side ===\n"
        f"  60d blue_wr={blue_wr60*100:5.1f}%  elo={blue_elo60:+.1f}\n"
        f"  30d blue_wr={blue_wr30*100:5.1f}%  elo={blue_elo30:+.1f}",
        flush=True,
    )

    print("\n=== 60d ablations ===", flush=True)
    ablations = {
        "live": current,
        "no blue": {"draft_nosyn": 4.0, "team": 22.0, "comfort": 5.0, "blue": 0.0},
        "emp blue": {"draft_nosyn": 4.0, "team": 22.0, "comfort": 5.0, "blue": blue_elo60},
        "no comfort": {"draft_nosyn": 4.0, "team": 22.0, "blue": 12.0},
        "players only": {"team": 22.0, "blue": blue_elo60},
        "draft only": {"draft_nosyn": 4.0},
        "oe live-w": {"oe": 4.0, "team": 22.0, "comfort": 5.0, "blue": 12.0},
        "oe emp-blue": {"oe": 4.0, "team": 22.0, "comfort": 5.0, "blue": blue_elo60},
        "oe+players": {"oe": 4.0, "team": 22.0, "blue": blue_elo60},
        "oe_tight+p": {"oe_tight": 4.0, "team": 22.0, "comfort": 5.0, "blue": blue_elo60},
        "oe_loo live": {"oe_loo": 4.0, "team": 22.0, "comfort": 5.0, "blue": 12.0},
        "oe_loo emp": {"oe_loo": 4.0, "team": 22.0, "comfort": 5.0, "blue": blue_elo60},
        "oe_t_loo": {"oe_tight_loo": 4.0, "team": 22.0, "comfort": 5.0, "blue": 12.0},
        "syn on": {"draft": 4.0, "team": 22.0, "comfort": 5.0, "blue": 12.0},
    }
    for name, mix in ablations.items():
        print(f"  {name:<14} {fmt(score_rows(split['60d'], mix))}", flush=True)
    print(f"  always blue    acc={blue_wr60*100:5.1f}%  n={len(split['60d'])}", flush=True)

    def elo_of(row, mix):
        return (
            mix.get("draft", 0.0) * row["draft"]
            + mix.get("draft_nosyn", 0.0) * row["draft_nosyn"]
            + mix.get("draft_tight", 0.0) * row["draft_tight"]
            + mix.get("oe", 0.0) * row["oe"]
            + mix.get("oe_tight", 0.0) * row["oe_tight"]
            + mix.get("oe_loo", 0.0) * row["oe_loo"]
            + mix.get("oe_tight_loo", 0.0) * row["oe_tight_loo"]
            + mix.get("team", 0.0) * row["team"]
            + mix.get("comfort", 0.0) * row["comfort"]
            + mix.get("blue", 0.0)
        )

    print("\n=== live 60d by |elo| ===", flush=True)
    buckets = defaultdict(lambda: [0, 0])
    for row in split["60d"]:
        elo = elo_of(row, current)
        mag = abs(elo)
        key = "0-20" if mag < 20 else "20-50" if mag < 50 else "50-100" if mag < 100 else "100+"
        p = expected_from_elo(elo)
        buckets[key][0] += 1
        buckets[key][1] += int((p > 0.5) == (row["y"] == 1.0))
    for key in ("0-20", "20-50", "50-100", "100+"):
        n, h = buckets[key]
        print(f"  {key:<7} {h/n*100:5.1f}%  n={n}" if n else f"  {key:<7} n=0", flush=True)

    print("\n=== live 60d by league ===", flush=True)
    by_lg = defaultdict(lambda: [0, 0])
    for row in split["60d"]:
        elo = elo_of(row, current)
        p = expected_from_elo(elo)
        by_lg[row["l"]][0] += 1
        by_lg[row["l"]][1] += int((p > 0.5) == (row["y"] == 1.0))
    for lg, (n, h) in sorted(by_lg.items()):
        print(f"  {lg:<5} {h/n*100:5.1f}%  n={n}", flush=True)

    def rank_mixes(candidates, label):
        ranked = []
        for mix in candidates:
            rec60 = score_rows(split["60d"], mix)
            rec30 = score_rows(split["30d"], mix)
            recs = score_rows(split["season"], mix)
            ranked.append(
                (
                    rec60["acc"],
                    -rec60["brier"],
                    rec30["acc"],
                    -rec30["brier"],
                    recs["acc"],
                    mix_str(mix),
                    mix,
                    rec60,
                    rec30,
                )
            )
        ranked.sort(key=lambda r: (r[0], r[1], r[2], r[3], r[4], r[5]), reverse=True)
        print(f"\n=== {label} ===", flush=True)
        for rec in ranked[:12]:
            print(
                f"    60d {rec[0]*100:5.1f}% brier={-rec[1]:.4f} | 30d {rec[2]*100:5.1f}% | "
                f"season {rec[4]*100:5.1f}% | {rec[5]}",
                flush=True,
            )
        return ranked

    blue_grid = sorted({0.0, 8.0, 12.0, 16.0, 20.0})
    lol_mixes = []
    for draft in (0, 2, 4, 6, 8):
        for team in (14, 18, 22, 26, 30, 36):
            for comfort in (0, 2, 4, 5, 7):
                for blue in blue_grid:
                    lol_mixes.append({"draft_nosyn": draft, "team": team, "comfort": comfort, "blue": blue})
    ranked_lol = rank_mixes(lol_mixes, "sweep LoLalytics draft_nosyn (no OE)")

    oe_mixes = []
    for draft in (0, 2, 4, 6, 8, 10):
        for team in (14, 18, 22, 26, 30, 36):
            for comfort in (0, 2, 4, 5, 7):
                for blue in blue_grid:
                    oe_mixes.append({"oe_loo": draft, "team": team, "comfort": comfort, "blue": blue})
                    oe_mixes.append({"oe_tight_loo": draft, "team": team, "comfort": comfort, "blue": blue})
    ranked_oe = rank_mixes(oe_mixes, "sweep OE leave-one-out matchups")

    syn_mixes = []
    for draft in (0, 2, 4, 6):
        for team in (18, 22, 26, 30):
            for comfort in (0, 2, 5):
                for blue in (0.0, 8.0, 12.0):
                    syn_mixes.append({"draft": draft, "team": team, "comfort": comfort, "blue": blue})
    rank_mixes(syn_mixes, "sweep draft+syn (LoLalytics)")

    # Prefer honest OE LOO when it beats or ties LoLalytics on 60d.
    if ranked_oe and ranked_lol:
        oe_top, lol_top = ranked_oe[0], ranked_lol[0]
        if oe_top[0] > lol_top[0] + 0.001 or (
            abs(oe_top[0] - lol_top[0]) <= 0.003 and -oe_top[1] <= -lol_top[1]
        ):
            best = oe_top
        else:
            best = lol_top
    else:
        best = (ranked_oe or ranked_lol)[0]

    proposed = best[6]
    # Map LOO keys onto live OE keys for predict.js deployment.
    deploy = dict(proposed)
    if "oe_loo" in deploy:
        deploy["oe"] = deploy.pop("oe_loo")
    if "oe_tight_loo" in deploy:
        deploy["oe_tight"] = deploy.pop("oe_tight_loo")

    print("\n=== recommended mix ===", flush=True)
    print(f"  backtest {mix_str(proposed)}", flush=True)
    print(f"  deploy   {mix_str(deploy)}", flush=True)
    for label, days in windows:
        print(f"  {label:<7} {fmt(score_rows(split[label], proposed))}", flush=True)
    print(f"  live60  {fmt(score_rows(split['60d'], current))}", flush=True)
    print(f"  live30  {fmt(score_rows(split['30d'], current))}", flush=True)

    print("\n=== recommended 60d by league ===", flush=True)
    by_lg = defaultdict(lambda: [0, 0])
    for row in split["60d"]:
        elo = elo_of(row, proposed)
        p = expected_from_elo(elo)
        by_lg[row["l"]][0] += 1
        by_lg[row["l"]][1] += int((p > 0.5) == (row["y"] == 1.0))
    for lg, (n, h) in sorted(by_lg.items()):
        print(f"  {lg:<5} {h/n*100:5.1f}%  n={n}", flush=True)


if __name__ == "__main__":
    main()
