#!/usr/bin/env python3
"""Turn champion_synergies.csv into synergies.js."""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

ALIASES = {
    "nunuwillump": "Nunu",
    "nunuandwillump": "Nunu",
    "renataglasc": "Renata",
    "renata": "Renata",
    "wukong": "MonkeyKing",
    "monkeyking": "MonkeyKing",
}

LANE_KEYS = {
    "top": "top",
    "jungle": "jng",
    "jng": "jng",
    "middle": "mid",
    "mid": "mid",
    "bottom": "adc",
    "adc": "adc",
    "support": "sup",
    "sup": "sup",
}


def norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def load_id_map(champions_js: Path) -> dict[str, str]:
    text = champions_js.read_text(encoding="utf-8-sig")
    text = text.replace("window.RIFT_DRAFT_DATA = ", "", 1).rstrip().rstrip(";")
    data = json.loads(text)
    mapping: dict[str, str] = {}
    for champ in data["champions"]:
        mapping[norm(champ["name"])] = champ["id"]
        mapping[norm(champ["id"])] = champ["id"]
    mapping.update(ALIASES)
    return mapping


def convert(csv_path: Path, champions_js: Path, out_path: Path) -> None:
    ids = load_id_map(champions_js)
    pairs: dict[str, dict[str, dict]] = {}
    missing: set[str] = set()
    rows = 0
    with csv_path.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            main_id = ids.get(norm(row["main_champion"]))
            mate_id = ids.get(norm(row["teammate_champion"]))
            if not main_id:
                missing.add("main:" + row["main_champion"])
                continue
            if not mate_id:
                missing.add("teammate:" + row["teammate_champion"])
                continue
            try:
                delta = round(float(row["delta"]), 2)
                games = int(str(row.get("games") or "0").replace(",", ""))
            except (TypeError, ValueError):
                continue
            wr = None
            raw_wr = (row.get("winrate") or "").strip()
            if raw_wr:
                try:
                    wr = round(float(raw_wr), 2)
                    # LoLalytics may send 0–1 or 0–100.
                    if wr <= 1.5:
                        wr = round(wr * 100, 2)
                except (TypeError, ValueError):
                    wr = None
            role = LANE_KEYS.get((row.get("teammate_lane") or "").strip().lower(), "")
            current = pairs.setdefault(main_id, {}).get(mate_id)
            if current and current.get("games", 0) >= games:
                continue
            entry = {"delta": delta, "games": games}
            if wr is not None:
                entry["wr"] = wr
            if role:
                entry["role"] = role
            pairs[main_id][mate_id] = entry
            rows += 1

    compact = {us: vs for us, vs in pairs.items() if vs}
    payload = {
        "source": "LoLalytics synergies",
        "pairs": sum(len(vs) for vs in compact.values()),
        "synergies": compact,
    }
    out_path.write_text(
        "window.RIFT_SYNERGIES = " + json.dumps(payload, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {payload['pairs']} synergies ({rows} role rows) to {out_path}")
    if missing:
        print("Unmatched names:")
        for name in sorted(missing):
            print(" ", name)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", type=Path, default=ROOT / "cache" / "champion_synergies.csv")
    parser.add_argument("--champions", type=Path, default=ROOT / "champions.js")
    parser.add_argument("--out", type=Path, default=ROOT / "synergies.js")
    args = parser.parse_args()
    convert(args.csv, args.champions, args.out)


if __name__ == "__main__":
    main()
