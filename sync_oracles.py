#!/usr/bin/env python3
"""Pull Oracle's Elixir match data and write a compact oracles.js for the site.

Google Drive does not allow browser fetches (CORS) and this file is often
quota-throttled, so the site loads a compact bundle. Re-run this script to
refresh. Tries Drive first (with retries on CI), then the newest local
Downloads copy. The daily GitHub Action must fail if Drive never returns a CSV.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import shutil
import subprocess
import sys
import time
from collections import defaultdict
from datetime import datetime, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DEFAULT_DRIVE_ID = "1hnpbrUpBMS1TZI7IovfpKeZfWJH1Aptm"
DRIVE_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0"
DRIVE_RETRY_SECONDS = (0, 20, 40, 80, 120, 180, 240, 300)
CONFIRM_RE = re.compile(r'name=["\']confirm["\']\s+value=["\']([^"\']+)', re.I)
UUID_RE = re.compile(r'name=["\']uuid["\']\s+value=["\']([^"\']+)', re.I)
HREF_CONFIRM_RE = re.compile(r"[?&]confirm=([0-9A-Za-z_-]+)")

ALIASES = {
    "nunuwillump": "Nunu",
    "nunuandwillump": "Nunu",
    "renataglasc": "Renata",
    "renata": "Renata",
    "wukong": "MonkeyKing",
    "monkeyking": "MonkeyKing",
}

POS = {
    "top": "top",
    "jng": "jng",
    "jungle": "jng",
    "jungler": "jng",
    "mid": "mid",
    "middle": "mid",
    "bot": "adc",
    "adc": "adc",
    "bottom": "adc",
    "sup": "sup",
    "supp": "sup",
    "support": "sup",
}

MAJOR_LEAGUES = ("LPL", "LCK", "LEC", "LCS")
EARLY_PICK_SLOTS = 3
PICK_SLOT_KEYS = ("s0", "s1", "s2", "s3", "s4")

ROOT = Path(__file__).resolve().parent
DOWNLOADS = Path.home() / "Downloads"


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


def drive_id() -> str:
    return (os.environ.get("ORACLES_DRIVE_ID") or DEFAULT_DRIVE_ID).strip()


def drive_urls(file_id: str) -> list[str]:
    return [
        f"https://drive.usercontent.google.com/download?id={file_id}&export=download&confirm=t",
        f"https://drive.google.com/uc?export=download&id={file_id}&confirm=t",
    ]


def looks_like_csv(path: Path) -> bool:
    if not path.exists() or path.stat().st_size < 100:
        return False
    with path.open(encoding="utf-8", errors="replace") as handle:
        start = handle.read(64).lstrip("\ufeff")
    return start.lower().startswith("gameid")


def _html_hint(html: str) -> str:
    compact = re.sub(r"\s+", " ", html).strip()
    if "quota" in compact.lower() or "too many users" in compact.lower():
        return "Google Drive quota page"
    return compact[:240] or "(empty)"


def _curl_get(curl: str, url: str, dest: Path, cookies: Path, extra: list[str] | None = None) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(
            [
                curl,
                "-sL",
                "--http1.1",
                "--retry",
                "2",
                "--retry-delay",
                "3",
                "--max-time",
                "180",
                "-A",
                DRIVE_UA,
                "-c",
                str(cookies),
                "-b",
                str(cookies),
                *(extra or []),
                "-o",
                str(dest),
                url,
            ],
            check=True,
        )
        return dest.exists()
    except (OSError, subprocess.CalledProcessError) as exc:
        print(f"  download failed: {exc}")
        return False


def _drive_confirm_url(html: str, file_id: str) -> str | None:
    lowered = html.lower()
    if "quota" in lowered or "too many users" in lowered:
        return None
    confirm = ""
    match = CONFIRM_RE.search(html) or HREF_CONFIRM_RE.search(html)
    if match:
        confirm = match.group(1)
    uuid_match = UUID_RE.search(html)
    uuid = uuid_match.group(1) if uuid_match else ""
    if not confirm and not uuid:
        return None
    url = f"https://drive.usercontent.google.com/download?id={file_id}&export=download"
    if confirm:
        url += f"&confirm={confirm}"
    if uuid:
        url += f"&uuid={uuid}"
    return url


def _keep_if_csv(tmp: Path, dest: Path, via: str) -> bool:
    if not looks_like_csv(tmp):
        return False
    shutil.move(str(tmp), str(dest))
    print(f"  saved {dest.stat().st_size:,} bytes ({via})")
    return True


def _download_drive_api(dest: Path, file_id: str, curl: str, cookies: Path) -> bool:
    key = (os.environ.get("ORACLES_DRIVE_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()
    if not key:
        return False
    url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media&acknowledgeAbuse=true&key={key}"
    tmp = dest.with_name(dest.name + ".api")
    print("Trying Drive API")
    try:
        if _curl_get(curl, url, tmp, cookies) and _keep_if_csv(tmp, dest, "Drive API"):
            return True
        if tmp.exists():
            print(f"  Drive API did not return a CSV: {_html_hint(tmp.read_text(encoding='utf-8', errors='replace')[:20000])}")
        return False
    finally:
        if tmp.exists():
            tmp.unlink()


def _download_gdown(dest: Path, file_id: str) -> bool:
    try:
        import gdown
    except ImportError:
        return False
    tmp = dest.with_name(dest.name + ".gdown")
    print("Trying gdown")
    try:
        gdown.download(id=file_id, output=str(tmp), quiet=False, fuzzy=True)
        if _keep_if_csv(tmp, dest, "gdown"):
            return True
        if tmp.exists():
            print(f"  gdown did not return a CSV: {_html_hint(tmp.read_text(encoding='utf-8', errors='replace')[:20000])}")
        return False
    except Exception as exc:
        print(f"  gdown failed: {exc}")
        return False
    finally:
        if tmp.exists():
            tmp.unlink()


def _download_drive_once(dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    curl = shutil.which("curl") or shutil.which("curl.exe")
    if not curl:
        print("curl is not installed.")
        return False
    file_id = drive_id()
    tmp = dest.with_name(dest.name + ".part")
    cookies = dest.with_name(dest.name + ".cookies")
    try:
        if _download_drive_api(dest, file_id, curl, cookies):
            return True
        for url in drive_urls(file_id):
            print(f"Trying Drive: {url}")
            if not _curl_get(curl, url, tmp, cookies):
                continue
            if _keep_if_csv(tmp, dest, "Drive"):
                return True
            html = tmp.read_text(encoding="utf-8", errors="replace")[:20000]
            confirm_url = _drive_confirm_url(html, file_id)
            if not confirm_url:
                print(f"  Drive did not return a CSV: {_html_hint(html)}")
                continue
            print(f"  confirm page; retrying {confirm_url}")
            if _curl_get(curl, confirm_url, tmp, cookies) and _keep_if_csv(tmp, dest, "Drive confirm"):
                return True
            hint = tmp.read_text(encoding="utf-8", errors="replace")[:20000] if tmp.exists() else ""
            print(f"  Drive did not return a CSV: {_html_hint(hint)}")
        return _download_gdown(dest, file_id)
    finally:
        if tmp.exists():
            tmp.unlink()
        if cookies.exists():
            cookies.unlink()


def download_drive(dest: Path) -> bool:
    in_ci = bool(os.environ.get("GITHUB_ACTIONS"))
    attempts = int(os.environ.get("ORACLES_DRIVE_ATTEMPTS") or ("8" if in_ci else "2"))
    attempts = max(1, attempts)
    for attempt in range(attempts):
        if attempt:
            wait = DRIVE_RETRY_SECONDS[min(attempt, len(DRIVE_RETRY_SECONDS) - 1)]
            print(f"Drive retry {attempt + 1}/{attempts} in {wait}s...", flush=True)
            time.sleep(wait)
        elif attempts > 1:
            print(f"Drive attempt 1/{attempts}", flush=True)
        if _download_drive_once(dest):
            return True
    return False


def newest_local_csv() -> Path | None:
    matches = sorted(
        DOWNLOADS.glob("*LoL_esports_match_data_from_OraclesElixir*.csv"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    year_matches = [path for path in matches if "2026" in path.name]
    pool = year_matches or matches
    return pool[0] if pool else None


def resolve_csv(explicit: Path | None, cache: Path) -> Path:
    if explicit:
        if not looks_like_csv(explicit):
            raise SystemExit(f"Not an Oracle's Elixir CSV: {explicit}")
        return explicit
    if download_drive(cache):
        return cache
    local = newest_local_csv()
    if local and looks_like_csv(local):
        print(f"Using local copy: {local}")
        return local
    fallback = ROOT / "oracles.csv"
    if looks_like_csv(fallback):
        print(f"Using {fallback}")
        return fallback
    raise SystemExit(
        "Could not download the Oracle's Elixir CSV from Google Drive "
        "(quota or interstitial) and no local copy was found. "
        "The refresh must fail instead of publishing stale pro games."
    )


def inum(row: dict, key: str, default: int = 0) -> int:
    raw = row.get(key)
    if raw is None or str(raw).strip() == "":
        return default
    try:
        return int(float(raw))
    except ValueError:
        return default


def first_side(blue: list[dict] | dict, red: list[dict] | dict, key: str) -> int | None:
    def hit(rows: list[dict] | dict) -> bool:
        if isinstance(rows, dict):
            rows = [rows]
        return any(bool(row.get(key)) for row in rows)

    b = hit(blue)
    r = hit(red)
    if b and not r:
        return 1
    if r and not b:
        return 0
    return None


def team_stats(row: dict) -> dict:
    return {
        "dr": inum(row, "dragons"),
        "el": inum(row, "elders"),
        "ba": inum(row, "barons"),
        "at": inum(row, "atakhans"),
        "tw": inum(row, "towers"),
        "ih": inum(row, "inhibitors"),
        "he": inum(row, "heralds"),
        "gr": inum(row, "void_grubs"),
        "fb": inum(row, "firstblood"),
        "fd": inum(row, "firstdragon"),
        "fh": inum(row, "firstherald"),
        "fba": inum(row, "firstbaron"),
        "ft": inum(row, "firsttower"),
        "fp": inum(row, "firstPick"),
    }


def pack_match_stats(blue: list[dict], red: list[dict], teams: dict | None = None) -> dict:
    teams = teams or {}
    tb = teams.get("Blue") or {}
    tr = teams.get("Red") or {}

    def player_vals(rows: list[dict], key: str) -> list[int]:
        return [int(row.get(key) or 0) for row in rows]

    def tpair(key: str) -> list[int]:
        return [int(tb.get(key) or 0), int(tr.get(key) or 0)]

    return {
        "g": [sum(player_vals(blue, "gold")), sum(player_vals(red, "gold"))],
        "d": [sum(player_vals(blue, "dmg")), sum(player_vals(red, "dmg"))],
        "cs": [sum(player_vals(blue, "cs")), sum(player_vals(red, "cs"))],
        "pg": player_vals(blue, "gold") + player_vals(red, "gold"),
        "pd": player_vals(blue, "dmg") + player_vals(red, "dmg"),
        "pt": player_vals(blue, "dtpm") + player_vals(red, "dtpm"),
        "pc": player_vals(blue, "cs") + player_vals(red, "cs"),
        "pv": player_vals(blue, "vs") + player_vals(red, "vs"),
        "g15": player_vals(blue, "g15"),
        "g20": player_vals(blue, "g20"),
        "g10": player_vals(blue, "g10"),
        "x15": player_vals(blue, "x15"),
        "c15": player_vals(blue, "c15"),
        "dr": tpair("dr"),
        "el": tpair("el"),
        "ba": tpair("ba"),
        "at": tpair("at"),
        "tw": tpair("tw"),
        "ih": tpair("ih"),
        "he": tpair("he"),
        "gr": tpair("gr"),
        "fb": first_side(tb or blue, tr or red, "fb"),
        "fd": first_side(tb or blue, tr or red, "fd"),
        "fh": first_side(tb or blue, tr or red, "fh"),
        "fba": first_side(tb or blue, tr or red, "fba"),
        "ft": first_side(tb or blue, tr or red, "ft"),
        "fp": first_side(tb or blue, tr or red, "fp"),
    }


def parse_bans(row: dict, ids: dict[str, str]) -> list[str]:
    bans: list[str] = []
    for n in range(1, 6):
        raw = (row.get("ban" + str(n)) or "").strip()
        bans.append(ids.get(norm(raw), "") if raw else "")
    return bans


def parse_picks(row: dict, ids: dict[str, str]) -> list[str]:
    picks: list[str] = []
    for n in range(1, 6):
        raw = (row.get("pick" + str(n)) or "").strip()
        picks.append(ids.get(norm(raw), "") if raw else "")
    return picks


def convert(csv_path: Path, champions_js: Path, recent_days: int = 60) -> dict:
    ids = load_id_map(champions_js)
    by_game: dict[str, list[dict[str, str]]] = defaultdict(list)
    team_by_game: dict[str, dict[str, dict]] = defaultdict(dict)
    game_dates: dict[str, str] = {}
    missing: set[str] = set()
    dates: list[str] = []

    allowed = {name.upper() for name in MAJOR_LEAGUES}

    with csv_path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            league = (row.get("league") or "").strip().upper()
            if league not in allowed:
                continue
            gid = (row.get("gameid") or "").strip()
            side = (row.get("side") or "").strip()
            if not gid or side not in ("Blue", "Red"):
                continue
            pos_raw = (row.get("position") or "").strip().lower()
            if pos_raw == "team":
                rec = team_stats(row)
                rec["pk"] = parse_picks(row, ids)
                team_by_game[gid][side] = rec
                continue
            position = POS.get(pos_raw)
            if not position:
                continue
            champ_id = ids.get(norm(row.get("champion") or ""))
            if not champ_id:
                raw = (row.get("champion") or "").strip()
                if raw:
                    missing.add(raw)
                continue
            try:
                won = int(float(row.get("result") or 0))
            except ValueError:
                continue
            date = (row.get("date") or "")[:10]
            try:
                kda = [
                    int(float(row.get("kills") or 0)),
                    int(float(row.get("deaths") or 0)),
                    int(float(row.get("assists") or 0)),
                ]
            except ValueError:
                kda = [0, 0, 0]
            try:
                length = int(float(row.get("gamelength") or 0))
            except ValueError:
                length = 0
            by_game[gid].append(
                {
                    "id": champ_id,
                    "side": side,
                    "pos": position,
                    "win": 1 if won else 0,
                    "league": league,
                    "date": date,
                    "patch": (row.get("patch") or "").strip(),
                    "team": (row.get("teamname") or "").strip(),
                    "player": (row.get("playername") or "").strip(),
                    "kda": kda,
                    "bans": parse_bans(row, ids),
                    "gl": length,
                    "gid": gid,
                    "gold": inum(row, "totalgold"),
                    "dmg": inum(row, "damagetochampions"),
                    "dtpm": inum(row, "damagetakenperminute"),
                    "cs": inum(row, "total cs"),
                    "vs": inum(row, "visionscore"),
                    "g15": inum(row, "golddiffat15"),
                    "g20": inum(row, "golddiffat20"),
                    "g10": inum(row, "golddiffat10"),
                    "x15": inum(row, "xpdiffat15"),
                    "c15": inum(row, "csdiffat15"),
                }
            )
            if date:
                dates.append(date)
                game_dates.setdefault(gid, date)

    matchups: dict[str, dict[str, dict[str, float | int]]] = defaultdict(dict)
    position_counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    stats: dict[str, dict[str, dict[str, int]]] = defaultdict(
        lambda: defaultdict(lambda: {"picks": 0, "wins": 0})
    )
    pick_order: dict[str, dict[str, dict[str, int]]] = defaultdict(
        lambda: defaultdict(
            lambda: {"picks": 0, "early": 0, "s0": 0, "s1": 0, "s2": 0, "s3": 0, "s4": 0}
        )
    )
    pairings: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    pairs = 0
    for rows in by_game.values():
        keyed: dict[tuple[str, str], tuple[str, int]] = {}
        for row in rows:
            position_counts[row["id"]][row["pos"]] += 1
            bucket = stats[row["id"]][row["pos"]]
            bucket["picks"] += 1
            bucket["wins"] += row["win"]
            keyed[(row["side"], row["pos"])] = (row["id"], row["win"])
        for side in ("Blue", "Red"):
            lineup = []
            for pos in ("top", "jng", "mid", "adc", "sup"):
                row = keyed.get((side, pos))
                if row:
                    lineup.append(row[0])
            for i in range(len(lineup)):
                for j in range(i + 1, len(lineup)):
                    pairings[lineup[i]][lineup[j]] += 1
                    pairings[lineup[j]][lineup[i]] += 1
        for pos in ("top", "jng", "mid", "adc", "sup"):
            blue = keyed.get(("Blue", pos))
            red = keyed.get(("Red", pos))
            if not blue or not red or blue[0] == red[0]:
                continue
            for us, them, win in (
                (blue[0], red[0], blue[1]),
                (red[0], blue[0], red[1]),
            ):
                entry = matchups[us].get(them)
                if not entry:
                    entry = {"games": 0, "wins": 0}
                    matchups[us][them] = entry
                entry["games"] += 1
                entry["wins"] += win
                pairs += 1

        for side in ("Blue", "Red"):
            team = team_by_game.get(rows[0]["gid"], {}).get(side) or {}
            picks = team.get("pk") or []
            by_id = {row["id"]: row for row in rows if row["side"] == side}
            for slot, champ_id in enumerate(picks[:5]):
                row = by_id.get(champ_id)
                if not champ_id or not row:
                    continue
                order = pick_order[champ_id][row["pos"]]
                order["picks"] += 1
                if slot < EARLY_PICK_SLOTS:
                    order["early"] += 1
                order[PICK_SLOT_KEYS[slot]] += 1

    compact: dict[str, dict[str, dict[str, float | int]]] = {}
    for us, vs in matchups.items():
        row = {}
        for them, entry in vs.items():
            games = int(entry["games"])
            wins = int(entry["wins"])
            if games < 3:
                continue
            row[them] = {
                "games": games,
                "wins": wins,
                "delta": round((wins / games - 0.5) * 100, 2),
            }
        if row:
            compact[us] = row

    positions: dict[str, dict[str, int]] = {}
    for champ_id, counts in position_counts.items():
        roles = {pos: n for pos, n in counts.items() if n}
        if roles:
            positions[champ_id] = roles

    newest = max(dates) if dates else ""
    cutoff = ""
    if newest:
        cutoff = (
            datetime.strptime(newest, "%Y-%m-%d") - timedelta(days=max(1, recent_days))
        ).strftime("%Y-%m-%d")

    recent_counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    recent_stats: dict[str, dict[str, dict[str, int]]] = defaultdict(
        lambda: defaultdict(lambda: {"picks": 0, "wins": 0})
    )
    recent_games = 0
    for gid, rows in by_game.items():
        gd = game_dates.get(gid, "")
        if cutoff and gd < cutoff:
            continue
        recent_games += 1
        for row in rows:
            recent_counts[row["id"]][row["pos"]] += 1
            bucket = recent_stats[row["id"]][row["pos"]]
            bucket["picks"] += 1
            bucket["wins"] += row["win"]

    recent_picks: dict[str, dict[str, int]] = {}
    for champ_id, counts in recent_counts.items():
        roles = {pos: n for pos, n in counts.items() if n}
        if roles:
            recent_picks[champ_id] = roles
    role_games = {
        pos: sum(counts.get(pos, 0) for counts in recent_picks.values())
        for pos in ("top", "jng", "mid", "adc", "sup")
    }
    compact_pairings: dict[str, dict[str, int]] = {}
    for us, vs in pairings.items():
        row = {them: games for them, games in vs.items() if games >= 3}
        if row:
            compact_pairings[us] = row

    return {
        "source": "Oracle's Elixir",
        "file": str(csv_path),
        "drive": f"https://drive.google.com/file/d/{drive_id()}/view",
        "leagues": list(MAJOR_LEAGUES),
        "games": len(by_game),
        "from": min(dates) if dates else "",
        "to": newest,
        "pairs": sum(len(row) for row in compact.values()),
        "missing": sorted(missing),
        "matchups": compact,
        "positions": positions,
        "pick_order": {
            champ_id: {role: dict(order) for role, order in roles.items()}
            for champ_id, roles in pick_order.items()
        },
        "pairings": compact_pairings,
        "recent": {
            "days": recent_days,
            "from": cutoff,
            "to": newest,
            "games": recent_games,
            "picks": recent_picks,
            "stats": {cid: dict(roles) for cid, roles in recent_stats.items()},
            "role_games": role_games,
        },
        "stats": {cid: dict(roles) for cid, roles in stats.items()},
        "synced": datetime.now().isoformat(timespec="seconds"),
    }, compact_games(by_game, team_by_game)


def compact_games(by_game: dict, team_by_game: dict | None = None) -> dict:
    order = ("top", "jng", "mid", "adc", "sup")
    games: list[dict] = []
    for gid, rows in by_game.items():
        by_side: dict[str, dict[str, dict]] = {"Blue": {}, "Red": {}}
        for row in rows:
            by_side[row["side"]][row["pos"]] = row
        blue = [by_side["Blue"].get(pos) for pos in order]
        red = [by_side["Red"].get(pos) for pos in order]
        if not all(blue) or not all(red):
            continue
        meta = blue[0]
        teams = (team_by_game or {}).get(gid) or {}

        def side_picks(side: str) -> list[str]:
            pk = list((teams.get(side) or {}).get("pk") or [])
            pk = pk[:5]
            while len(pk) < 5:
                pk.append("")
            return pk

        games.append(
            {
                "g": gid,
                "d": meta["date"],
                "l": meta["league"],
                "p": meta["patch"],
                "w": blue[0]["win"],
                "gl": blue[0].get("gl") or 0,
                "bt": blue[0]["team"],
                "rt": red[0]["team"],
                "bb": blue[0].get("bans") or ["", "", "", "", ""],
                "rb": red[0].get("bans") or ["", "", "", "", ""],
                "b": [row["id"] for row in blue],
                "r": [row["id"] for row in red],
                "bp": [row["player"] for row in blue],
                "rp": [row["player"] for row in red],
                "bk": [row["kda"] for row in blue],
                "rk": [row["kda"] for row in red],
                "bpk": side_picks("Blue"),
                "rpk": side_picks("Red"),
                "x": pack_match_stats(blue, red, teams),
            }
        )
    games.sort(key=lambda game: game["d"], reverse=True)
    dates = [game["d"] for game in games if game["d"]]
    return {
        "source": "Oracle's Elixir",
        "leagues": list(MAJOR_LEAGUES),
        "roles": list(order),
        "count": len(games),
        "from": min(dates) if dates else "",
        "to": max(dates) if dates else "",
        "games": games,
        "synced": datetime.now().isoformat(timespec="seconds"),
    }


def write_games(bundle: dict, js_path: Path) -> None:
    encoded = json.dumps(bundle, separators=(",", ":"))
    js_path.write_text("window.RIFT_PRO_GAMES = " + encoded + ";\n", encoding="utf-8")
    print(f"Wrote {bundle['count']:,} game logs ({bundle.get('from')} to {bundle.get('to')})")
    print(f"  {js_path}")


def write_payload(payload: dict, js_path: Path, json_path: Path) -> None:
    public = {key: value for key, value in payload.items() if key != "missing"}
    encoded = json.dumps(public, separators=(",", ":"))
    js_path.write_text("window.RIFT_ORACLES = " + encoded + ";\n", encoding="utf-8")
    json_path.write_text(encoded + "\n", encoding="utf-8")
    leagues = ", ".join(payload.get("leagues") or MAJOR_LEAGUES)
    print(f"Wrote {payload['games']:,} games ({leagues}), {payload['pairs']:,} matchups")
    recent = payload.get("recent") or {}
    if recent:
        print(
            f"Recent {recent.get('days')}d popularity: {recent.get('games', 0):,} games "
            f"({recent.get('from')} to {recent.get('to')})"
        )
    print(f"  {js_path}")
    print(f"  {json_path}")
    if payload["missing"]:
        print("Unmatched names:")
        for name in payload["missing"]:
            print(" ", name)


def serve(root: Path, port: int) -> None:
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(root), **kwargs)

    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Serving http://127.0.0.1:{port}/")
    httpd.serve_forever()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", type=Path, help="Local Oracle's Elixir CSV")
    parser.add_argument("--champions", type=Path, default=ROOT / "champions.js")
    parser.add_argument("--out-js", type=Path, default=ROOT / "oracles.js")
    parser.add_argument("--out-json", type=Path, default=ROOT / "oracles.json")
    parser.add_argument("--cache", type=Path, default=ROOT / "oracles.csv")
    parser.add_argument("--serve", action="store_true")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument(
        "--recent-days",
        type=int,
        default=60,
        help="Popularity window in days, counted back from the newest game in the CSV.",
    )
    args = parser.parse_args()

    csv_path = resolve_csv(args.csv, args.cache)
    payload, games = convert(csv_path, args.champions, args.recent_days)
    write_payload(payload, args.out_js, args.out_json)
    write_games(games, ROOT / "pro-games.js")
    if args.serve:
        serve(ROOT, args.port)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
