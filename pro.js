const DDRAGON = "https://ddragon.leagueoflegends.com";
const ROLES = ["All", "TOP", "JNG", "MID", "ADC", "SUP"];
const ROLE_KEYS = ["top", "jng", "mid", "adc", "sup"];
const LEAGUES = ["All", "LPL", "LCK", "LEC", "LCS", "Worlds", "MSI"];
const SOLO = window.RIFT_META_MODE === "solo";
const MIN_GAMES = 2;
const SOLO_MIN_PICK_RATE = 0.003; // 0.3% pick share in the selected lane
const RECENT_DAYS = 60;
const META_POP_SCALE = 4.7;
const META_POP_PRIOR_FLOOR = SOLO ? 400 : 8;
const META_WR = 0;
const META_PAIR = 0;
const META_VS = 0;
const META_SPIKE = 0;
const META_UNIQUE = 8;
const SHARP_COUNTER_DELTA = -2;
const META_PRIOR = 18;
const META_MIN_GAMES = 8;
const META_WR_PRIOR = 24;
const HIGH_META_SHARE = 0.3;
const HIGH_META_MIN = 6;
const INTO_MIN_MATCHUPS = 2;
const POTENTIAL_SAME_ROLE = 1;
const POTENTIAL_OTHER_ROLE = 0.2;
const POTENTIAL_PAIR_SAME_ROLE = 0.2;
const POTENTIAL_PAIR_OTHER_ROLE = 1;

const els = {
  boot: document.getElementById("boot"),
  bootStatus: document.getElementById("boot-status"),
  app: document.getElementById("app"),
  title: document.getElementById("pro-title"),
  range: document.getElementById("pro-range"),
  search: document.getElementById("pro-search"),
  team: document.getElementById("pro-team"),
  teamMenu: document.getElementById("pro-team-menu"),
  teamChips: document.getElementById("pro-team-chips"),
  leagues: document.getElementById("pro-leagues"),
  roles: document.getElementById("pro-roles"),
  windows: document.getElementById("pro-windows"),
  patches: document.getElementById("pro-patches"),
  vs: document.getElementById("pro-vs"),
  body: document.getElementById("pro-body"),
  detailName: document.getElementById("detail-name"),
  detailSub: document.getElementById("detail-sub"),
  detailGames: document.getElementById("detail-games"),
  matchBody: document.getElementById("match-body"),
  pairBody: document.getElementById("pair-body"),
  players: document.getElementById("pro-players"),
  playerSub: document.getElementById("player-sub"),
  playerBody: document.getElementById("player-body"),
  board: document.querySelector(".pro-board"),
};

let patch = "";
let champMap = new Map();
let bundle = { games: [], leagues: LEAGUES.slice(1) };
let search = "";
let league = "All";
let team = "";
let role = "All";
let windowKey = "recent";
let gamePatch = "All";
let sortKey = "meta";
let sortDir = -1;
let selected = "";
let vsScope = "role";
let matchSort = "games";
let matchDir = -1;
let pairSort = "games";
let pairDir = -1;

function portrait(id) {
  return DDRAGON + "/cdn/" + patch + "/img/champion/" + id + ".png";
}

function champName(id) {
  return (champMap.get(id) && champMap.get(id).name) || id;
}

function champSlug(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function fmtScore(value) {
  if (value == null || !isFinite(value)) return "—";
  if (!value) return "0.0";
  return (value > 0 ? "+" : "−") + Math.abs(value).toFixed(1);
}

function champPlayerRows(id) {
  const frozen = ((window.RIFT_PLAYER_RATINGS && window.RIFT_PLAYER_RATINGS.champs) || {});
  const ladder = frozen[champSlug(id)] || frozen[champSlug(champName(id))] || { players: [] };
  const scores = {};
  const listed = ladder.players || [];
  for (let i = 0; i < listed.length; i += 1) {
    scores[(listed[i].n || "").trim().toLowerCase()] = listed[i];
  }
  const games = filteredGames();
  const map = {};
  for (let g = 0; g < games.length; g += 1) {
    const game = games[g];
    const sides = [
      { champs: game.b, names: game.bp, team: game.bt, win: game.w === 1 },
      { champs: game.r, names: game.rp, team: game.rt, win: game.w === 0 },
    ];
    for (let s = 0; s < 2; s += 1) {
      const side = sides[s];
      if (team && side.team !== team) continue;
      for (let i = 0; i < 5; i += 1) {
        if (side.champs[i] !== id) continue;
        const name = side.names[i] || "";
        const key = name.trim().toLowerCase();
        if (!key) continue;
        const rec = map[key] || (map[key] = { n: name, g: 0, wins: 0, t: side.team, l: game.l });
        rec.g += 1;
        rec.wins += side.win ? 1 : 0;
        rec.t = side.team;
        rec.l = game.l;
      }
    }
  }
  const rows = Object.keys(map)
    .map(function (key) {
      const rec = map[key];
      const hit = scores[key];
      return {
        n: rec.n,
        s: hit && hit.s != null ? hit.s : null,
        g: rec.g,
        wr: rec.g ? rec.wins / rec.g : 0,
        l: rec.l,
        t: rec.t,
      };
    })
    .filter(function (row) {
      return row.g >= 3;
    });
  rows.sort(function (a, b) {
    if (a.s != null && b.s != null && b.s !== a.s) return b.s - a.s;
    if (a.s != null && b.s == null) return -1;
    if (a.s == null && b.s != null) return 1;
    if (b.wr !== a.wr) return b.wr - a.wr;
    return b.g - a.g;
  });
  for (let i = 0; i < rows.length; i += 1) rows[i].k = i + 1;
  return rows;
}

function roleLabel(key) {
  if (!key) return "—";
  return key.toUpperCase();
}

function fmtPct(value) {
  if (value == null || !isFinite(value)) return "—";
  return (value * 100).toFixed(1) + "%";
}

function fmtDelta(value) {
  const abs = Math.abs(value).toFixed(1);
  if (value > 0) return "+" + abs;
  if (value < 0) return "−" + abs;
  return "0.0";
}

function delta(wins, games) {
  if (!games) return 0;
  return (wins / games - 0.5) * 100;
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
    const value = games[i].p;
    if (value) seen[value] = true;
  }
  return Object.keys(seen).sort(comparePatch).reverse();
}

function gameHasTeam(game) {
  return !team || game.bt === team || game.rt === team;
}

function listTeams(games) {
  const seen = {};
  for (let i = 0; i < games.length; i += 1) {
    if (games[i].bt) seen[games[i].bt] = true;
    if (games[i].rt) seen[games[i].rt] = true;
  }
  return Object.keys(seen).sort(function (a, b) {
    return a.localeCompare(b);
  });
}

function searchTeams(q) {
  const needle = q.trim().toLowerCase();
  const teams = listTeams(windowGames());
  const out = [];
  for (let i = 0; i < teams.length; i += 1) {
    if (teams[i] === team) continue;
    if (needle && teams[i].toLowerCase().indexOf(needle) === -1) continue;
    out.push(teams[i]);
    if (out.length >= 12) break;
  }
  return out;
}

function filteredGames() {
  const cutoff = cutoffDate();
  const rows = bundle.games || [];
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const game = rows[i];
    if (league !== "All" && game.l !== league) continue;
    if (cutoff && game.d < cutoff) continue;
    if (gamePatch !== "All" && game.p !== gamePatch) continue;
    if (!gameHasTeam(game)) continue;
    out.push(game);
  }
  return out;
}

function windowGames() {
  const cutoff = cutoffDate();
  const rows = bundle.games || [];
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const game = rows[i];
    if (league !== "All" && game.l !== league) continue;
    if (cutoff && game.d < cutoff) continue;
    out.push(game);
  }
  return out;
}

function deltaRec(entry) {
  const games = (entry && entry.games) || 0;
  const shift = entry && typeof entry.delta === "number" ? entry.delta : 0;
  return { games: games, wins: games * (0.5 + shift / 100) };
}

function soloLane(id, roleKey, lanes) {
  const lane = lanes && lanes[roleKey];
  return (lane && lane.champs && lane.champs[id]) || null;
}

function soloPrimary(id, lanes) {
  let best = "";
  let n = 0;
  for (let i = 0; i < ROLE_KEYS.length; i += 1) {
    const key = ROLE_KEYS[i];
    const rec = soloLane(id, key, lanes);
    const games = rec && rec.games ? rec.games : 0;
    if (games > n) {
      n = games;
      best = key;
    }
  }
  return best;
}

function soloInRole(id, roleKey, lanes) {
  if (!roleKey) return true;
  const rec = soloLane(id, roleKey, lanes);
  if (rec && (rec.lane_pct || 0) >= 10) return true;
  return soloPrimary(id, lanes) === roleKey;
}

function soloTally() {
  const winrates = window.RIFT_WINRATES || {};
  const lanes = winrates.lanes || {};
  const counters = (window.RIFT_COUNTERS && window.RIFT_COUNTERS.matchups) || {};
  const synergies = (window.RIFT_SYNERGIES && window.RIFT_SYNERGIES.synergies) || {};
  const stats = {};
  let pickSum = 0;
  const roleKey = role === "All" ? "" : role.toLowerCase();

  for (let i = 0; i < ROLE_KEYS.length; i += 1) {
    const key = ROLE_KEYS[i];
    if (roleKey && key !== roleKey) continue;
    const champs = (lanes[key] && lanes[key].champs) || {};
    const ids = Object.keys(champs);
    for (let j = 0; j < ids.length; j += 1) {
      const id = ids[j];
      const rec = champs[id];
      const games = rec && rec.games ? rec.games : 0;
      if (!games) continue;
      if (!stats[id]) stats[id] = {};
      stats[id][key] = {
        picks: games,
        wins: games * ((rec.wr || 0) / 100),
      };
      pickSum += games;
    }
  }

  const ids = Object.keys(stats);
  const matchupsLane = {};
  const matchupsAll = {};
  const pairs = {};
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    const vs = counters[id] || {};
    const vsIds = Object.keys(vs);
    const usRole = roleKey || soloPrimary(id, lanes);
    matchupsAll[id] = {};
    matchupsLane[id] = {};
    for (let j = 0; j < vsIds.length; j += 1) {
      const them = vsIds[j];
      const rec = deltaRec(vs[them]);
      if (!rec.games) continue;
      matchupsAll[id][them] = rec;
      if (soloInRole(them, usRole, lanes)) matchupsLane[id][them] = rec;
    }
    const syn = synergies[id] || {};
    const pairIds = Object.keys(syn);
    pairs[id] = {};
    for (let j = 0; j < pairIds.length; j += 1) {
      const them = pairIds[j];
      const rec = deltaRec(syn[them]);
      if (!rec.games) continue;
      pairs[id][them] = rec;
    }
  }

  return {
    games: pickSum / (roleKey ? 2 : 10),
    stats: stats,
    matchupsLane: matchupsLane,
    matchupsAll: matchupsAll,
    pairs: pairs,
  };
}

function tally() {
  if (SOLO) return soloTally();
  const games = filteredGames();
  const stats = {};
  const matchupsLane = {};
  const matchupsAll = {};
  const pairs = {};

  function bump(map, us, them, win) {
    if (!map[us]) map[us] = {};
    if (!map[us][them]) map[us][them] = { games: 0, wins: 0 };
    map[us][them].games += 1;
    map[us][them].wins += win ? 1 : 0;
  }

  for (let g = 0; g < games.length; g += 1) {
    const game = games[g];
    for (let i = 0; i < 5; i += 1) {
      if (role !== "All" && ROLE_KEYS[i] !== role.toLowerCase()) continue;
      const both = [
        { id: game.b[i], win: game.w === 1, allies: game.b, enemies: game.r, team: game.bt },
        { id: game.r[i], win: game.w === 0, allies: game.r, enemies: game.b, team: game.rt },
      ];
      for (let s = 0; s < 2; s += 1) {
        const us = both[s];
        if (team && us.team !== team) continue;
        if (!stats[us.id]) stats[us.id] = {};
        if (!stats[us.id][ROLE_KEYS[i]]) stats[us.id][ROLE_KEYS[i]] = { picks: 0, wins: 0 };
        stats[us.id][ROLE_KEYS[i]].picks += 1;
        stats[us.id][ROLE_KEYS[i]].wins += us.win ? 1 : 0;
        bump(matchupsLane, us.id, us.enemies[i], us.win);
        for (let j = 0; j < 5; j += 1) {
          bump(matchupsAll, us.id, us.enemies[j], us.win);
          if (j !== i) bump(pairs, us.id, us.allies[j], us.win);
        }
      }
    }
  }
  return {
    games: games.length,
    stats: stats,
    matchupsLane: matchupsLane,
    matchupsAll: matchupsAll,
    pairs: pairs,
  };
}

function totalPicks(counts) {
  const roleKey = role === "All" ? "" : role.toLowerCase();
  if (roleKey) return (counts[roleKey] && counts[roleKey].picks) || 0;
  let n = 0;
  for (let i = 0; i < ROLE_KEYS.length; i += 1) {
    const row = counts[ROLE_KEYS[i]];
    if (row) n += row.picks;
  }
  return n;
}

function pickRates(data) {
  const rates = {};
  const ids = Object.keys(data.stats);
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    rates[id] = data.games ? totalPicks(data.stats[id]) / data.games : 0;
  }
  return rates;
}

function weightedDelta(map, rates) {
  if (!map) return 0;
  const ids = Object.keys(map);
  let num = 0;
  let den = 0;
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    const rec = map[id];
    if (!rec || rec.games < META_MIN_GAMES) continue;
    const pop = rates[id] || 0;
    if (pop <= 0) continue;
    const weight = pop * (rec.games / (rec.games + META_PRIOR));
    num += weight * delta(rec.wins, rec.games);
    den += weight;
  }
  return den ? num / den : 0;
}

function spikeExposure(map, rates) {
  if (!META_SPIKE || !map) return 0;
  const ids = Object.keys(map);
  let hurt = 0;
  let den = 0;
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    const rec = map[id];
    if (!rec || rec.games < META_MIN_GAMES) continue;
    const pop = rates[id] || 0;
    if (pop <= 0) continue;
    const d = delta(rec.wins, rec.games);
    const weight = pop * (rec.games / (rec.games + META_PRIOR));
    den += weight;
    if (d <= SHARP_COUNTER_DELTA) hurt += weight * (SHARP_COUNTER_DELTA - d);
  }
  return den ? hurt / den : 0;
}

function pickPrior(rows) {
  const counts = [];
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].picks) counts.push(rows[i].picks);
  }
  counts.sort(function (a, b) {
    return a - b;
  });
  const median = counts.length ? counts[Math.floor(counts.length / 2)] : META_POP_PRIOR_FLOOR;
  return Math.max(META_POP_PRIOR_FLOOR, median);
}

function metaScore(id, picks, winRate, data, rates, prior) {
  const popPart = META_POP_SCALE * (picks / (picks + prior));
  const wrPart = META_WR
    ? META_WR * (picks / (picks + META_WR_PRIOR)) * (winRate - 0.5) * 100
    : 0;
  const vsMap = (role === "All" ? data.matchupsAll : data.matchupsLane)[id];
  const spikeMap = (data.matchupsLane && data.matchupsLane[id]) || vsMap;
  const pairPart = META_PAIR * weightedDelta(data.pairs && data.pairs[id], rates);
  const vsPart = META_VS * weightedDelta(vsMap, rates);
  const spikePart = -META_SPIKE * spikeExposure(spikeMap, rates);
  return {
    meta: popPart + wrPart + pairPart + vsPart + spikePart,
    pop: popPart,
    wr: wrPart,
    pair: pairPart,
    vs: vsPart,
    spike: spikePart,
  };
}

function meanStd(values) {
  const xs = [];
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value == null || !isFinite(value)) continue;
    xs.push(value);
  }
  if (xs.length < 2) return { mean: 0, std: 1 };
  let sum = 0;
  for (let i = 0; i < xs.length; i += 1) sum += xs[i];
  const mean = sum / xs.length;
  let variance = 0;
  for (let i = 0; i < xs.length; i += 1) variance += (xs[i] - mean) * (xs[i] - mean);
  const std = Math.sqrt(variance / xs.length);
  return { mean: mean, std: std || 1 };
}

function topPopSlice(rows, share, min) {
  const ranked = rows.slice().sort(function (a, b) {
    return b.picks - a.picks;
  });
  const n = Math.min(ranked.length, Math.max(min, Math.ceil(ranked.length * share)));
  return ranked.slice(0, n);
}

function highMetaWeights(rows) {
  const entries = {};
  function add(row) {
    const weight = Math.max(0.25, row.picks);
    if (!entries[row.id] || weight > entries[row.id].weight) {
      entries[row.id] = { weight: weight, role: row.role };
    }
  }
  const global = topPopSlice(rows, HIGH_META_SHARE, HIGH_META_MIN);
  for (let i = 0; i < global.length; i += 1) add(global[i]);
  const byRole = {};
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row.role) continue;
    if (!byRole[row.role]) byRole[row.role] = [];
    byRole[row.role].push(row);
  }
  const roles = Object.keys(byRole);
  for (let i = 0; i < roles.length; i += 1) {
    const group = byRole[roles[i]];
    const local = topPopSlice(group, HIGH_META_SHARE, Math.min(4, group.length));
    for (let j = 0; j < local.length; j += 1) add(local[j]);
  }
  return entries;
}

function roleCrowding(usRole, weights) {
  if (!usRole) return 0;
  const ids = Object.keys(weights);
  let same = 0;
  let total = 0;
  for (let i = 0; i < ids.length; i += 1) {
    const entry = weights[ids[i]];
    total += entry.weight;
    if (entry.role === usRole) same += entry.weight;
  }
  return total ? same / total : 0;
}

function soloMatchups() {
  return (window.RIFT_COUNTERS && window.RIFT_COUNTERS.matchups) || {};
}

function soloMatchup(us, them) {
  const matchups = soloMatchups();
  const direct = matchups[us] && matchups[us][them];
  if (direct && typeof direct.delta === "number") {
    return { delta: direct.delta, games: direct.games || 0 };
  }
  const inverse = matchups[them] && matchups[them][us];
  if (inverse && typeof inverse.delta === "number") {
    return { delta: -inverse.delta, games: inverse.games || 0 };
  }
  return null;
}

function soloPairings() {
  return (window.RIFT_SYNERGIES && window.RIFT_SYNERGIES.synergies) || {};
}

function soloPairing(us, them) {
  const pairs = soloPairings();
  const direct = pairs[us] && pairs[us][them];
  if (direct && typeof direct.delta === "number") {
    return { delta: direct.delta, games: direct.games || 0 };
  }
  const inverse = pairs[them] && pairs[them][us];
  if (inverse && typeof inverse.delta === "number") {
    return { delta: inverse.delta, games: inverse.games || 0 };
  }
  return null;
}

function matchupSignal(id, them, same, data) {
  if (!SOLO) {
    const solo = soloMatchup(id, them);
    if (solo && solo.games >= META_MIN_GAMES) return solo;
  }
  const laneMap = (data.matchupsLane && data.matchupsLane[id]) || {};
  const allMap = (data.matchupsAll && data.matchupsAll[id]) || {};
  const rec = (same && laneMap[them]) || allMap[them] || laneMap[them];
  if (!rec || rec.games < META_MIN_GAMES) return null;
  return { delta: delta(rec.wins, rec.games), games: rec.games };
}

function pairSignal(id, them, data) {
  if (!SOLO) {
    const solo = soloPairing(id, them);
    if (solo && solo.games >= META_MIN_GAMES) return solo;
  }
  const rec = data.pairs && data.pairs[id] && data.pairs[id][them];
  if (!rec || rec.games < META_MIN_GAMES) return null;
  const shift = typeof rec.delta === "number" ? rec.delta : delta(rec.wins, rec.games);
  return { delta: shift, games: rec.games };
}

function poolWeightedDelta(id, usRole, data, weights, kind) {
  const ids = Object.keys(weights);
  let num = 0;
  let den = 0;
  let hits = 0;
  let sameHits = 0;
  for (let i = 0; i < ids.length; i += 1) {
    const them = ids[i];
    if (them === id) continue;
    const entry = weights[them];
    const same = !!(usRole && entry.role && entry.role === usRole);
    const rec =
      kind === "pair" ? pairSignal(id, them, data) : matchupSignal(id, them, same, data);
    if (!rec) continue;
    const roleW =
      kind === "pair"
        ? same
          ? POTENTIAL_PAIR_SAME_ROLE
          : POTENTIAL_PAIR_OTHER_ROLE
        : same
          ? POTENTIAL_SAME_ROLE
          : POTENTIAL_OTHER_ROLE;
    const weight = entry.weight * roleW * (rec.games / (rec.games + META_PRIOR));
    if (weight <= 0) continue;
    num += weight * rec.delta;
    den += weight;
    hits += 1;
    if (same) sameHits += 1;
  }
  if (!den) return null;
  if (kind === "pair") {
    if (hits < INTO_MIN_MATCHUPS) return null;
  } else if (sameHits < 1 && hits < INTO_MIN_MATCHUPS) {
    return null;
  }
  return num / den;
}

function intoHighMeta(id, usRole, data, weights) {
  return poolWeightedDelta(id, usRole, data, weights, "vs");
}

function withHighMeta(id, usRole, data, weights) {
  return poolWeightedDelta(id, usRole, data, weights, "pair");
}

function poolFit(intoMeta, withMeta) {
  if (intoMeta != null && withMeta != null) return (intoMeta + withMeta) / 2;
  if (intoMeta != null) return intoMeta;
  if (withMeta != null) return withMeta;
  return null;
}

function attachPotential(rows, data) {
  const weights = highMetaWeights(rows);
  const metas = [];
  const fits = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    row.intoMeta = intoHighMeta(row.id, row.role, data, weights);
    row.withMeta = withHighMeta(row.id, row.role, data, weights);
    row.uniqueMeta = -META_UNIQUE * roleCrowding(row.role, weights);
    const fit = poolFit(row.intoMeta, row.withMeta);
    row.poolFit = fit == null ? null : fit + row.uniqueMeta;
    metas.push(row.meta);
    fits.push(row.poolFit);
  }
  const metaStat = meanStd(metas);
  const fitStat = meanStd(fits);
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.poolFit == null) {
      row.potential = null;
      continue;
    }
    const fitZ = (row.poolFit - fitStat.mean) / fitStat.std;
    const metaZ = (row.meta - metaStat.mean) / metaStat.std;
    row.potential = fitZ - metaZ;
  }
}

function primaryRole(counts) {
  let best = "";
  let n = 0;
  for (let i = 0; i < ROLE_KEYS.length; i += 1) {
    const key = ROLE_KEYS[i];
    const value = counts[key] ? counts[key].picks : 0;
    if (value > n) {
      n = value;
      best = key;
    }
  }
  return best;
}

function buildRows(data) {
  const q = search.trim().toLowerCase();
  const rows = [];
  const rates = pickRates(data);
  const ids = Object.keys(data.stats);
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    const counts = data.stats[id];
    const roleKey = role === "All" ? "" : role.toLowerCase();
    let picks = 0;
    let wins = 0;
    if (roleKey) {
      if (!counts[roleKey]) continue;
      picks = counts[roleKey].picks;
      wins = counts[roleKey].wins;
    } else {
      for (let j = 0; j < ROLE_KEYS.length; j += 1) {
        const row = counts[ROLE_KEYS[j]];
        if (!row) continue;
        picks += row.picks;
        wins += row.wins;
      }
    }
    if (!picks) continue;
    const pickRate = data.games ? picks / data.games : 0;
    if (SOLO && pickRate < SOLO_MIN_PICK_RATE) continue;
    const winRate = picks ? wins / picks : 0;
    wins = Math.round(wins);
    rows.push({
      id: id,
      name: champName(id),
      role: roleKey || primaryRole(counts),
      picks: picks,
      pickRate: pickRate,
      wins: wins,
      winRate: winRate,
      meta: 0,
      metaParts: null,
      intoMeta: null,
      withMeta: null,
      uniqueMeta: null,
      poolFit: null,
      potential: null,
    });
  }
  const prior = pickPrior(rows);
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const score = metaScore(row.id, row.picks, row.winRate, data, rates, prior);
    row.meta = score.meta;
    row.metaParts = score;
  }
  attachPotential(rows, data);
  const shown = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const champ = champMap.get(row.id);
    if (q && (!champ || champ.name.toLowerCase().indexOf(q) === -1) && row.id.toLowerCase().indexOf(q) === -1) {
      continue;
    }
    shown.push(row);
  }
  return sortRows(shown, sortKey, sortDir);
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

function scoreRows(map, sortKey, sortDir) {
  const ids = Object.keys(map || {});
  const rows = [];
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    if (id === selected) continue;
    const rec = map[id];
    if (!rec || rec.games < MIN_GAMES) continue;
    rows.push({
      id: id,
      name: champName(id),
      games: rec.games,
      winRate: rec.games ? rec.wins / rec.games : null,
      score: delta(rec.wins, rec.games),
    });
  }
  return sortRows(rows, sortKey, sortDir);
}

function renderMeta(data) {
  if (SOLO) {
    const wr = window.RIFT_WINRATES || {};
    els.title.textContent = "LoLalytics";
    const bits = [Math.round(data.games).toLocaleString() + " games"];
    if (wr.tier) bits.push(String(wr.tier).replace(/_/g, " "));
    if (wr.patch_query) bits.push("patch " + wr.patch_query);
    if (wr.synced) bits.push(String(wr.synced).slice(0, 10));
    els.range.textContent = bits.join("  ·  ");
    return;
  }
  els.title.textContent = team || (league === "All" ? bundle.leagues.join(" · ") : league);
  const cutoff = cutoffDate();
  const from = cutoff || bundle.from;
  const to = bundle.to;
  els.range.textContent =
    data.games.toLocaleString() +
    " games" +
    (from && to ? "  " + from.slice(5) + " – " + to.slice(5) : "");
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

function renderChips() {
  if (els.leagues) els.leagues.hidden = SOLO;
  if (els.windows) els.windows.hidden = SOLO;
  if (els.patches) els.patches.hidden = SOLO;
  if (!SOLO) {
    chipRow(els.leagues, LEAGUES, league, function (name) {
      league = name;
      render();
    });
  }
  chipRow(els.roles, ROLES, role, function (name) {
    role = name;
    render();
  });
  if (!SOLO) {
    RIFT_WINDOW.mount(els.windows, function () {
      windowKey = RIFT_WINDOW.key;
      render();
    });
    const patches = listPatches(windowGames());
    if (gamePatch !== "All" && patches.indexOf(gamePatch) === -1) gamePatch = "All";
    chipRow(els.patches, ["All"].concat(patches), gamePatch, function (name) {
      gamePatch = name;
      render();
    });
    const teams = listTeams(windowGames());
    if (team && teams.indexOf(team) === -1) team = "";
    renderTeamChips();
  }
  chipRow(els.vs, ["Same role", "All champs"], vsScope === "all" ? "All champs" : "Same role", function (name) {
    vsScope = name === "All champs" ? "all" : "role";
    render();
  });
}

function renderTable(data) {
  const rows = buildRows(data);
  els.body.innerHTML = "";
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.className = "pick-empty";
    td.textContent = "No champions match that filter.";
    tr.append(td);
    els.body.append(tr);
    return;
  }
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const tr = document.createElement("tr");
    if (row.id === selected) tr.className = "active";
    tr.addEventListener("click", function () {
      selected = row.id;
      render();
    });
    const champ = document.createElement("td");
    const wrap = document.createElement("div");
    wrap.className = "pro-champ";
    const img = document.createElement("img");
    img.src = portrait(row.id);
    img.alt = row.name;
    const name = document.createElement("span");
    name.textContent = row.name;
    wrap.append(img, name);
    champ.append(wrap);

    const roleCell = document.createElement("td");
    roleCell.className = "pro-role";
    roleCell.textContent = roleLabel(row.role);

    const meta = document.createElement("td");
    meta.className = "num " + (row.meta >= 0 ? "wr-up" : "wr-down");
    meta.textContent = fmtDelta(row.meta);
    const parts = row.metaParts;
    if (parts) {
      const bits = ["pop " + fmtDelta(parts.pop)];
      if (parts.wr) bits.push("wr " + fmtDelta(parts.wr));
      if (parts.pair) bits.push("pair " + fmtDelta(parts.pair));
      if (parts.vs) bits.push("vs " + fmtDelta(parts.vs));
      if (parts.spike) bits.push("spike " + fmtDelta(parts.spike));
      meta.title = bits.join("\n");
    }

    const potential = document.createElement("td");
    potential.className = "num";
    if (row.potential == null) {
      potential.textContent = "—";
    } else {
      potential.className += row.potential >= 0 ? " wr-up" : " wr-down";
      potential.textContent = fmtDelta(row.potential);
      potential.title =
        "into high-meta" +
        (SOLO ? " " : " (LoLalytics) ") +
        (row.intoMeta == null ? "—" : fmtDelta(row.intoMeta)) +
        "\nwith high-meta" +
        (SOLO ? " " : " (LoLalytics) ") +
        (row.withMeta == null ? "—" : fmtDelta(row.withMeta)) +
        "\nunique " +
        fmtDelta(row.uniqueMeta || 0) +
        "\ncurrent meta " +
        fmtDelta(row.meta);
    }

    const picks = document.createElement("td");
    picks.className = "num";
    picks.textContent = row.picks.toLocaleString();

    const pickRate = document.createElement("td");
    pickRate.className = "num";
    pickRate.textContent = fmtPct(row.pickRate);

    const wins = document.createElement("td");
    wins.className = "num";
    wins.textContent = row.wins.toLocaleString();

    const wr = document.createElement("td");
    wr.className = "num " + (row.winRate >= 0.5 ? "wr-up" : "wr-down");
    wr.textContent = fmtPct(row.winRate);

    tr.append(champ, roleCell, meta, potential, picks, pickRate, wins, wr);
    els.body.append(tr);
  }
}

function numCell(value, kind) {
  const td = document.createElement("td");
  td.className = "num";
  if (value == null) {
    td.textContent = "—";
    return td;
  }
  if (kind === "pct") {
    td.className += value >= 0.5 ? " wr-up" : " wr-down";
    td.textContent = fmtPct(value);
  } else if (kind === "delta") {
    td.className += value >= 0 ? " wr-up" : " wr-down";
    td.textContent = fmtDelta(value);
  } else td.textContent = value.toLocaleString();
  return td;
}

function fillScoreTable(root, rows, emptyText) {
  root.innerHTML = "";
  if (!selected) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 4;
    td.className = "pick-empty";
    td.textContent = "Select a champion from the list.";
    tr.append(td);
    root.append(tr);
    return;
  }
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 4;
    td.className = "pick-empty";
    td.textContent = emptyText;
    tr.append(td);
    root.append(tr);
    return;
  }
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const tr = document.createElement("tr");
    tr.addEventListener("click", function () {
      selected = row.id;
      render();
    });
    const champ = document.createElement("td");
    const wrap = document.createElement("div");
    wrap.className = "pro-champ";
    const img = document.createElement("img");
    img.src = portrait(row.id);
    img.alt = row.name;
    const name = document.createElement("span");
    name.textContent = row.name;
    wrap.append(img, name);
    champ.append(wrap);
    tr.append(champ, numCell(row.games), numCell(row.winRate, "pct"), numCell(row.score, "delta"));
    root.append(tr);
  }
}

function renderDetail(data) {
  if (!selected) {
    els.detailName.textContent = "Related champs";
    els.detailSub.textContent = "Select a champion.";
    els.detailGames.hidden = true;
    fillScoreTable(els.matchBody, [], "");
    fillScoreTable(els.pairBody, [], "");
    return;
  }
  const vsMap = (vsScope === "all" ? data.matchupsAll : data.matchupsLane)[selected] || {};
  const pairMap = data.pairs[selected] || {};
  const vsRows = scoreRows(vsMap, matchSort, matchDir);
  const pairRows = scoreRows(pairMap, pairSort, pairDir);
  els.detailName.textContent = champName(selected);
  els.detailSub.textContent =
    (vsScope === "all" ? "Matchups vs all enemy champs" : "Matchups vs same role") +
    " · " +
    MIN_GAMES +
    "+ games";
  if (SOLO) {
    els.detailGames.hidden = true;
  } else {
    els.detailGames.hidden = false;
    els.detailGames.href =
      "games.html?champ=" +
      encodeURIComponent(selected) +
      "&league=" +
      encodeURIComponent(league) +
      "&window=" +
      encodeURIComponent(RIFT_WINDOW.param()) +
      "&patch=" +
      encodeURIComponent(gamePatch) +
      (team ? "&team=" + encodeURIComponent(team) : "");
    els.detailGames.textContent = "Recent games";
  }
  fillScoreTable(els.matchBody, vsRows, "No matchups at this filter.");
  fillScoreTable(els.pairBody, pairRows, "No pairings at this filter.");
}

function renderPlayers() {
  const root = els.players;
  const body = els.playerBody;
  if (!root || !body) return;
  if (SOLO || !selected) {
    root.hidden = true;
    if (els.board) els.board.classList.remove("has-players");
    return;
  }
  const rows = champPlayerRows(selected);
  root.hidden = false;
  if (els.board) els.board.classList.add("has-players");
  if (els.playerSub) {
    els.playerSub.textContent =
      champName(selected) +
      (team ? " · " + team : league === "All" ? "" : " · " + league) +
      " · 3+ games";
  }
  body.innerHTML = "";
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 3;
    td.className = "pick-empty";
    td.textContent = "No players with 3+ games on this champion.";
    tr.append(td);
    body.append(tr);
    return;
  }
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const tr = document.createElement("tr");
    tr.title = (row.t || "") + (row.g ? " · " + row.g + "g · " + fmtPct(row.wr) : "");
    tr.addEventListener("click", function () {
      location.href =
        "player.html?player=" +
        encodeURIComponent(row.n) +
        "&league=" +
        encodeURIComponent(league) +
        "&window=" +
        encodeURIComponent(RIFT_WINDOW.param()) +
        "&patch=" +
        encodeURIComponent(gamePatch);
    });
    const rank = document.createElement("td");
    rank.className = "num";
    rank.textContent = String(row.k || i + 1);
    const name = document.createElement("td");
    name.textContent = row.n;
    const score = document.createElement("td");
    score.className = "num " + (row.s > 0 ? "wr-up" : row.s < 0 ? "wr-down" : "");
    score.textContent = fmtScore(row.s);
    tr.append(rank, name, score);
    body.append(tr);
  }
}

function render() {
  if (!SOLO) {
    const scoped = windowGames();
    const patches = listPatches(scoped);
    if (gamePatch !== "All" && patches.indexOf(gamePatch) === -1) gamePatch = "All";
    const teams = listTeams(scoped);
    if (team && teams.indexOf(team) === -1) team = "";
  }
  const data = tally();
  renderMeta(data);
  renderChips();
  renderTable(data);
  renderDetail(data);
  renderPlayers();
}

function renderTeamChips() {
  if (!els.teamChips) return;
  els.teamChips.innerHTML = "";
  els.teamChips.hidden = !team;
  if (!team) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "active";
  button.textContent = team;
  button.addEventListener("click", function () {
    team = "";
    if (els.team) els.team.value = "";
    render();
  });
  els.teamChips.append(button);
}

function hideTeamMenu() {
  if (!els.teamMenu) return;
  els.teamMenu.hidden = true;
  els.teamMenu.innerHTML = "";
}

function pickTeam(name) {
  team = name;
  if (els.team) els.team.value = "";
  hideTeamMenu();
  render();
}

function renderTeamMenu() {
  if (!els.teamMenu || !els.team) return;
  const hits = searchTeams(els.team.value);
  els.teamMenu.innerHTML = "";
  if (!hits.length) {
    els.teamMenu.hidden = true;
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
      pickTeam(name);
    });
    els.teamMenu.append(button);
  }
  els.teamMenu.hidden = false;
}

function bind() {
  els.search.addEventListener("input", function () {
    search = els.search.value;
    render();
  });
  if (els.team) {
    els.team.addEventListener("input", renderTeamMenu);
    els.team.addEventListener("focus", renderTeamMenu);
    els.team.addEventListener("blur", function () {
      setTimeout(hideTeamMenu, 120);
    });
    els.team.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        els.team.value = "";
        hideTeamMenu();
        return;
      }
      if (event.key !== "Enter") return;
      const hits = searchTeams(els.team.value);
      if (!hits.length) return;
      event.preventDefault();
      pickTeam(hits[0]);
    });
  }
  document.querySelectorAll(".pro-table th[data-sort]").forEach(function (th) {
    th.addEventListener("click", function () {
      const key = th.getAttribute("data-sort");
      if (sortKey === key) sortDir *= -1;
      else {
        sortKey = key;
        sortDir = key === "name" || key === "role" ? 1 : -1;
      }
      render();
    });
  });
  document.querySelectorAll(".pro-table th[data-match-sort]").forEach(function (th) {
    th.addEventListener("click", function () {
      const key = th.getAttribute("data-match-sort");
      if (matchSort === key) matchDir *= -1;
      else {
        matchSort = key;
        matchDir = key === "name" ? 1 : -1;
      }
      render();
    });
  });
  document.querySelectorAll(".pro-table th[data-pair-sort]").forEach(function (th) {
    th.addEventListener("click", function () {
      const key = th.getAttribute("data-pair-sort");
      if (pairSort === key) pairDir *= -1;
      else {
        pairSort = key;
        pairDir = key === "name" ? 1 : -1;
      }
      render();
    });
  });
}

function showApp() {
  els.boot.classList.add("is-hidden");
  els.boot.hidden = true;
  els.app.hidden = false;
  els.boot.remove();
}

function boot() {
  try {
    const data = window.RIFT_DRAFT_DATA;
    if (!data || !data.champions) throw new Error("Missing champion data");
    patch = data.patch;
    champMap = new Map(
      data.champions.map(function (champ) {
        return [champ.id, champ];
      })
    );
    if (SOLO) {
      const wr = window.RIFT_WINRATES;
      if (!wr || !wr.lanes || !Object.keys(wr.lanes).length) {
        throw new Error("Missing LoLalytics winrates");
      }
    } else {
      bundle = window.RIFT_PRO_GAMES || bundle;
      if (!bundle.games || !bundle.games.length) throw new Error("Missing pro game logs");
    }
    const params = new URLSearchParams(location.search);
    if (params.get("champ")) selected = params.get("champ");
    if (params.get("league")) league = params.get("league");
    if (params.get("team")) team = params.get("team");
    if (params.get("window")) {
      RIFT_WINDOW.init(params.get("window"));
      windowKey = RIFT_WINDOW.key;
    }
    if (params.get("patch")) gamePatch = params.get("patch");
    bind();
    render();
    showApp();
    els.search.focus();
  } catch (error) {
    if (els.bootStatus) els.bootStatus.textContent = error.message;
  }
}

boot();
