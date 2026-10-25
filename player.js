const DDRAGON = "https://ddragon.leagueoflegends.com";
const ROLES = ["All", "TOP", "JNG", "MID", "ADC", "SUP"];
const ROLE_KEYS = ["top", "jng", "mid", "adc", "sup"];
const LEAGUES = ["All", "LPL", "LCK", "LEC", "LCS", "Worlds", "MSI"];
const RECENT_DAYS = 60;
const TAG_MIN_GAMES = 6;
const TAG_MIN_PEERS = 8;
const TAG_Z = 1;
const TAG_IQR = 0.75;
const TAG_Z_LOOSE = 0.45;
const TAG_IQR_LOOSE = 0.3;
const TAG_STREAK_MIN = 3;
const TAG_TEAM_MATES = 3;
const TAG_BOOST_MAX = 5;
const TAG_DEAD_MAX = 2;
const TAG_TEAM_GAP = 6;
const TAG_SITUATION_MIN = 4;
const TAG_BEHIND = -1000;
const TAG_AHEAD = 1000;
const TAG_MAX = 7;
const CHAMP_MIN_GAMES = 3;
const ROLE_MIN_GAMES = 2;
const TAG_LABELS = [
  "Lane dominant",
  "Lane loser",
  "Map pressure",
  "Behind the map",
  "Early bully",
  "Slow starter",
  "XP bully",
  "CS bully",
  "Farm starved",
  "Power farmer",
  "Greedy",
  "Damage threat",
  "Low impact",
  "Killer",
  "Clean",
  "Inter",
  "Playmaker",
  "Isolated",
  "Clairvoyant",
  "Blind",
  "Roamer",
  "Clutch",
  "Choker",
  "Winning",
  "Losing",
  "Win streak",
  "Loss streak",
  "Elite",
  "Fringe",
  "Elo hell",
  "Boosted",
  "Innocent",
  "Trying",
  "Dead weight",
  "One-trick",
  "Diverse pool",
];

const els = {
  boot: document.getElementById("boot"),
  bootStatus: document.getElementById("boot-status"),
  app: document.getElementById("app"),
  title: document.getElementById("player-title"),
  range: document.getElementById("player-range"),
  search: document.getElementById("player-search"),
  leagues: document.getElementById("player-leagues"),
  roles: document.getElementById("player-roles"),
  windows: document.getElementById("player-windows"),
  patches: document.getElementById("player-patches"),
  tagCombo: document.getElementById("player-tag-combo"),
  tagSearch: document.getElementById("player-tag-search"),
  tagMenu: document.getElementById("player-tag-menu"),
  tagPicks: document.getElementById("player-tag-picks"),
  summary: document.getElementById("player-summary"),
  poolTitle: document.getElementById("pool-title"),
  poolHead: document.getElementById("pool-head"),
  poolBody: document.getElementById("pool-body"),
  side: document.getElementById("player-side"),
  gamesSub: document.getElementById("games-sub"),
  gamesBody: document.getElementById("games-body"),
  layout: document.querySelector(".player-layout"),
};

const params = new URLSearchParams(location.search);
let patch = "";
let champMap = new Map();
let tagBoard = { key: "", roles: {} };
let bundle = { games: [] };
let player = params.get("player") || "";
let leagues = parseSel(params.get("league"));
let role = params.get("role") || "All";
RIFT_WINDOW.init(params.get("window"));
let windowKey = RIFT_WINDOW.key;
let patches = parseSel(params.get("patch"));
let tagFilters = parseSel(params.get("tag"));
let search = "";
let poolSort = "games";
let poolDir = -1;
let dirSort = "vs";
let dirDir = -1;
let champFilter = "";

function portrait(id) {
  return DDRAGON + "/cdn/" + patch + "/img/champion/" + id + ".png";
}

function champName(id) {
  return (champMap.get(id) && champMap.get(id).name) || id || "";
}

function addDays(iso, days) {
  const date = new Date(iso + "T00:00:00");
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function cutoffDate() {
  return RIFT_WINDOW.cutoff(bundle.to, addDays);
}

function comparePatch(a, b) {
  const as = String(a).split(".");
  const bs = String(b).split(".");
  const n = Math.max(as.length, bs.length);
  for (let i = 0; i < n; i += 1) {
    const av = Number(as[i] || 0);
    const bv = Number(bs[i] || 0);
    if (av !== bv) return av - bv;
  }
  return 0;
}

function listPatches(games) {
  const seen = {};
  for (let i = 0; i < games.length; i += 1) {
    if (games[i].p) seen[games[i].p] = true;
  }
  return Object.keys(seen).sort(comparePatch).reverse();
}

function chipRow(root, items, current, onPick) {
  root.innerHTML = "";
  for (let i = 0; i < items.length; i += 1) {
    const name = items[i];
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = name;
    if (name === current) button.className = "active";
    button.addEventListener("click", function () {
      onPick(name);
    });
    root.append(button);
  }
}

function parseSel(raw) {
  if (!raw || raw === "All") return [];
  return raw.split(",").map(function (part) {
    return part.trim();
  }).filter(Boolean);
}

function formatSel(list) {
  return list.length ? list.join(",") : "All";
}

function toggleSel(list, name, options) {
  if (name === "All") return [];
  const next = [];
  let found = false;
  for (let i = 0; i < list.length; i += 1) {
    if (list[i] === name) found = true;
    else next.push(list[i]);
  }
  if (!found) next.push(name);
  if (options && next.length === options.length) return [];
  return next;
}

function searchTags(q) {
  const needle = String(q || "").trim().toLowerCase();
  const out = [];
  for (let i = 0; i < TAG_LABELS.length; i += 1) {
    const name = TAG_LABELS[i];
    if (tagFilters.indexOf(name) !== -1) continue;
    if (needle && name.toLowerCase().indexOf(needle) === -1) continue;
    out.push(name);
  }
  return out;
}

function setHidden(el, hide) {
  if (!el) return;
  el.hidden = !!hide;
}

function hideTagMenu() {
  if (!els.tagMenu) return;
  setHidden(els.tagMenu, true);
  els.tagMenu.innerHTML = "";
}

function pickTag(name) {
  tagFilters = toggleSel(tagFilters, name, TAG_LABELS);
  if (els.tagSearch) els.tagSearch.value = "";
  syncUrl();
  render();
  if (els.tagSearch && document.activeElement === els.tagSearch) renderTagMenu();
}

function renderTagMenu() {
  if (!els.tagMenu || !els.tagSearch) return;
  const hits = searchTags(els.tagSearch.value);
  els.tagMenu.innerHTML = "";
  if (!hits.length) {
    setHidden(els.tagMenu, true);
    return;
  }
  for (let i = 0; i < hits.length; i += 1) {
    const name = hits[i];
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = name;
    button.addEventListener("mousedown", function (event) {
      event.preventDefault();
    });
    button.addEventListener("click", function () {
      pickTag(name);
    });
    els.tagMenu.append(button);
  }
  setHidden(els.tagMenu, false);
}

function renderTagPicks(show) {
  if (!els.tagPicks) return;
  els.tagPicks.innerHTML = "";
  setHidden(els.tagPicks, !show || !tagFilters.length);
  if (!show) return;
  for (let i = 0; i < tagFilters.length; i += 1) {
    const name = tagFilters[i];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "active";
    button.textContent = name;
    button.addEventListener("click", function () {
      pickTag(name);
    });
    els.tagPicks.append(button);
  }
}

function chipRowMulti(root, items, selected, onToggle) {
  const allOn = !selected.length;
  root.innerHTML = "";
  for (let i = 0; i < items.length; i += 1) {
    const name = items[i];
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = name;
    const on = name === "All" ? allOn : selected.indexOf(name) !== -1;
    if (on) button.className = "active";
    button.addEventListener("click", function () {
      onToggle(name);
    });
    root.append(button);
  }
}

function playerKey(name) {
  return (name || "").trim().toLowerCase();
}

function fmtPct(value) {
  if (value == null || !isFinite(value)) return "—";
  return (value * 100).toFixed(1) + "%";
}

function fmtRate(value) {
  if (value == null || !isFinite(value)) return "—";
  return value.toFixed(2);
}

function fmtAvg(value) {
  if (value == null || !isFinite(value)) return "—";
  return value.toFixed(1);
}

function fmtK(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(Math.round(n));
}

function fmtDiff(value) {
  const n = Number(value) || 0;
  if (!n) return "0";
  return (n > 0 ? "+" : "−") + fmtK(Math.abs(n));
}

function fmtScore(value) {
  if (value == null || !isFinite(value)) return "—";
  if (!value) return "0.0";
  return (value > 0 ? "+" : "−") + Math.abs(value).toFixed(1);
}

function ratingField(name, roleKey, field) {
  const key = playerKey(name);
  if (!key) return null;
  const roles = liveFiltersOn()
    ? liveBoard().roles
    : ((window.RIFT_PLAYER_RATINGS && window.RIFT_PLAYER_RATINGS.roles) || {});
  const roleName = (roleKey || "").toLowerCase();
  if (roleName && roleName !== "all") {
    const rec = roles[roleName] && roles[roleName][key];
    return rec && rec[field] != null ? rec[field] : null;
  }
  let best = null;
  for (let i = 0; i < ROLE_KEYS.length; i += 1) {
    const rec = roles[ROLE_KEYS[i]] && roles[ROLE_KEYS[i]][key];
    if (!rec || rec[field] == null) continue;
    if (best == null || rec[field] > best) best = rec[field];
  }
  return best;
}

function ratingScore(name, roleKey) {
  return ratingField(name, roleKey, "s");
}

function ratingRel(name, roleKey) {
  return ratingField(name, roleKey, "cs");
}

function ratingBlend(score, rel) {
  const hasScore = score != null && isFinite(score);
  const hasRel = rel != null && isFinite(rel);
  if (hasScore && hasRel) return (score + rel) / 2;
  if (hasScore) return score;
  if (hasRel) return rel;
  return null;
}

function ratingVsBase(name, roleKey) {
  return ratingBlend(ratingScore(name, roleKey), ratingRel(name, roleKey));
}

// Strip some of the club's W-L from True score without flattening
// stacked rosters. λ=1 centers every team at 0; 0.7 felt too far.
const TRUE_TEAM_SHARE = 0.4;

function vsTeamScore(score, teamAvg) {
  if (score == null || !isFinite(score) || teamAvg == null || !isFinite(teamAvg)) return null;
  return Math.round((score - TRUE_TEAM_SHARE * teamAvg) * 100) / 100;
}

let teamAvgMemo = { key: "", map: {} };

function teamAvgMap() {
  const key = [windowKey, formatSel(leagues), formatSel(patches), cutoffDate() || "", (bundle && bundle.to) || ""].join("|");
  if (teamAvgMemo.key === key) return teamAvgMemo.map;
  const games = filteredGames();
  const players = {};
  for (let i = 0; i < games.length; i += 1) {
    const game = games[i];
    const sides = [
      { names: game.bp, team: game.bt },
      { names: game.rp, team: game.rt },
    ];
    for (let s = 0; s < 2; s += 1) {
      const side = sides[s];
      for (let r = 0; r < 5; r += 1) {
        const name = side.names && side.names[r];
        const keyName = playerKey(name);
        if (!keyName) continue;
        const rec = players[keyName] || (players[keyName] = { name: name, teams: {}, roles: {} });
        rec.name = name;
        rec.teams[side.team] = (rec.teams[side.team] || 0) + 1;
        rec.roles[ROLE_KEYS[r]] = (rec.roles[ROLE_KEYS[r]] || 0) + 1;
      }
    }
  }
  const bags = {};
  const keys = Object.keys(players);
  for (let i = 0; i < keys.length; i += 1) {
    const rec = players[keys[i]];
    const team = mostCommon(rec.teams);
    const score = ratingVsBase(rec.name, mostCommon(rec.roles));
    if (!team || score == null || !isFinite(score)) continue;
    const bag = bags[team] || (bags[team] = { n: 0, s: 0 });
    bag.n += 1;
    bag.s += score;
  }
  const map = {};
  const teams = Object.keys(bags);
  for (let i = 0; i < teams.length; i += 1) {
    const bag = bags[teams[i]];
    if (bag.n) map[teams[i]] = bag.s / bag.n;
  }
  teamAvgMemo = { key: key, map: map };
  return map;
}

function ratingVsTeam(name, roleKey, teamName) {
  return vsTeamScore(ratingVsBase(name, roleKey), teamAvgMap()[teamName]);
}

function liveFiltersOn() {
  return windowKey === "recent" || leagues.length || patches.length;
}

function ratingsModel() {
  return (window.RIFT_PLAYER_RATINGS && window.RIFT_PLAYER_RATINGS.model) || {};
}

function meanStd(values) {
  const n = values.length;
  if (!n) return [0, 1];
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += values[i];
  const mean = sum / n;
  let varSum = 0;
  for (let i = 0; i < n; i += 1) {
    const d = values[i] - mean;
    varSum += d * d;
  }
  const std = Math.sqrt(varSum / n);
  return [mean, std < 1e-9 ? 1 : std];
}

function zCols(rows) {
  if (!rows.length) return [];
  const width = rows[0].length;
  const stats = [];
  for (let j = 0; j < width; j += 1) {
    const col = [];
    for (let i = 0; i < rows.length; i += 1) col.push(rows[i][j]);
    stats.push(meanStd(col));
  }
  return rows.map(function (row) {
    return row.map(function (value, j) {
      return (value - stats[j][0]) / stats[j][1];
    });
  });
}

function zByGroup(items, groupOf, valuesOf) {
  const buckets = {};
  for (let i = 0; i < items.length; i += 1) {
    const key = groupOf(items[i]) || "";
    (buckets[key] || (buckets[key] = [])).push(i);
  }
  const allVals = items.map(valuesOf);
  const global = zCols(allVals);
  const out = new Array(items.length);
  const keys = Object.keys(buckets);
  for (let b = 0; b < keys.length; b += 1) {
    const idxs = buckets[keys[b]];
    if (idxs.length < 4) {
      for (let k = 0; k < idxs.length; k += 1) out[idxs[k]] = global[idxs[k]];
      continue;
    }
    const local = zCols(idxs.map(function (i) { return allVals[i]; }));
    for (let k = 0; k < idxs.length; k += 1) out[idxs[k]] = local[k];
  }
  return out;
}

function obsWeight(date, latest, halfLife) {
  if (!halfLife || !latest || !date) return 1;
  const days = Math.max(0, (Date.parse(latest + "T00:00:00") - Date.parse(date + "T00:00:00")) / 86400000);
  return Math.pow(0.5, days / halfLife);
}

function laneDiff(game, side, index, key) {
  const vals = game.x && game.x[key];
  if (!vals) return 0;
  const v = vals[index] || 0;
  return side === "b" ? v : -v;
}

const TOP_TILT_FEATS = [0, 1, 2, 3, 4, 7, 8];
const TOP_DEATHS_TILT_SCALE = 1.75;
const TOP_DEATHS_FEAT = 7;

function mapTilt(game, side, roleIndex) {
  if (roleIndex !== 0) return 0;
  const top = laneDiff(game, side, 0, "g15");
  const mates = laneDiff(game, side, 1, "g15") + laneDiff(game, side, 2, "g15") + laneDiff(game, side, 3, "g15");
  return mates / 3 - top;
}

function residualizeTopFeats(rows) {
  const buckets = {};
  for (let i = 0; i < rows.length; i += 1) {
    const key = rows[i].league || "";
    (buckets[key] || (buckets[key] = [])).push(i);
  }
  const keys = Object.keys(buckets);
  for (let b = 0; b < keys.length; b += 1) {
    const idxs = buckets[keys[b]];
    if (idxs.length < 8) continue;
    const tilts = idxs.map(function (i) { return rows[i].tilt || 0; });
    let tMean = 0;
    for (let k = 0; k < tilts.length; k += 1) tMean += tilts[k];
    tMean /= tilts.length;
    let tVar = 0;
    for (let k = 0; k < tilts.length; k += 1) tVar += (tilts[k] - tMean) * (tilts[k] - tMean);
    tVar /= tilts.length;
    if (tVar < 1e-6) continue;
    for (let c = 0; c < TOP_TILT_FEATS.length; c += 1) {
      const col = TOP_TILT_FEATS[c];
      const ys = idxs.map(function (i) { return rows[i].feats[col]; });
      let yMean = 0;
      for (let k = 0; k < ys.length; k += 1) yMean += ys[k];
      yMean /= ys.length;
      let cov = 0;
      for (let k = 0; k < ys.length; k += 1) cov += (tilts[k] - tMean) * (ys[k] - yMean);
      cov /= ys.length;
      const slope = (col === TOP_DEATHS_FEAT ? TOP_DEATHS_TILT_SCALE : 1) * cov / tVar;
      const intercept = yMean - slope * tMean;
      for (let k = 0; k < idxs.length; k += 1) {
        rows[idxs[k]].feats[col] = ys[k] - (intercept + slope * tilts[k]);
      }
    }
  }
  return rows;
}

function roleObs(games, roleIndex) {
  const out = [];
  for (let i = 0; i < games.length; i += 1) {
    const game = games[i];
    const x = game.x || {};
    const minutes = (game.gl || 0) / 60;
    if (minutes < 8) continue;
    for (let s = 0; s < 2; s += 1) {
      const side = s === 0 ? "b" : "r";
      const off = s === 0 ? 0 : 5;
      const names = s === 0 ? game.bp : game.rp;
      const champs = s === 0 ? game.b : game.r;
      const kdas = s === 0 ? game.bk : game.rk;
      const oppOff = s === 0 ? 5 : 0;
      const dmg = (x.pd && x.pd[off + roleIndex]) || 0;
      const oppDmg = (x.pd && x.pd[oppOff + roleIndex]) || 0;
      const cs = (x.pc && x.pc[off + roleIndex]) || 0;
      const vs = (x.pv && x.pv[off + roleIndex]) || 0;
      const deaths = (kdas[roleIndex] && kdas[roleIndex][1]) || 0;
      out.push({
        name: names[roleIndex] || "",
        team: s === 0 ? game.bt : game.rt,
        league: game.l || "",
        champ: champs[roleIndex] || "",
        date: game.d || "",
        win: s === 0 ? game.w === 1 : game.w === 0,
        tilt: mapTilt(game, side, roleIndex),
        feats: [
          laneDiff(game, side, roleIndex, "g10"),
          laneDiff(game, side, roleIndex, "g15"),
          laneDiff(game, side, roleIndex, "x15"),
          laneDiff(game, side, roleIndex, "c15"),
          dmg / minutes,
          cs / minutes,
          vs / minutes,
          deaths / minutes,
          (dmg - oppDmg) / minutes,
        ],
      });
    }
  }
  return out;
}

function zAgainst(values, anchorNames) {
  const ref = [];
  const names = Object.keys(values);
  for (let i = 0; i < names.length; i += 1) {
    if (!anchorNames || anchorNames[names[i]]) ref.push(values[names[i]]);
  }
  if (ref.length < 2) {
    for (let i = 0; i < names.length; i += 1) ref.push(values[names[i]]);
  }
  const stats = meanStd(ref);
  const out = {};
  for (let i = 0; i < names.length; i += 1) {
    out[names[i]] = (values[names[i]] - stats[0]) / stats[1];
  }
  return out;
}

let liveMemo = { key: "", roles: {}, champs: {} };

function liveBoard() {
  const key = [windowKey, formatSel(leagues), formatSel(patches), cutoffDate() || "", (bundle && bundle.to) || ""].join("|");
  if (liveMemo.key === key) return liveMemo;
  const games = filteredGames();
  const model = ratingsModel();
  const blend = model.blend || {};
  const formW = blend.form == null ? 0.5 : blend.form;
  const prior = model.prior || 28;
  const shrink = model.shrink || 24;
  const halfLife = model.halfLife || 40;
  const frozen = (window.RIFT_PLAYER_RATINGS && window.RIFT_PLAYER_RATINGS.roles) || {};
  const region = model.region || {};
  const regionBlend = blend.region == null ? 0.18 : blend.region;
  let latest = "";
  for (let i = 0; i < games.length; i += 1) {
    if (games[i].d > latest) latest = games[i].d;
  }
  const roles = {};
  const champPools = {};
  for (let r = 0; r < ROLE_KEYS.length; r += 1) {
    const roleKey = ROLE_KEYS[r];
    const weights = (model.weights && model.weights[roleKey]) || [];
    const rows = roleObs(games, r);
    if (roleKey === "top") residualizeTopFeats(rows);
    const z = zByGroup(rows, function (row) { return row.league; }, function (row) { return row.feats; });
    const byName = {};
    const byChamp = {};
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const name = (row.name || "").trim();
      if (!name) continue;
      let pred = 0;
      const zi = z[i] || [];
      for (let j = 0; j < weights.length; j += 1) pred += (zi[j] || 0) * (weights[j] || 0);
      const w = obsWeight(row.date, latest, halfLife);
      const rec = byName[name] || (byName[name] = {
        n: name,
        team: row.team,
        league: row.league,
        g: 0,
        wins: 0,
        w: 0,
        pred: 0,
      });
      rec.g += 1;
      rec.wins += row.win ? 1 : 0;
      rec.w += w;
      rec.pred += w * pred;
      rec.team = row.team;
      rec.league = row.league;
      if (row.champ) {
        const ck = name + "\t" + row.champ;
        const cr = byChamp[ck] || (byChamp[ck] = {
          n: name,
          champ: row.champ,
          team: row.team,
          league: row.league,
          g: 0,
          wins: 0,
          w: 0,
          pred: 0,
        });
        cr.g += 1;
        cr.wins += row.win ? 1 : 0;
        cr.w += w;
        cr.pred += w * pred;
        cr.team = row.team;
        cr.league = row.league;
      }
    }
    const forms = {};
    const names = Object.keys(byName);
    for (let i = 0; i < names.length; i += 1) {
      const rec = byName[names[i]];
      const frozenRec = frozen[roleKey] && frozen[roleKey][playerKey(rec.n)];
      const season = frozenRec && frozenRec.sf != null ? frozenRec.sf : 0;
      const hot = rec.w ? rec.pred / rec.w : 0;
      const mixed = (rec.w * hot + prior * season) / (rec.w + prior);
      forms[rec.n] = (rec.g / (rec.g + shrink)) * mixed;
    }
    const anchor = {};
    for (let i = 0; i < names.length; i += 1) {
      if (byName[names[i]].g >= 4) anchor[names[i]] = true;
    }
    const formZ = zAgainst(forms, Object.keys(anchor).length ? anchor : null);
    const raw = {};
    for (let i = 0; i < names.length; i += 1) {
      const rec = byName[names[i]];
      const frozenRec = frozen[roleKey] && frozen[roleKey][playerKey(rec.n)];
      const ctx = frozenRec && frozenRec.c != null
        ? frozenRec.c
        : regionBlend * (region[rec.league] || 0);
      raw[rec.n] = (formW * formZ[rec.n] + ctx) * 10;
    }
    const champBags = {};
    const grouped = {};
    const champKeysRole = Object.keys(byChamp);
    for (let i = 0; i < champKeysRole.length; i += 1) {
      const rec = byChamp[champKeysRole[i]];
      if (rec.g < CHAMP_MIN_GAMES) continue;
      (grouped[rec.champ] || (grouped[rec.champ] = [])).push(rec);
    }
    const champTitles = Object.keys(grouped);
    for (let c = 0; c < champTitles.length; c += 1) {
      const recs = grouped[champTitles[c]];
      const mixedMap = {};
      for (let i = 0; i < recs.length; i += 1) {
        const rec = recs[i];
        const playerForm = forms[rec.n] || 0;
        const hot = rec.w ? rec.pred / rec.w : 0;
        mixedMap[rec.n] = (rec.g * hot + 10 * playerForm) / (rec.g + 10);
      }
      const mixedZ = zAgainst(mixedMap, null);
      for (let i = 0; i < recs.length; i += 1) {
        const rec = recs[i];
        const frozenRec = frozen[roleKey] && frozen[roleKey][playerKey(rec.n)];
        const ctx = frozenRec && frozenRec.c != null
          ? frozenRec.c
          : regionBlend * (region[rec.league] || 0);
        const rawChamp = (formW * mixedZ[rec.n] + ctx) * 10;
        const bag = champBags[rec.n] || (champBags[rec.n] = { w: 0, s: 0 });
        bag.w += rec.g;
        bag.s += rec.g * rawChamp;
      }
    }
    const bucket = {};
    for (let i = 0; i < names.length; i += 1) {
      const rec = byName[names[i]];
      const bag = champBags[rec.n];
      bucket[playerKey(rec.n)] = {
        n: rec.n,
        s: Math.round(raw[rec.n] * 100) / 100,
        cs: bag && bag.w ? Math.round((bag.s / bag.w) * 100) / 100 : null,
        t: rec.team,
        l: rec.league,
        g: rec.g,
        form: forms[rec.n],
      };
    }
    roles[roleKey] = bucket;
    const champKeys = Object.keys(byChamp);
    for (let i = 0; i < champKeys.length; i += 1) {
      const rec = byChamp[champKeys[i]];
      if (rec.g < 1) continue;
      const playerForm = forms[rec.n] || 0;
      const hot = rec.w ? rec.pred / rec.w : 0;
      const mixed = (rec.g * hot + 10 * playerForm) / (rec.g + 10);
      const slug = champSlug(rec.champ);
      const pool = champPools[slug] || (champPools[slug] = { title: champName(rec.champ), players: [] });
      if (!pool.title) pool.title = champName(rec.champ);
      const frozenRec = frozen[roleKey] && frozen[roleKey][playerKey(rec.n)];
      const ctx = frozenRec && frozenRec.c != null
        ? frozenRec.c
        : regionBlend * (region[rec.league] || 0);
      pool.players.push({
        n: rec.n,
        champ: rec.champ,
        mixed: mixed,
        ctx: ctx,
        g: rec.g,
        wr: rec.g ? rec.wins / rec.g : 0,
        l: rec.league,
        t: rec.team,
        r: roleKey,
      });
    }
  }
  const champs = {};
  const slugs = Object.keys(champPools);
  for (let s = 0; s < slugs.length; s += 1) {
    const pool = champPools[slugs[s]];
    const best = {};
    for (let i = 0; i < pool.players.length; i += 1) {
      const row = pool.players[i];
      const k = playerKey(row.n);
      const prev = best[k];
      if (!prev) {
        best[k] = { row: row, g: row.g, wrN: row.g, wrW: row.wr * row.g };
      } else {
        prev.g += row.g;
        prev.wrN += row.g;
        prev.wrW += row.wr * row.g;
        if (row.mixed > prev.row.mixed) prev.row = row;
      }
    }
    const recs = Object.keys(best)
      .map(function (k) {
        const rec = best[k];
        return {
          n: rec.row.n,
          champ: rec.row.champ,
          mixed: rec.row.mixed,
          ctx: rec.row.ctx,
          g: rec.g,
          wr: rec.wrN ? rec.wrW / rec.wrN : 0,
          l: rec.row.l,
          t: rec.row.t,
          r: rec.row.r,
        };
      })
      .filter(function (row) {
        return row.g >= CHAMP_MIN_GAMES;
      });
    if (!recs.length) continue;
    const mixedMap = {};
    for (let i = 0; i < recs.length; i += 1) mixedMap[recs[i].n] = recs[i].mixed;
    const mixedZ = zAgainst(mixedMap, null);
    const raws = recs.map(function (row) {
      return { row: row, raw: (formW * mixedZ[row.n] + row.ctx) * 10 };
    });
    raws.sort(function (a, b) { return b.raw - a.raw; });
    champs[slugs[s]] = {
      title: pool.title,
      players: raws.map(function (item, i) {
        return {
          n: item.row.n,
          s: Math.round(item.raw * 100) / 100,
          g: item.row.g,
          wr: Math.round(item.row.wr * 1000) / 1000,
          l: item.row.l,
          t: item.row.t,
          r: item.row.r,
          k: i + 1,
        };
      }),
    };
  }
  liveMemo = { key: key, roles: roles, champs: champs };
  return liveMemo;
}

function scoreTone(value) {
  if (value == null || !isFinite(value) || !value) return "";
  return value > 0 ? "wr-up" : "wr-down";
}

function champSlug(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function champLadders() {
  return liveBoard().champs || {};
}

function champIdFromTitle(title) {
  if (!title) return "";
  if (champMap.has(title)) return title;
  const slug = champSlug(title);
  const ids = Array.from(champMap.keys());
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    const rec = champMap.get(id);
    if (champSlug(id) === slug || champSlug(rec && rec.name) === slug) return id;
  }
  return title;
}

function lookupChamp(idOrName) {
  const champs = champLadders();
  const slug = champSlug(idOrName);
  if (champs[slug]) return champs[slug];
  return champs[champSlug(champName(idOrName))] || null;
}

function findChampQuery(q) {
  const slug = champSlug(q);
  if (slug.length < 3) return null;
  const champs = champLadders();
  if (champs[slug]) return champs[slug];
  const keys = Object.keys(champs);
  let hit = null;
  for (let i = 0; i < keys.length; i += 1) {
    const rec = champs[keys[i]];
    const title = champSlug(rec.title);
    if (keys[i] === slug || title === slug) return rec;
    if (keys[i].indexOf(slug) === 0 || title.indexOf(slug) === 0) {
      if (hit) return null;
      hit = rec;
    }
  }
  return hit;
}

function playerChampRow(playerName, champId) {
  const ladder = lookupChamp(champId);
  const key = playerKey(playerName);
  if (ladder) {
    const rows = ladder.players || [];
    for (let i = 0; i < rows.length; i += 1) {
      if (playerKey(rows[i].n) === key) return rows[i];
    }
  }
  return fallbackChampRow(playerName, champId);
}

function fallbackChampRow(playerName, champId) {
  const want = playerKey(playerName);
  const wantRole = role === "All" ? -1 : ROLE_KEYS.indexOf(role.toLowerCase());
  const games = filteredGames();
  const map = {};
  for (let i = 0; i < games.length; i += 1) {
    const game = games[i];
    for (let r = 0; r < 5; r += 1) {
      if (wantRole >= 0 && r !== wantRole) continue;
      const sides = [
        { names: game.bp, champs: game.b, win: game.w === 1 },
        { names: game.rp, champs: game.r, win: game.w === 0 },
      ];
      for (let s = 0; s < 2; s += 1) {
        const side = sides[s];
        if (side.champs[r] !== champId) continue;
        const name = side.names[r] || "";
        const key = playerKey(name);
        if (!key) continue;
        const rec = map[key] || (map[key] = { n: name, g: 0, wins: 0, roles: {} });
        rec.g += 1;
        rec.wins += side.win ? 1 : 0;
        rec.roles[ROLE_KEYS[r]] = (rec.roles[ROLE_KEYS[r]] || 0) + 1;
      }
    }
  }
  const rows = Object.keys(map)
    .map(function (key) {
      const rec = map[key];
      const roleKey = mostCommon(rec.roles);
      return {
        n: rec.n,
        g: rec.g,
        wr: rec.g ? rec.wins / rec.g : 0,
        s: ratingScore(rec.n, roleKey),
        r: roleKey,
        k: 0,
      };
    })
    .filter(function (row) {
      return row.g >= CHAMP_MIN_GAMES;
    });
  if (!rows.length) return null;
  rows.sort(function (a, b) {
    if (a.s != null && b.s != null && b.s !== a.s) return b.s - a.s;
    if (a.s != null && b.s == null) return -1;
    if (a.s == null && b.s != null) return 1;
    if (b.wr !== a.wr) return b.wr - a.wr;
    return b.g - a.g;
  });
  for (let i = 0; i < rows.length; i += 1) rows[i].k = i + 1;
  for (let i = 0; i < rows.length; i += 1) {
    if (playerKey(rows[i].n) === want) return rows[i];
  }
  return null;
}

function fmtKda(row) {
  if (!row) return "—";
  return row[0] + " / " + row[1] + " / " + row[2];
}

function kdaRatio(k, d, a) {
  return (k + a) / Math.max(d, 1);
}

function sortRows(rows, key, dir) {
  rows.sort(function (a, b) {
    const av = a[key];
    const bv = b[key];
    const aEmpty = av == null;
    const bEmpty = bv == null;
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    if (typeof av === "string") return av.localeCompare(bv) * dir;
    return (av - bv) * dir;
  });
  return rows;
}

function windowGames() {
  const cutoff = cutoffDate();
  const rows = bundle.games || [];
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const game = rows[i];
    if (leagues.length && leagues.indexOf(game.l) === -1) continue;
    if (cutoff && game.d < cutoff) continue;
    out.push(game);
  }
  return out;
}

function filteredGames() {
  const rows = windowGames();
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    if (patches.length && patches.indexOf(rows[i].p) === -1) continue;
    out.push(rows[i]);
  }
  return out;
}

function appearance(game, side, index) {
  const x = game.x || {};
  const off = side === "b" ? 0 : 5;
  const kda = (side === "b" ? game.bk : game.rk)[index] || [0, 0, 0];
  const minutes = (game.gl || 0) / 60;
  const cs = (x.pc && x.pc[off + index]) || 0;
  const gold = (x.pg && x.pg[off + index]) || 0;
  const dmg = (x.pd && x.pd[off + index]) || 0;
  const vis = (x.pv && x.pv[off + index]) || 0;
  const kdas = side === "b" ? game.bk : game.rk;
  let teamK = 0;
  for (let i = 0; i < 5; i += 1) teamK += (kdas[i] && kdas[i][0]) || 0;
  function lane(key) {
    const vals = x[key];
    if (!vals) return null;
    const v = vals[index];
    if (v == null) return null;
    return side === "b" ? v : -v;
  }
  const laneGold = lane("g15");
  const teamGold = (x.g && x.g[side === "b" ? 0 : 1]) || 0;
  let teamGd15 = null;
  if (x.g15 && x.g15.length) {
    let lead = 0;
    for (let i = 0; i < Math.min(5, x.g15.length); i += 1) lead += x.g15[i] || 0;
    teamGd15 = side === "b" ? lead : -lead;
  }
  return {
    id: game.g,
    date: game.d,
    league: game.l,
    patch: game.p,
    role: ROLE_KEYS[index],
    champ: (side === "b" ? game.b : game.r)[index],
    name: (side === "b" ? game.bp : game.rp)[index] || "",
    team: side === "b" ? game.bt : game.rt,
    opp: side === "b" ? game.rt : game.bt,
    vs: (side === "b" ? game.r : game.b)[index],
    kda: kda,
    win: side === "b" ? game.w === 1 : game.w === 0,
    cs: cs,
    gold: gold,
    dmg: dmg,
    vis: vis,
    cspm: minutes ? cs / minutes : 0,
    dpm: minutes ? dmg / minutes : 0,
    vpm: minutes ? vis / minutes : 0,
    kp: teamK ? (kda[0] + kda[2]) / teamK : 0,
    goldShare: teamGold ? gold / teamGold : null,
    gd10: lane("g10"),
    gd15: laneGold,
    xd15: lane("x15"),
    cd15: lane("c15"),
    teamGd15: teamGd15,
  };
}

function listAppearances(wantName) {
  const want = playerKey(wantName);
  const wantRole = role === "All" ? -1 : ROLE_KEYS.indexOf(role.toLowerCase());
  const rows = filteredGames();
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const game = rows[i];
    for (let r = 0; r < 5; r += 1) {
      if (wantRole >= 0 && r !== wantRole) continue;
      if (playerKey(game.bp[r]) === want) out.push(appearance(game, "b", r));
      if (playerKey(game.rp[r]) === want) out.push(appearance(game, "r", r));
    }
  }
  return out;
}

function mostCommon(map) {
  let best = "";
  let n = 0;
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i += 1) {
    if (map[keys[i]] > n) {
      n = map[keys[i]];
      best = keys[i];
    }
  }
  return best;
}

function topKeys(counts, n) {
  const keys = Object.keys(counts);
  keys.sort(function (a, b) {
    return (counts[b] || 0) - (counts[a] || 0);
  });
  return keys.slice(0, n);
}

function summarize(rows) {
  const teams = {};
  const roles = {};
  const names = {};
  let k = 0;
  let d = 0;
  let a = 0;
  let wins = 0;
  let cs = 0;
  let gold = 0;
  let dmg = 0;
  let gd = 0;
  let gdN = 0;
  let vis = 0;
  let kp = 0;
  let g10 = 0;
  let g10N = 0;
  let xd = 0;
  let xdN = 0;
  let cd = 0;
  let cdN = 0;
  const champs = {};
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    k += row.kda[0];
    d += row.kda[1];
    a += row.kda[2];
    wins += row.win ? 1 : 0;
    cs += row.cs;
    gold += row.gold;
    dmg += row.dmg;
    vis += row.vis || 0;
    kp += row.kp || 0;
    if (row.gd15 != null) {
      gd += row.gd15;
      gdN += 1;
    }
    if (row.gd10 != null) {
      g10 += row.gd10;
      g10N += 1;
    }
    if (row.xd15 != null) {
      xd += row.xd15;
      xdN += 1;
    }
    if (row.cd15 != null) {
      cd += row.cd15;
      cdN += 1;
    }
    teams[row.team] = (teams[row.team] || 0) + 1;
    roles[row.role] = (roles[row.role] || 0) + 1;
    names[row.name] = (names[row.name] || 0) + 1;
    champs[row.champ] = true;
  }
  const n = rows.length;
  return {
    name: mostCommon(names) || player,
    team: mostCommon(teams),
    role: mostCommon(roles),
    games: n,
    wins: wins,
    winRate: n ? wins / n : 0,
    k: k,
    d: d,
    a: a,
    kda: n ? kdaRatio(k, d, a) : 0,
    avgK: n ? k / n : 0,
    avgD: n ? d / n : 0,
    avgA: n ? a / n : 0,
    avgCs: n ? cs / n : 0,
    avgCspm: n ? rows.reduce(function (sum, row) { return sum + row.cspm; }, 0) / n : 0,
    avgGold: n ? gold / n : 0,
    avgDpm: n ? rows.reduce(function (sum, row) { return sum + row.dpm; }, 0) / n : 0,
    avgVpm: n ? rows.reduce(function (sum, row) { return sum + (row.vpm || 0); }, 0) / n : 0,
    avgKp: n ? kp / n : 0,
    avgGd10: g10N ? g10 / g10N : 0,
    avgGd15: gdN ? gd / gdN : 0,
    avgXd15: xdN ? xd / xdN : 0,
    avgCd15: cdN ? cd / cdN : 0,
    champs: Object.keys(champs).length,
  };
}

function tagFilterKey() {
  return leagues.join(",") + "|" + windowKey + "|" + patches.join(",") + "|" + (bundle.to || "");
}

function sortedCopy(values) {
  const out = values.slice();
  out.sort(function (a, b) {
    return a - b;
  });
  return out;
}

function quantile(sorted, p) {
  if (!sorted || !sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function fieldStats(values) {
  const sorted = [];
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] == null || !isFinite(values[i])) continue;
    sorted.push(values[i]);
  }
  sorted.sort(function (a, b) {
    return a - b;
  });
  if (!sorted.length) return null;
  const meanStdPair = meanStd(sorted);
  const q1 = quantile(sorted, 0.25);
  const med = quantile(sorted, 0.5);
  const q3 = quantile(sorted, 0.75);
  return {
    n: sorted.length,
    mean: meanStdPair[0],
    std: meanStdPair[1],
    q1: q1,
    med: med,
    q3: q3,
    iqr: q3 - q1,
  };
}

function tagSignal(stats, value) {
  if (!stats || value == null || !isFinite(value)) return null;
  const vsMean = value - stats.mean;
  const vsMed = value - stats.med;
  return {
    value: value,
    mean: stats.mean,
    med: stats.med,
    std: stats.std,
    iqr: stats.iqr,
    vsMean: vsMean,
    z: stats.std >= 1e-9 ? vsMean / stats.std : 0,
    iqrDist: stats.iqr >= 1e-9 ? vsMed / stats.iqr : 0,
  };
}

function tagPeerLabel(roleKey) {
  const bits = [(roleKey || "").toUpperCase() || "role"];
  if (leagues.length) bits.push(leagues.join("/"));
  else bits.push("all leagues");
  if (RIFT_WINDOW.isRecent()) bits.push("last " + RIFT_WINDOW.days + "d");
  if (patches.length) bits.push(patches.join("/"));
  return bits.join(" · ");
}

function peerMetrics(row) {
  const n = row.games || 0;
  if (!n) return null;
  return {
    key: row.key,
    name: row.name,
    games: n,
    wr: n ? row.wins / n : 0,
    kda: kdaRatio(row.k, row.d, row.a),
    kills: row.k / n,
    deaths: row.d / n,
    assists: row.a / n,
    dpm: row.dpm / n,
    cspm: row.cspm / n,
    vpm: row.vpm / n,
    kp: row.kp / n,
    gd10: row.g10N ? row.g10 / row.g10N : null,
    gd15: row.gdN ? row.gd / row.gdN : null,
    xd15: row.xdN ? row.xd / row.xdN : null,
    cd15: row.cdN ? row.cd / row.cdN : null,
    goldShare: row.goldShareN ? row.goldShare / row.goldShareN : null,
    clutch: row.behindN >= TAG_SITUATION_MIN ? row.behindW / row.behindN : null,
    choke: row.aheadN >= TAG_SITUATION_MIN ? (row.aheadN - row.aheadW) / row.aheadN : null,
    champs: row.champs,
    score: ratingScore(row.name, row.role),
  };
}

function buildRoleBoard() {
  const key = tagFilterKey();
  if (tagBoard.key === key && tagBoard.roles) return tagBoard.roles;
  const buckets = {};
  const games = filteredGames();
  for (let g = 0; g < games.length; g += 1) {
    const game = games[g];
    for (let r = 0; r < 5; r += 1) {
      const sides = [appearance(game, "b", r), appearance(game, "r", r)];
      for (let s = 0; s < 2; s += 1) {
        const row = sides[s];
        const nameKey = playerKey(row.name);
        if (!nameKey) continue;
        const roleKey = row.role;
        if (!buckets[roleKey]) buckets[roleKey] = {};
        const rec =
          buckets[roleKey][nameKey] ||
          (buckets[roleKey][nameKey] = {
            key: nameKey,
            name: row.name,
            role: roleKey,
            games: 0,
            wins: 0,
            k: 0,
            d: 0,
            a: 0,
            dpm: 0,
            cspm: 0,
            vpm: 0,
            kp: 0,
            gd: 0,
            gdN: 0,
            g10: 0,
            g10N: 0,
            xd: 0,
            xdN: 0,
            cd: 0,
            cdN: 0,
            goldShare: 0,
            goldShareN: 0,
            behindN: 0,
            behindW: 0,
            aheadN: 0,
            aheadW: 0,
            pool: {},
          });
        rec.games += 1;
        rec.wins += row.win ? 1 : 0;
        rec.k += row.kda[0];
        rec.d += row.kda[1];
        rec.a += row.kda[2];
        rec.dpm += row.dpm || 0;
        rec.cspm += row.cspm || 0;
        rec.vpm += row.vpm || 0;
        rec.kp += row.kp || 0;
        if (row.gd15 != null) {
          rec.gd += row.gd15;
          rec.gdN += 1;
        }
        if (row.gd10 != null) {
          rec.g10 += row.gd10;
          rec.g10N += 1;
        }
        if (row.xd15 != null) {
          rec.xd += row.xd15;
          rec.xdN += 1;
        }
        if (row.cd15 != null) {
          rec.cd += row.cd15;
          rec.cdN += 1;
        }
        if (row.goldShare != null) {
          rec.goldShare += row.goldShare;
          rec.goldShareN += 1;
        }
        if (row.teamGd15 != null) {
          if (row.teamGd15 <= TAG_BEHIND) {
            rec.behindN += 1;
            rec.behindW += row.win ? 1 : 0;
          } else if (row.teamGd15 >= TAG_AHEAD) {
            rec.aheadN += 1;
            rec.aheadW += row.win ? 1 : 0;
          }
        }
        if (row.champ) rec.pool[row.champ] = true;
      }
    }
  }
  const roles = {};
  for (let i = 0; i < ROLE_KEYS.length; i += 1) {
    const roleKey = ROLE_KEYS[i];
    const raw = buckets[roleKey] || {};
    const keys = Object.keys(raw);
    const players = {};
    const lists = {
      wr: [],
      kda: [],
      kills: [],
      deaths: [],
      assists: [],
      dpm: [],
      cspm: [],
      vpm: [],
      kp: [],
      gd10: [],
      gd15: [],
      xd15: [],
      cd15: [],
      goldShare: [],
      clutch: [],
      choke: [],
      champs: [],
      score: [],
    };
    for (let j = 0; j < keys.length; j += 1) {
      const rec = raw[keys[j]];
      rec.champs = Object.keys(rec.pool).length;
      if (rec.games < TAG_MIN_GAMES) continue;
      const metrics = peerMetrics(rec);
      if (!metrics) continue;
      players[metrics.key] = metrics;
      const fields = Object.keys(lists);
      for (let f = 0; f < fields.length; f += 1) {
        const field = fields[f];
        if (metrics[field] == null || !isFinite(metrics[field])) continue;
        lists[field].push(metrics[field]);
      }
    }
    const fields = Object.keys(lists);
    const stats = {};
    for (let f = 0; f < fields.length; f += 1) {
      lists[fields[f]] = sortedCopy(lists[fields[f]]);
      stats[fields[f]] = fieldStats(lists[fields[f]]);
    }
    roles[roleKey] = { players: players, lists: lists, stats: stats, n: Object.keys(players).length };
  }
  tagBoard = { key: key, roles: roles };
  return roles;
}

function fmtTagNum(value, kind) {
  if (value == null || !isFinite(value)) return "—";
  if (kind === "pct") return fmtPct(value);
  if (kind === "diff") return fmtDiff(value);
  if (kind === "score") return fmtScore(value);
  if (kind === "int") return String(Math.round(value));
  return value.toFixed(2);
}

function currentStreak(name, roleKey) {
  const want = playerKey(name);
  const wantRole = ROLE_KEYS.indexOf((roleKey || "").toLowerCase());
  const games = filteredGames();
  const rows = [];
  for (let i = 0; i < games.length; i += 1) {
    const game = games[i];
    for (let r = 0; r < 5; r += 1) {
      if (wantRole >= 0 && r !== wantRole) continue;
      const sides = [
        { names: game.bp, win: game.w === 1 },
        { names: game.rp, win: game.w === 0 },
      ];
      for (let s = 0; s < 2; s += 1) {
        if (playerKey(sides[s].names[r] || "") !== want) continue;
        rows.push({ d: game.d || "", g: String(game.g || ""), win: sides[s].win });
      }
    }
  }
  rows.sort(function (a, b) {
    if (a.d !== b.d) return a.d < b.d ? 1 : -1;
    return a.g < b.g ? 1 : -1;
  });
  if (!rows.length) return null;
  const win = rows[0].win;
  let n = 0;
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].win !== win) break;
    n += 1;
  }
  return { n: n, win: win };
}

function teammateGap(name, team, roleKey) {
  if (!team) return null;
  const want = playerKey(name);
  const games = filteredGames();
  const mates = {};
  for (let i = 0; i < games.length; i += 1) {
    const game = games[i];
    let names = null;
    if (game.bt === team) names = game.bp;
    else if (game.rt === team) names = game.rp;
    if (!names) continue;
    for (let r = 0; r < 5; r += 1) {
      const nm = names[r] || "";
      const key = playerKey(nm);
      if (!key || key === want) continue;
      const rec = mates[key] || (mates[key] = { n: nm, g: 0, roles: {} });
      rec.g += 1;
      rec.roles[ROLE_KEYS[r]] = (rec.roles[ROLE_KEYS[r]] || 0) + 1;
    }
  }
  const scores = [];
  const keys = Object.keys(mates);
  for (let i = 0; i < keys.length; i += 1) {
    const rec = mates[keys[i]];
    if (rec.g < 2) continue;
    const score = ratingScore(rec.n, mostCommon(rec.roles));
    if (score == null || !isFinite(score)) continue;
    scores.push(score);
  }
  const playerScore = ratingScore(name, roleKey);
  if (playerScore == null || scores.length < TAG_TEAM_MATES) return null;
  let best = scores[0];
  for (let i = 1; i < scores.length; i += 1) {
    if (scores[i] > best) best = scores[i];
  }
  return {
    signal: tagSignal(fieldStats(scores), playerScore),
    playerScore: playerScore,
    best: best,
    vsBest: playerScore - best,
  };
}

function considerTag(out, label, tone, signal, high, detail, kind, peerLabel, limits) {
  if (!signal) return;
  if (high && signal.vsMean <= 0) return;
  if (!high && signal.vsMean >= 0) return;
  if (signal.std < 1e-9 && signal.iqr < 1e-9) return;
  const needZ = limits && limits.z != null ? limits.z : TAG_Z;
  const needIqr = limits && limits.iqr != null ? limits.iqr : TAG_IQR;
  const magZ = Math.abs(signal.z);
  const magIqr = Math.abs(signal.iqrDist);
  if (magZ < needZ && magIqr < needIqr) return;
  const edge = Math.max(magZ / needZ, magIqr / needIqr);
  out.push({
    label: label,
    tone: tone,
    edge: edge,
    title:
      detail +
      " " +
      fmtTagNum(signal.value, kind) +
      " vs " +
      peerLabel +
      " avg " +
      fmtTagNum(signal.mean, kind) +
      " · " +
      (signal.z >= 0 ? "+" : "−") +
      Math.abs(signal.z).toFixed(1) +
      "σ / " +
      (signal.iqrDist >= 0 ? "+" : "−") +
      Math.abs(signal.iqrDist).toFixed(1) +
      " IQR",
  });
}

function playerTags(name, roleKey, stats, limit) {
  const roles = buildRoleBoard();
  const board = roles[roleKey];
  if (!board || board.n < TAG_MIN_PEERS) return [];
  const rec = board.players[playerKey(name)];
  if (!rec) return [];
  const field = board.stats || {};
  const peerLabel = tagPeerLabel(roleKey);
  const tags = [];
  const isFarm = roleKey === "top" || roleKey === "mid" || roleKey === "adc";
  const isJng = roleKey === "jng";
  const isSup = roleKey === "sup";
  function signal(key) {
    return tagSignal(field[key], rec[key]);
  }
  if (isJng) {
    considerTag(tags, "Map pressure", "up", signal("gd15"), true, "Gold lead at 15", "diff", peerLabel);
    considerTag(tags, "Behind the map", "down", signal("gd15"), false, "Gold lead at 15", "diff", peerLabel);
  } else {
    considerTag(tags, "Lane dominant", "up", signal("gd15"), true, "GD@15", "diff", peerLabel);
    considerTag(tags, "Lane loser", "down", signal("gd15"), false, "GD@15", "diff", peerLabel);
  }
  considerTag(tags, "Early bully", "up", signal("gd10"), true, "GD@10", "diff", peerLabel);
  considerTag(
    tags,
    "Slow starter",
    "down",
    signal("gd10"),
    false,
    "GD@10",
    "diff",
    peerLabel,
    { z: TAG_Z_LOOSE, iqr: TAG_IQR_LOOSE }
  );
  considerTag(tags, "XP bully", "up", signal("xd15"), true, "XPD@15", "diff", peerLabel);
  if (isFarm) {
    considerTag(tags, "CS bully", "up", signal("cd15"), true, "CSD@15", "diff", peerLabel);
    considerTag(tags, "Farm starved", "down", signal("cd15"), false, "CSD@15", "diff", peerLabel);
  }
  considerTag(tags, "Damage threat", "up", signal("dpm"), true, "Damage per minute", "rate", peerLabel);
  considerTag(tags, "Low impact", "down", signal("dpm"), false, "Damage per minute", "rate", peerLabel);
  considerTag(tags, "Killer", "up", signal("kills"), true, "Kills per game", "rate", peerLabel);
  considerTag(tags, "Clean", "up", signal("deaths"), false, "Deaths per game", "rate", peerLabel);
  considerTag(tags, "Inter", "down", signal("deaths"), true, "Deaths per game", "rate", peerLabel);
  if (!isSup) {
    considerTag(tags, "Power farmer", "up", signal("cspm"), true, "CS per minute", "rate", peerLabel);
  }
  considerTag(tags, "Greedy", "down", signal("goldShare"), true, "Gold share", "pct", peerLabel);
  considerTag(tags, "Clutch", "up", signal("clutch"), true, "Win rate from behind", "pct", peerLabel);
  considerTag(tags, "Choker", "down", signal("choke"), true, "Loss rate from ahead", "pct", peerLabel);
  considerTag(tags, "Playmaker", "up", signal("kp"), true, "Kill participation", "pct", peerLabel);
  considerTag(tags, "Isolated", "down", signal("kp"), false, "Kill participation", "pct", peerLabel);
  considerTag(tags, "Clairvoyant", "up", signal("vpm"), true, "Vision per minute", "rate", peerLabel);
  considerTag(tags, "Blind", "down", signal("vpm"), false, "Vision per minute", "rate", peerLabel);
  if (isSup) {
    considerTag(tags, "Roamer", "up", signal("assists"), true, "Assists per game", "rate", peerLabel);
  }
  considerTag(tags, "Winning", "up", signal("wr"), true, "Win rate", "pct", peerLabel);
  considerTag(tags, "Losing", "down", signal("wr"), false, "Win rate", "pct", peerLabel);
  considerTag(tags, "Elite", "up", signal("score"), true, "Role rating", "score", peerLabel);
  considerTag(tags, "Fringe", "down", signal("score"), false, "Role rating", "score", peerLabel);
  considerTag(tags, "One-trick", "mid", signal("champs"), false, "Champion pool", "int", peerLabel);
  considerTag(tags, "Diverse pool", "mid", signal("champs"), true, "Champion pool", "int", peerLabel);
  const streak = currentStreak(name, roleKey);
  if (streak && streak.n >= TAG_STREAK_MIN) {
    tags.push({
      label: streak.win ? "Win streak" : "Loss streak",
      tone: streak.win ? "up" : "down",
      edge: streak.n / TAG_STREAK_MIN,
      title: (streak.win ? "Won" : "Lost") + " last " + streak.n + " games",
    });
  }
  const team = (stats && stats.team) || "";
  const mates = teammateGap(name, team, roleKey);
  const gap = mates && mates.signal;
  const playerScore = rec.score != null ? rec.score : (mates && mates.playerScore);
  considerTag(
    tags,
    "Elo hell",
    "up",
    gap,
    true,
    "Score vs " + (team || "teammates"),
    "score",
    "teammates"
  );
  if (playerScore == null || playerScore <= TAG_BOOST_MAX) {
    considerTag(
      tags,
      "Boosted",
      "down",
      gap,
      false,
      "Score vs " + (team || "teammates"),
      "score",
      "teammates"
    );
  }
  if (rec.wr < 0.5 && playerScore != null && playerScore > 0) {
    tags.push({
      label: "Innocent",
      tone: "mid",
      edge: 1 + playerScore / 4,
      title: "Positive score " + fmtScore(playerScore) + " with " + fmtPct(rec.wr) + " WR",
    });
  }
  const hasElite = tags.some(function (tag) {
    return tag.label === "Elite";
  });
  if (
    mates &&
    mates.vsBest <= -TAG_TEAM_GAP &&
    !hasElite &&
    playerScore != null &&
    playerScore <= TAG_DEAD_MAX
  ) {
    tags.push({
      label: "Dead weight",
      tone: "down",
      edge: Math.abs(mates.vsBest) / TAG_TEAM_GAP,
      title:
        fmtScore(mates.playerScore) +
        " vs team best " +
        fmtScore(mates.best) +
        " (" +
        fmtScore(mates.vsBest) +
        ")",
    });
  } else if (mates && mates.vsBest >= TAG_TEAM_GAP) {
    tags.push({
      label: "Trying",
      tone: "up",
      edge: mates.vsBest / TAG_TEAM_GAP,
      title:
        fmtScore(mates.playerScore) +
        " vs next best " +
        fmtScore(mates.best) +
        " (" +
        fmtScore(mates.vsBest) +
        ")",
    });
  }
  tags.sort(function (a, b) {
    return b.edge - a.edge;
  });
  const seen = {};
  const out = [];
  for (let i = 0; i < tags.length; i += 1) {
    if (seen[tags[i].label]) continue;
    seen[tags[i].label] = true;
    out.push(tags[i]);
    if (limit !== 0 && out.length >= (limit || TAG_MAX)) break;
  }
  return out;
}

function champPool(rows) {
  const map = {};
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const id = row.champ;
    if (!map[id]) {
      map[id] = {
        id: id,
        name: champName(id),
        roles: {},
        games: 0,
        wins: 0,
        k: 0,
        d: 0,
        a: 0,
        cs: 0,
        dmg: 0,
        gd: 0,
        gdN: 0,
      };
    }
    const rec = map[id];
    rec.games += 1;
    rec.wins += row.win ? 1 : 0;
    rec.k += row.kda[0];
    rec.d += row.kda[1];
    rec.a += row.kda[2];
    rec.cs += row.cs;
    rec.dmg += row.dmg;
    rec.roles[row.role] = (rec.roles[row.role] || 0) + 1;
    if (row.gd15 != null) {
      rec.gd += row.gd15;
      rec.gdN += 1;
    }
  }
  const out = [];
  const ids = Object.keys(map);
  for (let i = 0; i < ids.length; i += 1) {
    const rec = map[ids[i]];
    const rated = playerChampRow(player, rec.id);
    out.push({
      id: rec.id,
      name: rec.name,
      role: mostCommon(rec.roles),
      games: rec.games,
      wins: rec.wins,
      winRate: rec.games ? rec.wins / rec.games : 0,
      kda: kdaRatio(rec.k, rec.d, rec.a),
      avgKda: fmtAvg(rec.k / rec.games) + " / " + fmtAvg(rec.d / rec.games) + " / " + fmtAvg(rec.a / rec.games),
      avgCs: rec.games ? rec.cs / rec.games : 0,
      avgDmg: rec.games ? rec.dmg / rec.games : 0,
      avgGd15: rec.gdN ? rec.gd / rec.gdN : 0,
      rank: rated ? rated.k : null,
      score: rated ? rated.s : null,
    });
  }
  return sortRows(out, poolSort, poolDir);
}

function directoryRows() {
  const wantRole = role === "All" ? -1 : ROLE_KEYS.indexOf(role.toLowerCase());
  const q = search.trim().toLowerCase();
  const games = filteredGames();
  const map = {};
  for (let i = 0; i < games.length; i += 1) {
    const game = games[i];
    const sides = [
      { names: game.bp, champs: game.b, kdas: game.bk, team: game.bt, win: game.w === 1 },
      { names: game.rp, champs: game.r, kdas: game.rk, team: game.rt, win: game.w === 0 },
    ];
    for (let s = 0; s < 2; s += 1) {
      const side = sides[s];
      for (let r = 0; r < 5; r += 1) {
        if (wantRole >= 0 && r !== wantRole) continue;
        const name = side.names[r];
        const key = playerKey(name);
        if (!key) continue;
        if (q && name.toLowerCase().indexOf(q) === -1) continue;
        if (!map[key]) {
          map[key] = {
            key: key,
            name: name,
            teams: {},
            champs: {},
            roles: {},
            games: 0,
            wins: 0,
            k: 0,
            d: 0,
            a: 0,
          };
        }
        const rec = map[key];
        rec.name = name;
        rec.games += 1;
        rec.wins += side.win ? 1 : 0;
        rec.k += side.kdas[r][0];
        rec.d += side.kdas[r][1];
        rec.a += side.kdas[r][2];
        rec.teams[side.team] = (rec.teams[side.team] || 0) + 1;
        rec.champs[side.champs[r]] = (rec.champs[side.champs[r]] || 0) + 1;
        rec.roles[ROLE_KEYS[r]] = (rec.roles[ROLE_KEYS[r]] || 0) + 1;
      }
    }
  }
  const out = [];
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i += 1) {
    const rec = map[keys[i]];
    if (wantRole >= 0 && rec.games < ROLE_MIN_GAMES) continue;
    const primaryRole = mostCommon(rec.roles);
    const scoreRole = role === "All" ? primaryRole : role.toLowerCase();
    const champs = topKeys(rec.champs, 5);
    out.push({
      key: rec.key,
      name: rec.name,
      team: mostCommon(rec.teams),
      champ: champs[0] || "",
      champs: champs,
      role: primaryRole,
      games: rec.games,
      wins: rec.wins,
      winRate: rec.games ? rec.wins / rec.games : 0,
      kda: kdaRatio(rec.k, rec.d, rec.a),
      score: ratingScore(rec.name, scoreRole),
      rel: ratingRel(rec.name, scoreRole),
      vs: ratingVsTeam(rec.name, scoreRole, mostCommon(rec.teams)),
    });
  }
  return sortRows(out, dirSort, dirDir);
}

function syncUrl() {
  const url = new URL(location.href);
  if (player) url.searchParams.set("player", player);
  else url.searchParams.delete("player");
  url.searchParams.set("league", formatSel(leagues));
  url.searchParams.set("role", role);
  url.searchParams.set("window", RIFT_WINDOW.param());
  url.searchParams.set("patch", formatSel(patches));
  url.searchParams.set("tag", formatSel(tagFilters));
  history.replaceState({}, "", url);
}

function tile(label, value, tone) {
  const box = document.createElement("div");
  box.className = "match-stat-tile";
  const lbl = document.createElement("span");
  lbl.className = "lbl";
  lbl.textContent = label;
  const val = document.createElement("span");
  val.className = "val" + (tone ? " " + tone : "");
  val.textContent = value;
  box.append(lbl, val);
  return box;
}

function champCell(id, label) {
  const wrap = document.createElement("div");
  wrap.className = "pro-champ";
  const img = document.createElement("img");
  img.src = portrait(id);
  img.alt = champName(id);
  const name = document.createElement("span");
  name.textContent = label || champName(id);
  wrap.append(img, name);
  return wrap;
}

function champStrip(ids) {
  const wrap = document.createElement("div");
  wrap.className = "champ-strip";
  for (let i = 0; i < ids.length; i += 1) {
    const img = document.createElement("img");
    img.src = portrait(ids[i]);
    img.alt = champName(ids[i]);
    img.title = champName(ids[i]);
    img.addEventListener("click", function (event) {
      event.stopPropagation();
      player = "";
      champFilter = "";
      search = champName(ids[i]);
      els.search.value = search;
      syncUrl();
      render();
    });
    wrap.append(img);
  }
  if (!ids.length) wrap.textContent = "—";
  return wrap;
}

function emptyRow(root, cols, text) {
  root.innerHTML = "";
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = cols;
  td.className = "pick-empty";
  td.textContent = text;
  tr.append(td);
  root.append(tr);
}

function setHead(root, cols, sortKey, sortDir, onSort) {
  root.innerHTML = "";
  const tr = document.createElement("tr");
  for (let i = 0; i < cols.length; i += 1) {
    const col = cols[i];
    const th = document.createElement("th");
    th.textContent = col.label;
    if (col.num) th.className = "sort-num";
    if (col.title) th.title = col.title;
    th.setAttribute("data-sort", col.key);
    if (sortKey === col.key) th.classList.add(sortDir < 0 ? "sort-desc" : "sort-asc");
    th.addEventListener("click", function () {
      onSort(col.key);
    });
    tr.append(th);
  }
  root.append(tr);
}

function renderDirectory() {
  if (els.layout) els.layout.classList.add("is-directory");
  if (els.summary) els.summary.classList.remove("is-detail");
  setHidden(els.summary, true);
  setHidden(els.side, true);
  if (els.poolTitle) els.poolTitle.textContent = "Players";
  els.title.textContent = !leagues.length ? "Players" : leagues.join(" · ");
  const rows = directoryRows().filter(function (row) {
    if (!tagFilters.length) return true;
    const tags = playerTags(row.name, role === "All" ? row.role : role.toLowerCase(), row, 0);
    row.tags = tags;
    for (let i = 0; i < tags.length; i += 1) {
      if (tagFilters.indexOf(tags[i].label) !== -1) return true;
    }
    return false;
  });
  els.range.textContent = rows.length.toLocaleString() + " players";
  setHead(
    els.poolHead,
    [
      { key: "name", label: "Player" },
      { key: "vs", label: "True score", num: true },
      { key: "score", label: "Score", num: true },
      { key: "rel", label: "Mastery", num: true },
      { key: "team", label: "Team" },
      { key: "champ", label: "Champs" },
      { key: "games", label: "Games", num: true },
      { key: "winRate", label: "WR", num: true },
      { key: "kda", label: "KDA", num: true },
    ],
    dirSort,
    dirDir,
    function (key) {
      if (dirSort === key) dirDir *= -1;
      else {
        dirSort = key;
        dirDir = key === "name" || key === "team" ? 1 : -1;
      }
      render();
    }
  );
  if (!rows.length) {
    emptyRow(els.poolBody, 9, "No players match that filter.");
    return;
  }
  els.poolBody.innerHTML = "";
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const tr = document.createElement("tr");
    tr.addEventListener("click", function () {
      player = row.name;
      champFilter = "";
      els.search.value = "";
      search = "";
      syncUrl();
      render();
    });
    const name = document.createElement("td");
    const nameWrap = document.createElement("div");
    nameWrap.className = "player-name-cell";
    const who = document.createElement("span");
    who.textContent = row.name;
    nameWrap.append(who);
    const tags = row.tags || playerTags(row.name, role === "All" ? row.role : role.toLowerCase(), row);
    if (tags.length) nameWrap.append(tagPills(tags, 2));
    name.append(nameWrap);
    const score = document.createElement("td");
    score.className = "num " + scoreTone(row.score);
    score.textContent = fmtScore(row.score);
    score.title = "Current player score";
    const rel = document.createElement("td");
    rel.className = "num " + scoreTone(row.rel);
    rel.textContent = fmtScore(row.rel);
    rel.title = "Games-weighted average of champion-relative scores";
    const vs = document.createElement("td");
    vs.className = "num " + scoreTone(row.vs);
    vs.textContent = fmtScore(row.vs);
    vs.title = "Average of Score and Mastery vs team average — above teammates inflates, below deflates";
    const team = document.createElement("td");
    team.textContent = row.team || "—";
    const main = document.createElement("td");
    main.append(champStrip(row.champs || (row.champ ? [row.champ] : [])));
    const games = document.createElement("td");
    games.className = "num";
    games.textContent = row.games.toLocaleString();
    const wr = document.createElement("td");
    wr.className = "num " + (row.winRate >= 0.5 ? "wr-up" : "wr-down");
    wr.textContent = fmtPct(row.winRate);
    const kda = document.createElement("td");
    kda.className = "num";
    kda.textContent = fmtRate(row.kda);
    tr.append(name, vs, score, rel, team, main, games, wr, kda);
    els.poolBody.append(tr);
  }
}

function renderChampLadder(ladder) {
  if (els.layout) els.layout.classList.add("is-directory");
  if (els.summary) els.summary.classList.remove("is-detail");
  setHidden(els.summary, true);
  setHidden(els.side, true);
  const title = ladder.title || "Champion";
  els.poolTitle.textContent = title;
  els.title.textContent = title;
  document.title = title + " — Best players";
  const rows = ladder.players || [];
  els.range.textContent = rows.length.toLocaleString() + " players";
  setHead(
    els.poolHead,
    [
      { key: "k", label: "#", num: true },
      { key: "n", label: "Player" },
      { key: "s", label: "Score", num: true },
      { key: "l", label: "League" },
      { key: "t", label: "Team" },
      { key: "g", label: "Games", num: true },
      { key: "wr", label: "WR", num: true },
    ],
    "s",
    -1,
    function () {}
  );
  if (!rows.length) {
    emptyRow(els.poolBody, 7, "Not enough games to rank this champion.");
    return;
  }
  const champId = champIdFromTitle(title);
  els.poolBody.innerHTML = "";
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const tr = document.createElement("tr");
    tr.addEventListener("click", function () {
      player = row.n;
      champFilter = champId;
      els.search.value = "";
      search = "";
      syncUrl();
      render();
    });
    const rank = document.createElement("td");
    rank.className = "num";
    rank.textContent = String(row.k || i + 1);
    const name = document.createElement("td");
    name.textContent = row.n;
    const score = document.createElement("td");
    score.className = "num " + scoreTone(row.s);
    score.textContent = fmtScore(row.s);
    const leagueCell = document.createElement("td");
    leagueCell.textContent = row.l || "—";
    const team = document.createElement("td");
    team.textContent = row.t || "—";
    const games = document.createElement("td");
    games.className = "num";
    games.textContent = String(row.g || 0);
    const wr = document.createElement("td");
    wr.className = "num " + (row.wr >= 0.5 ? "wr-up" : "wr-down");
    wr.textContent = fmtPct(row.wr);
    tr.append(rank, name, score, leagueCell, team, games, wr);
    els.poolBody.append(tr);
  }
}

function formPeerStats(roleKey) {
  const bucket = ((liveBoard().roles || {})[roleKey]) || {};
  const keys = Object.keys(bucket);
  const anchor = [];
  const all = [];
  for (let i = 0; i < keys.length; i += 1) {
    const rec = bucket[keys[i]];
    if (!rec || rec.form == null || !isFinite(rec.form)) continue;
    all.push(rec.form);
    if ((rec.g || 0) >= 4) anchor.push(rec.form);
  }
  return meanStd(anchor.length >= 2 ? anchor : all);
}

function rollingForm(games, latest, prior, shrink, season, halfLife) {
  let wSum = 0;
  let predSum = 0;
  let g = 0;
  for (let i = 0; i < games.length; i += 1) {
    if (games[i].date > latest) break;
    const w = obsWeight(games[i].date, latest, halfLife);
    wSum += w;
    predSum += w * games[i].pred;
    g += 1;
  }
  if (!g) return null;
  const hot = wSum ? predSum / wSum : 0;
  const mixed = (wSum * hot + prior * season) / (wSum + prior);
  return (g / (g + shrink)) * mixed;
}

function formTrueScore(form, peers, formW, ctx, mastery, teamAvg, roleKey) {
  if (form == null || !isFinite(form)) return null;
  const formZ = (form - peers[0]) / peers[1];
  const score = (formW * formZ + ctx) * 10;
  const vs = vsTeamScore(ratingBlend(score, mastery), teamAvg);
  if (vs != null) return vs;
  return ratingBlend(score, mastery);
}

function trueScoreSeries(name, roleKey, teamName) {
  const roleIndex = ROLE_KEYS.indexOf((roleKey || "").toLowerCase());
  if (roleIndex < 0) return [];
  const games = filteredGames();
  const model = ratingsModel();
  const blend = model.blend || {};
  const weights = (model.weights && model.weights[roleKey]) || [];
  const prior = model.prior || 28;
  const shrink = model.shrink || 24;
  const halfLife = model.halfLife || 40;
  const formW = blend.form == null ? 0.5 : blend.form;
  const regionBlend = blend.region == null ? 0.18 : blend.region;
  const region = model.region || {};
  const frozen = (window.RIFT_PLAYER_RATINGS && window.RIFT_PLAYER_RATINGS.roles) || {};
  const teamAvgs = teamAvgMap();
  const peers = formPeerStats(roleKey);
  let rows = roleObs(games, roleIndex);
  if (roleKey === "top") residualizeTopFeats(rows);
  const z = zByGroup(
    rows,
    function (row) {
      return row.league;
    },
    function (row) {
      return row.feats;
    }
  );
  for (let i = 0; i < rows.length; i += 1) {
    let pred = 0;
    const zi = z[i] || [];
    for (let j = 0; j < weights.length; j += 1) pred += (zi[j] || 0) * (weights[j] || 0);
    rows[i].pred = pred;
  }
  const bags = {};
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const key = playerKey(row.name);
    if (!key) continue;
    const pred = row.pred || 0;
    const rec = bags[key] || (bags[key] = {
      name: row.name,
      key: key,
      games: [],
      teams: {},
      leagues: {},
    });
    rec.games.push({ date: row.date || "", pred: pred });
    if (row.team) rec.teams[row.team] = (rec.teams[row.team] || 0) + 1;
    if (row.league) rec.leagues[row.league] = (rec.leagues[row.league] || 0) + 1;
  }
  const bagKeys = Object.keys(bags);
  for (let i = 0; i < bagKeys.length; i += 1) {
    const rec = bags[bagKeys[i]];
    rec.games.sort(function (a, b) {
      if (a.date < b.date) return -1;
      if (a.date > b.date) return 1;
      return 0;
    });
    rec.team = mostCommon(rec.teams);
    rec.league = mostCommon(rec.leagues);
    rec.mastery = ratingRel(rec.name, roleKey);
    const frozenRec = frozen[roleKey] && frozen[roleKey][rec.key];
    rec.season = frozenRec && frozenRec.sf != null ? frozenRec.sf : 0;
    rec.ctx = frozenRec && frozenRec.c != null ? frozenRec.c : regionBlend * (region[rec.league] || 0);
    rec.teamAvg = teamAvgs[rec.team];
  }
  const want = playerKey(name);
  const mine = bags[want];
  if (!mine || mine.games.length < 2) return [];
  if (teamName && teamAvgs[teamName] != null) mine.teamAvg = teamAvgs[teamName];
  const out = [];
  for (let t = 0; t < mine.games.length; t += 1) {
    const latest = mine.games[t].date;
    const form = rollingForm(mine.games, latest, prior, shrink, mine.season, halfLife);
    const v = formTrueScore(form, peers, formW, mine.ctx, mine.mastery, mine.teamAvg, roleKey);
    let roleSum = 0;
    let roleN = 0;
    for (let i = 0; i < bagKeys.length; i += 1) {
      const rec = bags[bagKeys[i]];
      const other = rollingForm(rec.games, latest, prior, shrink, rec.season, halfLife);
      const score = formTrueScore(other, peers, formW, rec.ctx, rec.mastery, rec.teamAvg, roleKey);
      if (score == null || !isFinite(score)) continue;
      roleSum += score;
      roleN += 1;
    }
    out.push({
      date: latest,
      v: v,
      role: roleN ? roleSum / roleN : null,
    });
  }
  return out;
}

function svgEl(name, attrs) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  const keys = Object.keys(attrs || {});
  for (let i = 0; i < keys.length; i += 1) node.setAttribute(keys[i], attrs[keys[i]]);
  return node;
}

function trueScoreChart(points, roleKey) {
  const wrap = document.createElement("div");
  wrap.className = "player-score-chart";
  const roleLabel = (roleKey || "").toUpperCase() || "ROLE";
  const head = document.createElement("div");
  head.className = "player-score-chart-head";
  const lbl = document.createElement("span");
  lbl.className = "lbl";
  lbl.textContent = "True score";
  const val = document.createElement("span");
  val.className = "player-score-chart-val";
  const avgVal = document.createElement("span");
  avgVal.className = "player-score-chart-avg";
  head.append(lbl, val, avgVal);
  wrap.append(head);
  const usable = [];
  for (let i = 0; i < (points || []).length; i += 1) {
    if (points[i] && points[i].v != null && isFinite(points[i].v)) usable.push(points[i]);
  }
  if (usable.length < 2) {
    const empty = document.createElement("span");
    empty.className = "muted";
    empty.textContent = "Not enough games";
    wrap.append(empty);
    return wrap;
  }
  const w = 280;
  const h = 48;
  const pad = { t: 4, r: 6, b: 4, l: 6 };
  let min = 0;
  let max = 0;
  for (let i = 0; i < usable.length; i += 1) {
    if (usable[i].v < min) min = usable[i].v;
    if (usable[i].v > max) max = usable[i].v;
    if (usable[i].role != null && isFinite(usable[i].role)) {
      if (usable[i].role < min) min = usable[i].role;
      if (usable[i].role > max) max = usable[i].role;
    }
  }
  if (max - min < 1) {
    min -= 1;
    max += 1;
  }
  const padY = (max - min) * 0.12;
  min -= padY;
  max += padY;
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  function xOf(i) {
    return pad.l + (i / (usable.length - 1)) * iw;
  }
  function yOf(v) {
    return pad.t + (1 - (v - min) / (max - min)) * ih;
  }
  function linePath(key) {
    let d = "";
    for (let i = 0; i < usable.length; i += 1) {
      const n = usable[i][key];
      if (n == null || !isFinite(n)) continue;
      d += (d ? " L " : "M ") + xOf(i).toFixed(1) + " " + yOf(n).toFixed(1);
    }
    return d;
  }
  const zeroY = min < 0 && max > 0 ? yOf(0) : null;
  const line = linePath("v");
  const roleLine = linePath("role");
  const last = usable[usable.length - 1];
  function paintVal(hit) {
    val.textContent = fmtScore(hit.v);
    val.className =
      "player-score-chart-val " + (hit.v > 0 ? "wr-up" : hit.v < 0 ? "wr-down" : "");
    if (hit.role != null && isFinite(hit.role)) {
      avgVal.textContent = roleLabel + " " + fmtScore(hit.role);
      avgVal.hidden = false;
    } else {
      avgVal.textContent = "";
      avgVal.hidden = true;
    }
  }
  paintVal(last);
  const svg = svgEl("svg", { viewBox: "0 0 " + w + " " + h, preserveAspectRatio: "none" });
  if (zeroY != null) {
    svg.append(
      svgEl("line", {
        x1: String(pad.l),
        x2: String(w - pad.r),
        y1: zeroY.toFixed(1),
        y2: zeroY.toFixed(1),
        stroke: "rgba(197, 208, 216, 0.22)",
        "stroke-width": "1",
        "stroke-dasharray": "3 3",
      })
    );
  }
  if (roleLine) {
    svg.append(
      svgEl("path", {
        d: roleLine,
        fill: "none",
        stroke: "rgba(197, 208, 216, 0.72)",
        "stroke-width": "1.4",
        "stroke-dasharray": "4 3",
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
      })
    );
  }
  svg.append(
    svgEl("path", {
      d: line,
      fill: "none",
      stroke: last.v >= 0 ? "#7dffb3" : "#ff8b9a",
      "stroke-width": "1.8",
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    })
  );
  const mark = svgEl("circle", {
    cx: xOf(usable.length - 1).toFixed(1),
    cy: yOf(last.v).toFixed(1),
    r: "2.6",
    fill: last.v >= 0 ? "#7dffb3" : "#ff8b9a",
  });
  svg.append(mark);
  wrap.append(svg);
  const axis = document.createElement("div");
  axis.className = "player-score-chart-axis";
  const firstDate = document.createElement("span");
  firstDate.textContent = (usable[0].date || "").slice(5);
  const lastDate = document.createElement("span");
  lastDate.textContent = (last.date || "").slice(5);
  axis.append(firstDate, lastDate);
  wrap.append(axis);
  wrap.title = "Player vs " + roleLabel + " average in this filter";
  svg.addEventListener("mousemove", function (event) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const t = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const i = Math.round(t * (usable.length - 1));
    const hit = usable[i];
    if (!hit) return;
    paintVal(hit);
    mark.setAttribute("cx", xOf(i).toFixed(1));
    mark.setAttribute("cy", yOf(hit.v).toFixed(1));
    wrap.title =
      (hit.date || "") +
      " · " +
      fmtScore(hit.v) +
      (hit.role != null && isFinite(hit.role) ? " · " + roleLabel + " " + fmtScore(hit.role) : "");
  });
  svg.addEventListener("mouseleave", function () {
    paintVal(last);
    mark.setAttribute("cx", xOf(usable.length - 1).toFixed(1));
    mark.setAttribute("cy", yOf(last.v).toFixed(1));
    wrap.title = "Player vs " + roleLabel + " average in this filter";
  });
  return wrap;
}

function tagPills(tags, max) {
  const row = document.createElement("div");
  row.className = "player-tags" + (max && max < TAG_MAX ? " compact" : "");
  const n = Math.min(tags.length, max || TAG_MAX);
  for (let i = 0; i < n; i += 1) {
    const tag = document.createElement("span");
    tag.className = "player-tag " + (tags[i].tone || "mid");
    tag.textContent = tags[i].label;
    tag.title = tags[i].title || tags[i].label;
    row.append(tag);
  }
  return row;
}

function renderSummary(stats) {
  if (!els.summary) return;
  setHidden(els.summary, false);
  els.summary.innerHTML = "";
  els.summary.classList.add("is-detail");
  const roleKey = role === "All" ? stats.role : role.toLowerCase();
  const tags = playerTags(stats.name, roleKey, stats);
  if (tags.length) els.summary.append(tagPills(tags));
  const tiles = document.createElement("div");
  tiles.className = "player-summary-tiles";
  const rating = ratingScore(stats.name, roleKey);
  const rel = ratingRel(stats.name, roleKey);
  const vs = ratingVsTeam(stats.name, roleKey, stats.team);
  tiles.append(tile("Team", stats.team || "—"));
  tiles.append(tile("Role", (stats.role || "").toUpperCase() || "—"));
  tiles.append(tile("True score", fmtScore(vs), scoreTone(vs)));
  tiles.append(tile("Score", fmtScore(rating), scoreTone(rating)));
  tiles.append(tile("Mastery", fmtScore(rel), scoreTone(rel)));
  tiles.append(tile("Games", stats.games.toLocaleString()));
  tiles.append(tile("WR", fmtPct(stats.winRate), stats.winRate >= 0.5 ? "up" : "down"));
  tiles.append(tile("KDA", fmtRate(stats.kda)));
  tiles.append(tile("K / D / A", fmtAvg(stats.avgK) + " / " + fmtAvg(stats.avgD) + " / " + fmtAvg(stats.avgA)));
  tiles.append(tile("CSPM", fmtAvg(stats.avgCspm)));
  tiles.append(tile("DPM", fmtK(stats.avgDpm)));
  tiles.append(tile("GD@15", fmtDiff(stats.avgGd15), stats.avgGd15 > 0 ? "up" : stats.avgGd15 < 0 ? "down" : ""));
  els.summary.append(tiles);
  els.summary.append(trueScoreChart(trueScoreSeries(stats.name, roleKey, stats.team), roleKey));
}

function renderPool(rows) {
  els.poolTitle.textContent = "Champion pool";
  setHead(
    els.poolHead,
    [
      { key: "name", label: "Champion" },
      { key: "rank", label: "Rank", num: true },
      { key: "score", label: "Score", num: true },
      { key: "role", label: "Role" },
      { key: "games", label: "Games", num: true },
      { key: "winRate", label: "WR", num: true },
      { key: "kda", label: "KDA", num: true },
      { key: "avgCs", label: "CS", num: true },
      { key: "avgDmg", label: "Dmg", num: true },
      { key: "avgGd15", label: "GD@15", num: true },
    ],
    poolSort,
    poolDir,
    function (key) {
      if (poolSort === key) poolDir *= -1;
      else {
        poolSort = key;
        poolDir = key === "name" || key === "role" ? 1 : -1;
      }
      render();
    }
  );
  if (!rows.length) {
    emptyRow(els.poolBody, 10, "No champion pool for that filter.");
    return;
  }
  els.poolBody.innerHTML = "";
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const tr = document.createElement("tr");
    if (row.id === champFilter) tr.className = "active";
    tr.addEventListener("click", function () {
      champFilter = champFilter === row.id ? "" : row.id;
      render();
    });
    const champ = document.createElement("td");
    champ.append(champCell(row.id, row.name));
    const rank = document.createElement("td");
    rank.className = "num";
    rank.textContent = row.rank ? "#" + row.rank : "—";
    rank.addEventListener("click", function (event) {
      event.stopPropagation();
      player = "";
      champFilter = "";
      search = row.name;
      els.search.value = search;
      syncUrl();
      render();
    });
    const score = document.createElement("td");
    score.className = "num " + scoreTone(row.score);
    score.textContent = fmtScore(row.score);
    const roleCell = document.createElement("td");
    roleCell.className = "pro-role";
    roleCell.textContent = row.role.toUpperCase();
    const games = document.createElement("td");
    games.className = "num";
    games.textContent = row.games.toLocaleString();
    const wr = document.createElement("td");
    wr.className = "num " + (row.winRate >= 0.5 ? "wr-up" : "wr-down");
    wr.textContent = fmtPct(row.winRate);
    const kda = document.createElement("td");
    kda.className = "num";
    kda.title = row.avgKda;
    kda.textContent = fmtRate(row.kda);
    const cs = document.createElement("td");
    cs.className = "num";
    cs.textContent = fmtAvg(row.avgCs);
    const dmg = document.createElement("td");
    dmg.className = "num";
    dmg.textContent = row.avgDmg ? fmtK(row.avgDmg) : "—";
    const gd = document.createElement("td");
    gd.className = "num " + (row.avgGd15 > 0 ? "wr-up" : row.avgGd15 < 0 ? "wr-down" : "");
    gd.textContent = fmtDiff(row.avgGd15);
    tr.append(champ, rank, score, roleCell, games, wr, kda, cs, dmg, gd);
    els.poolBody.append(tr);
  }
}

function renderGames(rows) {
  if (!els.side) return;
  setHidden(els.side, false);
  const shown = champFilter
    ? rows.filter(function (row) {
        return row.champ === champFilter;
      })
    : rows;
  els.gamesSub.textContent = champFilter
    ? champName(champFilter) + " · " + shown.length + " games"
    : shown.length + " games";
  els.gamesBody.innerHTML = "";
  if (!shown.length) {
    emptyRow(els.gamesBody, 5, "No games match that filter.");
    return;
  }
  const cap = Math.min(shown.length, 40);
  for (let i = 0; i < cap; i += 1) {
    const row = shown[i];
    const tr = document.createElement("tr");
    tr.addEventListener("click", function () {
      location.href =
        "match.html?g=" +
        encodeURIComponent(row.id) +
        "&champ=" +
        encodeURIComponent(row.champ) +
        "&from=" +
        encodeURIComponent(
          "player.html?player=" +
            encodeURIComponent(player) +
            "&league=" +
            encodeURIComponent(formatSel(leagues)) +
            "&window=" +
            encodeURIComponent(RIFT_WINDOW.param()) +
            "&patch=" +
            encodeURIComponent(formatSel(patches))
        );
    });
    const date = document.createElement("td");
    date.textContent = row.date.slice(5);
    const champ = document.createElement("td");
    champ.append(champCell(row.champ));
    const vs = document.createElement("td");
    vs.append(champCell(row.vs));
    const kda = document.createElement("td");
    kda.textContent = fmtKda(row.kda);
    const result = document.createElement("td");
    result.className = "num " + (row.win ? "wr-up" : "wr-down");
    result.textContent = row.win ? "W" : "L";
    tr.append(date, champ, vs, kda, result);
    els.gamesBody.append(tr);
  }
}

function renderChips() {
  const leagueOpts = LEAGUES.slice(1);
  chipRowMulti(els.leagues, LEAGUES, leagues, function (name) {
    leagues = toggleSel(leagues, name, leagueOpts);
    syncUrl();
    render();
  });
  chipRow(els.roles, ROLES, role, function (name) {
    role = name;
    syncUrl();
    render();
  });
  RIFT_WINDOW.mount(els.windows, function () {
    windowKey = RIFT_WINDOW.key;
    syncUrl();
    render();
  });
  const available = listPatches(windowGames());
  patches = patches.filter(function (name) {
    return available.indexOf(name) !== -1;
  });
  chipRowMulti(els.patches, ["All"].concat(available), patches, function (name) {
    patches = toggleSel(patches, name, available);
    syncUrl();
    render();
  });
  const showTags = !player && !findChampQuery(search);
  setHidden(els.tagCombo, !showTags);
  setHidden(document.getElementById("player-tags"), !showTags);
  if (showTags) {
    tagFilters = tagFilters.filter(function (name) {
      return TAG_LABELS.indexOf(name) !== -1;
    });
  }
  renderTagPicks(showTags);
}

function render() {
  renderChips();
  if (!player) {
    const champHit = findChampQuery(search);
    if (champHit) renderChampLadder(champHit);
    else renderDirectory();
    return;
  }
  const rows = listAppearances(player);
  if (!rows.length) {
    els.layout.classList.remove("is-directory");
    els.title.textContent = player;
    document.title = player + " — Player stats";
    els.range.textContent = "0 games";
    setHidden(els.summary, true);
    renderPool([]);
    renderGames([]);
    return;
  }
  els.layout.classList.remove("is-directory");
  const stats = summarize(rows);
  player = stats.name;
  els.title.textContent = stats.name;
  document.title = stats.name + " — Player stats";
  els.range.textContent = stats.games.toLocaleString() + " games";
  renderSummary(stats);
  renderPool(champPool(rows));
  renderGames(rows);
}

function showApp() {
  if (els.boot) {
    els.boot.classList.add("is-hidden");
    setHidden(els.boot, true);
    els.boot.remove();
  }
  setHidden(els.app, false);
}

function initData() {
  const data = window.RIFT_DRAFT_DATA;
  if (!data || !data.champions) throw new Error("Missing champion data");
  patch = data.patch;
  champMap = new Map(
    data.champions.map(function (champ) {
      return [champ.id, champ];
    })
  );
  bundle = window.RIFT_PRO_GAMES || bundle;
  if (!bundle.games || !bundle.games.length) throw new Error("Missing pro game logs");
}

function boot() {
  try {
    initData();
    els.search.addEventListener("input", function () {
      search = els.search.value;
      if (player && search) {
        player = "";
        champFilter = "";
        syncUrl();
      }
      render();
    });
    if (els.tagSearch) {
      els.tagSearch.addEventListener("input", renderTagMenu);
      els.tagSearch.addEventListener("focus", renderTagMenu);
      els.tagSearch.addEventListener("blur", function () {
        setTimeout(hideTagMenu, 120);
      });
      els.tagSearch.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
          els.tagSearch.value = "";
          hideTagMenu();
          return;
        }
        if (event.key !== "Enter") return;
        const hits = searchTags(els.tagSearch.value);
        if (!hits.length) return;
        event.preventDefault();
        pickTag(hits[0]);
      });
    }
    render();
    showApp();
    els.search.focus();
  } catch (error) {
    if (els.bootStatus) els.bootStatus.textContent = error.message;
  }
}

if (document.getElementById("player-search")) boot();
