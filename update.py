#!/usr/bin/env python3
"""Refresh every generated data file the site reads.

  python update.py

Steps:
  1. Champions from Riot Data Dragon
  2. LoLalytics counters, winrates, and synergies
  3. Oracle's Elixir pro games
  4. Player ratings from those games
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SYNC = ROOT / "sync"
CACHE = ROOT / "cache"
PY = sys.executable


def run(args: list[str], cwd: Path | None = None) -> None:
    print("\n+", " ".join(args), flush=True)
    subprocess.check_call(args, cwd=str(cwd or ROOT))


def main() -> int:
    parser = argparse.ArgumentParser(description="Refresh Whisper Draft data files.")
    parser.add_argument("--skip-lolalytics", action="store_true")
    parser.add_argument("--skip-oracles", action="store_true")
    parser.add_argument("--skip-ratings", action="store_true")
    parser.add_argument("--limit", type=int, default=0, help="Fetch only N champions (debug).")
    parser.add_argument("--workers", type=int, default=2)
    args = parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)

    run([PY, str(SYNC / "update_champions.py"), "--out", str(ROOT / "champions.js")])

    if not args.skip_lolalytics:
        counters_csv = CACHE / "champion_counters.csv"
        synergies_csv = CACHE / "champion_synergies.csv"
        extra = ["--limit", str(args.limit)] if args.limit else []
        run(
            [
                PY,
                str(SYNC / "fetch_counters.py"),
                "--fresh",
                "--patch",
                "14",
                "--workers",
                str(args.workers),
                "--out",
                str(counters_csv),
                *extra,
            ]
        )
        run(
            [
                PY,
                str(SYNC / "convert_counters.py"),
                "--csv",
                str(counters_csv),
                "--champions",
                str(ROOT / "champions.js"),
                "--out",
                str(ROOT / "counters.js"),
            ]
        )
        run(
            [
                PY,
                str(SYNC / "fetch_winrates.py"),
                "--out",
                str(CACHE / "champion_winrates.csv"),
                "--site",
                str(ROOT / "winrates.js"),
                "--champions",
                str(ROOT / "champions.js"),
            ]
        )
        run(
            [
                PY,
                str(SYNC / "fetch_synergies.py"),
                "--fresh",
                "--patch",
                "14",
                "--workers",
                str(args.workers),
                "--out",
                str(synergies_csv),
                *extra,
            ]
        )
        run(
            [
                PY,
                str(SYNC / "convert_synergies.py"),
                "--csv",
                str(synergies_csv),
                "--champions",
                str(ROOT / "champions.js"),
                "--out",
                str(ROOT / "synergies.js"),
            ]
        )

    if not args.skip_oracles:
        oracles = ROOT / "sync_oracles.py"
        if not oracles.exists():
            oracles = SYNC / "sync_oracles.py"
        if not oracles.exists():
            raise SystemExit(
                "Missing sync_oracles.py. Upload it to the repo root "
                "(next to update.py) and re-run the workflow."
            )
        run([PY, str(oracles), "--cache", str(ROOT / "oracles.csv")])

    if not args.skip_ratings:
        score = ROOT / "ratings" / "score_players.py"
        if not score.exists():
            raise SystemExit(
                "Missing ratings/score_players.py. Upload the ratings/ Python "
                "files (not just player_ratings.json) and re-run."
            )
        csv_path = ROOT / "oracles.csv"
        have_csv = False
        if csv_path.exists() and csv_path.stat().st_size > 100:
            with csv_path.open(encoding="utf-8", errors="replace") as handle:
                have_csv = handle.read(64).lstrip("\ufeff").lower().startswith("gameid")
        if not have_csv:
            raise SystemExit(
                "No Oracle's Elixir CSV; cannot score players. "
                "Fix the Drive download instead of publishing stale ratings."
            )
        run([PY, "-m", "ratings.score_players", "--csv", str(csv_path)])

    print("\nRefresh complete.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as exc:
        raise SystemExit(exc.returncode) from exc
