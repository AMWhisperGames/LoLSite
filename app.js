const DDRAGON = "https://ddragon.leagueoflegends.com";
const TAGS = ["All", "Assassin", "Fighter", "Mage", "Marksman", "Support", "Tank"];
const ROLES = ["TOP", "JNG", "MID", "ADC", "SUP"];
const ROLE_KEYS = ["top", "jng", "mid", "adc", "sup"];
const ROLE_FILTERS = ["All"].concat(ROLES);
const POWER_PRIOR_GAMES = 4000;
const SHARP_COUNTER_DELTA = -2;
const WEIGHT_DEFAULTS = {
  wr: 1,
  pop: 1,
  safety: 1,
  counter: 1,
  pairing: 1,
  unique: 1.25,
};
const BOT_WEIGHTS = Object.freeze({
  wr: 0.1,
  pop: 1.2,
  safety: 0,
  counter: 0.6,
  pairing: 0.75,
  unique: 1.25,
  denial: 1.4,
  response: 1,
});
const BOT_SPICE_RATE = 0.1;
const BOT_SPICE_OPTIONS = 3;
const BOT_SPICE_RELATIVE_GAP = 0.1;
const WEIGHT_STORAGE = "riftDraft.weights.v5";
const LEGACY_WEIGHT_STORAGE = "riftDraft.weights.v4";
const LEGACY_WEIGHT_STORAGE_V2 = "riftDraft.weights.v2";
const PAIR_PRIOR_GAMES = 400;
const UNIQUE_ROLE_SCALE = 8;
const UNIQUE_PRIMARY_SCALE = 0.4;
const RESPONSE_ROLE_BASE = 4;
const OE_EARLY_PHASE_PICKS = 6;
const OE_EARLY_PICK_SCALE = 5;
const OE_EARLY_PICK_PRIOR = 12;
const TEAM_RECENT_DAYS = 60;
const TEAM_RECENT_WEIGHT = 1.5;
const TEAM_OLD_WEIGHT = 0.15;
const ROLE_FILL_LOCK = 0.75;
const POPULARITY_SCALE = 4.7;
const TEAM_POP_BLEND = 1;
const TEAM_COMFORT_SCALE = 0.55;
const TEAM_RARE_RATE = 0.04;
const TEAM_RARE_PENALTY = 3.5;
const ELO_SCALE = 400;
const ELO_MULT = 4;

const els = {
  boot: document.getElementById("boot"),
  bootStatus: document.getElementById("boot-status"),
  app: document.getElementById("app"),
  splash: document.getElementById("splash"),
  fearless: document.getElementById("fearless-toggle"),
  series: document.getElementById("series-select"),
  gameLabel: document.getElementById("game-label"),
  phaseKicker: document.getElementById("phase-kicker"),
  phaseTitle: document.getElementById("phase-title"),
  board: document.getElementById("draft-board"),
  chartScreen: document.getElementById("chart-screen"),
  chartSetup: document.getElementById("chart-setup"),
  chartPlay: document.getElementById("chart-play"),
  chartFirst: document.getElementById("chart-first"),
  chartSecond: document.getElementById("chart-second"),
  chartFirstTeam: document.getElementById("chart-first-team"),
  chartSecondTeam: document.getElementById("chart-second-team"),
  chartTurn: document.getElementById("chart-turn"),
  chartTimeline: document.getElementById("chart-timeline"),
  chartSearch: document.getElementById("chart-search"),
  chartGrid: document.getElementById("chart-grid"),
  chartRecs: document.getElementById("chart-recs"),
  chartUndo: document.getElementById("chart-undo"),
  chartReset: document.getElementById("chart-reset"),
  chartBtn: document.getElementById("chart-btn"),
  blueName: document.getElementById("blue-name"),
  redName: document.getElementById("red-name"),
  blueTeamMenu: document.getElementById("blue-team-menu"),
  redTeamMenu: document.getElementById("red-team-menu"),
  blueRoster: document.getElementById("blue-roster"),
  redRoster: document.getElementById("red-roster"),
  blueBans: document.getElementById("blue-bans"),
  redBans: document.getElementById("red-bans"),
  bluePicks: document.getElementById("blue-picks"),
  redPicks: document.getElementById("red-picks"),
  search: document.getElementById("search"),
  tags: document.getElementById("tag-filters"),
  pool: document.querySelector(".pool"),
  grid: document.getElementById("grid"),
  undo: document.getElementById("undo-btn"),
  reset: document.getElementById("reset-btn"),
  next: document.getElementById("next-btn"),
  swap: document.getElementById("swap-btn"),
  usedBar: document.getElementById("used-bar"),
  usedChamps: document.getElementById("used-champs"),
  expectBlueName: document.getElementById("expect-blue-name"),
  expectRedName: document.getElementById("expect-red-name"),
  expectBluePct: document.getElementById("expect-blue-pct"),
  expectRedPct: document.getElementById("expect-red-pct"),
  expectFill: document.getElementById("expect-fill"),
  expectMeter: document.getElementById("expect-meter"),
  expectSub: document.getElementById("expect-sub"),
  toast: document.getElementById("toast"),
  recs: document.getElementById("recs"),
  recsList: document.getElementById("recs-list"),
  recsLabel: document.getElementById("recs-label"),
  recsBlue: document.getElementById("recs-blue"),
  recsRed: document.getElementById("recs-red"),
  recsRoles: document.getElementById("recs-roles"),
  recsWeights: document.getElementById("recs-weights"),
  wWr: document.getElementById("w-wr"),
  wPop: document.getElementById("w-pop"),
  wSafety: document.getElementById("w-safety"),
  wCounter: document.getElementById("w-counter"),
  wPairing: document.getElementById("w-pairing"),
  wUnique: document.getElementById("w-unique"),
  wWrVal: document.getElementById("w-wr-val"),
  wPopVal: document.getElementById("w-pop-val"),
  wSafetyVal: document.getElementById("w-safety-val"),
  wCounterVal: document.getElementById("w-counter-val"),
  wPairingVal: document.getElementById("w-pairing-val"),
  wUniqueVal: document.getElementById("w-unique-val"),
};

let patch = "";
let champions = [];
let champMap = new Map();
let history = [];
let search = "";
let tag = "All";
let drag = null;
let recSide = "blue";
let recRole = "All";
let weights = Object.assign({}, WEIGHT_DEFAULTS);
let counters = {};
let synergies = {};
let champGames = {};
let oracles = { matchups: {}, positions: {}, games: 0 };
let roleRates = {};
let winrates = { lanes: {} };
let oePop = {};
let teamIndex = {};
let teamNames = [];

let state = emptyState();
let chartOpen = false;
let chartStage = "setup";
let chartYou = "";
let chartBotTimer = 0;
let freeSnapshot = null;

const CHART_STEPS = [
  { phase: "Ban 1", team: "blue", kind: "ban", index: 0, label: "Blue ban 1" },
  { phase: "Ban 1", team: "red", kind: "ban", index: 0, label: "Red ban 1" },
  { phase: "Ban 1", team: "blue", kind: "ban", index: 1, label: "Blue ban 2" },
  { phase: "Ban 1", team: "red", kind: "ban", index: 1, label: "Red ban 2" },
  { phase: "Ban 1", team: "blue", kind: "ban", index: 2, label: "Blue ban 3" },
  { phase: "Ban 1", team: "red", kind: "ban", index: 2, label: "Red ban 3" },
  { phase: "Pick 1", team: "blue", kind: "pick", index: 0, label: "Blue 1" },
  { phase: "Pick 1", team: "red", kind: "pick", index: 0, label: "Red 1" },
  { phase: "Pick 1", team: "red", kind: "pick", index: 1, label: "Red 2" },
  { phase: "Pick 1", team: "blue", kind: "pick", index: 1, label: "Blue 2" },
  { phase: "Pick 1", team: "blue", kind: "pick", index: 2, label: "Blue 3" },
  { phase: "Pick 1", team: "red", kind: "pick", index: 2, label: "Red 3" },
  { phase: "Ban 2", team: "red", kind: "ban", index: 3, label: "Red ban 4" },
  { phase: "Ban 2", team: "blue", kind: "ban", index: 3, label: "Blue ban 4" },
  { phase: "Ban 2", team: "red", kind: "ban", index: 4, label: "Red ban 5" },
  { phase: "Ban 2", team: "blue", kind: "ban", index: 4, label: "Blue ban 5" },
  { phase: "Pick 2", team: "red", kind: "pick", index: 3, label: "Red 4" },
  { phase: "Pick 2", team: "blue", kind: "pick", index: 3, label: "Blue 4" },
  { phase: "Pick 2", team: "blue", kind: "pick", index: 4, label: "Blue 5" },
  { phase: "Pick 2", team: "red", kind: "pick", index: 4, label: "Red 5" },
];

function emptyTeam(name) {
  return {
    name,
    org: "",
    bans: Array(5).fill(null),
    picks: Array(5).fill(null),
    roles: Array(5).fill(null),
  };
}

function emptyState() {
  return {
    fearless: false,
    seriesLength: 1,
    gameIndex: 0,
    usedPicks: [],
    blue: emptyTeam("Blue Side"),
    red: emptyTeam("Red Side"),
  };
}

function genericName(side) {
  return side === "red" ? "Red Side" : "Blue Side";
}

function isGenericName(name) {
  const n = String(name || "")
    .trim()
    .toLowerCase();
  return !n || n === "blue side" || n === "red side" || n === "blue" || n === "red";
}

function topWeighted(bag) {
  let best = "";
  let bestN = 0;
  const keys = Object.keys(bag || {});
  for (let i = 0; i < keys.length; i += 1) {
    if (bag[keys[i]] > bestN) {
      bestN = bag[keys[i]];
      best = keys[i];
    }
  }
  return best;
}

function emptyRoleBag() {
  return { players: {}, champs: {}, champWins: {}, n: 0 };
}

function buildTeamIndex() {
  teamIndex = {};
  const games = (window.RIFT_PRO_GAMES && window.RIFT_PRO_GAMES.games) || [];
  const total = games.length;
  const newestMs = total && games[0].d ? Date.parse(games[0].d) : 0;
  for (let g = 0; g < total; g += 1) {
    const game = games[g];
    const gameMs = game.d ? Date.parse(game.d) : 0;
    const ageDays = newestMs && gameMs ? Math.max(0, (newestMs - gameMs) / 86400000) : Infinity;
    const weight =
      ageDays <= TEAM_RECENT_DAYS
        ? TEAM_RECENT_WEIGHT -
          (TEAM_RECENT_WEIGHT - 1) * (ageDays / TEAM_RECENT_DAYS)
        : TEAM_OLD_WEIGHT;
    const sides = [
      { name: game.bt, champs: game.b, players: game.bp, win: game.w === 1 },
      { name: game.rt, champs: game.r, players: game.rp, win: game.w === 0 },
    ];
    for (let s = 0; s < sides.length; s += 1) {
      const side = sides[s];
      if (!side.name) continue;
      const rec =
        teamIndex[side.name] ||
        (teamIndex[side.name] = {
          name: side.name,
          n: 0,
          league: "",
          roles: {
            top: emptyRoleBag(),
            jng: emptyRoleBag(),
            mid: emptyRoleBag(),
            adc: emptyRoleBag(),
            sup: emptyRoleBag(),
          },
          starters: {},
        });
      rec.n += weight;
      if (game.l) rec.league = game.l;
      for (let i = 0; i < 5; i += 1) {
        const role = ROLE_KEYS[i];
        const bag = rec.roles[role];
        bag.n += weight;
        const player = side.players && side.players[i];
        const champ = side.champs && side.champs[i];
        if (player) bag.players[player] = (bag.players[player] || 0) + weight;
        if (champ) {
          bag.champs[champ] = (bag.champs[champ] || 0) + weight;
          if (side.win) bag.champWins[champ] = (bag.champWins[champ] || 0) + weight;
        }
      }
    }
  }
  teamNames = Object.keys(teamIndex).sort(function (a, b) {
    return a.localeCompare(b);
  });
  for (let i = 0; i < teamNames.length; i += 1) {
    const rec = teamIndex[teamNames[i]];
    for (let r = 0; r < ROLE_KEYS.length; r += 1) {
      rec.starters[ROLE_KEYS[r]] = topWeighted(rec.roles[ROLE_KEYS[r]].players);
    }
  }
}

function orgOf(side) {
  const name = state[side] && state[side].org;
  if (name && teamIndex[name]) return teamIndex[name];
  if (chartOpen && chartStage === "play" && side !== chartYou) {
    const practiceName = state[chartYou] && state[chartYou].org;
    if (practiceName && teamIndex[practiceName]) return teamIndex[practiceName];
  }
  return null;
}

function findTeam(raw) {
  const q = String(raw || "").trim().toLowerCase();
  if (!q || isGenericName(q)) return "";
  let prefix = "";
  let prefixN = 0;
  for (let i = 0; i < teamNames.length; i += 1) {
    const name = teamNames[i];
    const low = name.toLowerCase();
    if (low === q) return name;
    if (low.indexOf(q) === 0) {
      prefix = name;
      prefixN += 1;
    }
  }
  return prefixN === 1 ? prefix : "";
}

function searchTeams(raw, limit) {
  const q = String(raw || "").trim().toLowerCase();
  const out = [];
  if (!q || isGenericName(q)) {
    for (let i = 0; i < teamNames.length && out.length < (limit || 12); i += 1) out.push(teamNames[i]);
    return out;
  }
  for (let i = 0; i < teamNames.length; i += 1) {
    if (teamNames[i].toLowerCase().indexOf(q) === -1) continue;
    out.push(teamNames[i]);
    if (out.length >= (limit || 12)) break;
  }
  return out;
}

function setSideOrg(side, orgName) {
  const team = state[side];
  if (!team) return;
  if (!orgName || !teamIndex[orgName]) {
    team.org = "";
    team.name = genericName(side);
    return;
  }
  team.org = orgName;
  team.name = orgName;
}

function commitSideName(side) {
  const input = side === "blue" ? els.blueName : els.redName;
  if (!input) return;
  const raw = input.value;
  if (isGenericName(raw)) {
    setSideOrg(side, "");
    input.value = genericName(side);
    return;
  }
  const hit = findTeam(raw);
  if (hit) {
    setSideOrg(side, hit);
    input.value = hit;
    return;
  }
  state[side].org = "";
  state[side].name = raw.trim() || genericName(side);
  input.value = state[side].name;
}

function portrait(id) {
  return DDRAGON + "/cdn/" + patch + "/img/champion/" + id + ".png";
}

function splash(id) {
  return DDRAGON + "/cdn/img/champion/splash/" + id + "_0.jpg";
}

function loadingArt(id) {
  return DDRAGON + "/cdn/img/champion/loading/" + id + "_0.jpg";
}

function champName(id) {
  return (champMap.get(id) && champMap.get(id).name) || id;
}

function formatDelta(value) {
  const abs = Math.abs(value).toFixed(1);
  if (value > 0) return "+" + abs;
  if (value < 0) return "-" + abs;
  return "0.0";
}

function rebuildChampGames() {
  champGames = {};
  const ids = Object.keys(counters);
  for (let i = 0; i < ids.length; i += 1) {
    const us = ids[i];
    const vs = counters[us];
    let total = 0;
    const opp = Object.keys(vs);
    for (let j = 0; j < opp.length; j += 1) {
      const entry = vs[opp[j]];
      if (entry && typeof entry.games === "number") total += entry.games;
    }
    champGames[us] = total;
  }
}

function rebuildRoleRates() {
  roleRates = {};
  const positions = oracles.positions || {};
  const ids = Object.keys(positions);
  for (let i = 0; i < ids.length; i += 1) {
    const counts = positions[ids[i]] || {};
    let total = 0;
    for (let j = 0; j < ROLE_KEYS.length; j += 1) total += counts[ROLE_KEYS[j]] || 0;
    if (!total) continue;
    const rates = {};
    let primary = ROLE_KEYS[0];
    let best = -1;
    for (let j = 0; j < ROLE_KEYS.length; j += 1) {
      const key = ROLE_KEYS[j];
      const rate = (counts[key] || 0) / total;
      rates[key] = rate;
      if (rate > best) {
        best = rate;
        primary = key;
      }
    }
    roleRates[ids[i]] = { rates: rates, total: total, primary: primary };
  }
}

function roleLabel(key) {
  return key ? key.toUpperCase() : "";
}

function pickPrimaryRole(id) {
  const info = roleRates[id];
  if (info && info.primary) return info.primary;
  return primaryWinrateRole(id) || "";
}

function inferredSlotRole(id) {
  const primary = pickPrimaryRole(id);
  return primary ? primary.toUpperCase() : null;
}

function champOeRoleShare(id, role) {
  const key = String(role || "").toLowerCase();
  if (!key) return 0;
  const info = roleRates[id];
  if (info && info.rates) return info.rates[key] || 0;
  let total = 0;
  let n = 0;
  for (let i = 0; i < ROLE_KEYS.length; i += 1) {
    const count = oePicks(id, ROLE_KEYS[i]);
    total += count;
    if (ROLE_KEYS[i] === key) n = count;
  }
  return total ? n / total : 0;
}

function champFitsRole(id, role) {
  if (!role || role === "All") return true;
  const key = role.toLowerCase();
  const info = roleRates[id];
  if (info && info.primary === key) return true;
  const share = champOeRoleShare(id, key);
  if (share >= 0.12) return true;
  if (info || share > 0) return false;
  const entry = winrateEntry(id, key);
  if (entry && ((entry.lane_pct || 0) >= 25 || primaryWinrateRole(id) === key)) return true;
  return false;
}

function winrateEntry(id, role) {
  const lane = winrates.lanes && winrates.lanes[role];
  if (!lane || !lane.champs) return null;
  return lane.champs[id] || null;
}

function primaryWinrateRole(id) {
  let best = "";
  let bestGames = -1;
  for (let i = 0; i < ROLE_KEYS.length; i += 1) {
    const role = ROLE_KEYS[i];
    const entry = winrateEntry(id, role);
    const games = entry && entry.games ? entry.games : 0;
    if (games > bestGames) {
      bestGames = games;
      best = role;
    }
  }
  return best;
}

function powerRoleFor(id) {
  if (recRole !== "All") return recRole.toLowerCase();
  const info = roleRates[id];
  if (info && info.primary) return info.primary;
  return primaryWinrateRole(id) || "mid";
}

function champPower(id) {
  const role = powerRoleFor(id);
  const lane = winrates.lanes && winrates.lanes[role];
  const entry = winrateEntry(id, role);
  if (!lane || !entry || typeof entry.wr !== "number") return null;
  const avg = typeof lane.avg_wr === "number" ? lane.avg_wr : 50;
  const games = entry.games || 0;
  const conf = games / (games + POWER_PRIOR_GAMES);
  const raw = entry.wr - avg;
  return {
    role: role,
    wr: entry.wr,
    games: games,
    avg: avg,
    lanePct: entry.lane_pct || 0,
    raw: raw,
    conf: conf,
    power: raw * conf,
  };
}

function oePickSource() {
  if (oracles.recent && oracles.recent.picks) return oracles.recent.picks;
  return oracles.positions || {};
}

function oePicks(id, role) {
  const row = oePickSource()[id];
  return (row && row[role]) || 0;
}

function oeRoleGames(role) {
  const totals = oracles.recent && oracles.recent.role_games;
  if (totals && totals[role]) return totals[role];
  const picks = oePickSource();
  const ids = Object.keys(picks);
  let total = 0;
  for (let i = 0; i < ids.length; i += 1) total += picks[ids[i]][role] || 0;
  return total;
}

function rebuildOePop() {
  oePop = {};
  const picks = oePickSource();
  const ids = Object.keys(picks);
  for (let i = 0; i < ROLE_KEYS.length; i += 1) {
    const role = ROLE_KEYS[i];
    const counts = [];
    for (let j = 0; j < ids.length; j += 1) {
      const n = picks[ids[j]][role] || 0;
      if (n) counts.push(n);
    }
    counts.sort(function (a, b) {
      return a - b;
    });
    const median = counts.length ? counts[Math.floor(counts.length / 2)] : 20;
    oePop[role] = { median: median, prior: Math.max(8, median) };
  }
}

// Roles that can realistically answer an opener in that seat.
const BLIND_THREAT_ROLES = {
  top: ["top", "jng"],
  jng: ["jng", "top", "mid"],
  mid: ["mid", "jng"],
  adc: ["adc", "mid", "sup"],
  sup: ["sup", "adc"],
};

function blindThreatWeight(them, role) {
  const roleKey = String(role || "").toLowerCase();
  const flex = BLIND_THREAT_ROLES[roleKey] || ROLE_KEYS;
  let weight = 0;
  for (let i = 0; i < flex.length; i += 1) {
    const r = flex[i];
    const n = oePicks(them, r);
    if (!n) continue;
    // Same-seat answers count fully; flex seats (e.g. jng into top) count partially.
    weight += n * (r === roleKey ? 1 : 0.55);
  }
  return weight;
}

function blindPick(id, power, scoreWeights) {
  if (!power) return null;
  const mix = scoreWeights || weights;
  const role = power.role;
  const picks = oePicks(id, role);
  const roleGames = oeRoleGames(role);
  const popInfo = oePop[role] || { prior: 20 };
  const popularity = POPULARITY_SCALE * (picks / (picks + popInfo.prior));
  const flex = blindSafety(id, role);
  return {
    popularity: popularity,
    safety: flex.safety,
    meanDelta: flex.mean,
    sharpShare: flex.sharpShare,
    picks: picks,
    pickRate: roleGames ? picks / roleGames : 0,
    score:
      mix.wr * power.power +
      mix.pop * popularity +
      mix.safety * flex.safety,
  };
}

function blindSafety(id, role) {
  if (!counters[id]) return { mean: 0, sharpShare: 0, safety: 0 };
  const taken = takenIds();
  let deltaSum = 0;
  let weightSum = 0;
  let sharpWeight = 0;
  for (let i = 0; i < champions.length; i += 1) {
    const them = champions[i].id;
    if (!them || them === id || taken.has(them)) continue;
    const delta = matchupDelta(id, them);
    if (delta == null) continue;
    // Remaining selectable pool only; impact scaled by OE pick frequency in
    // roles that can actually answer this opener.
    const weight = blindThreatWeight(them, role);
    if (weight <= 0) continue;
    deltaSum += delta * weight;
    weightSum += weight;
    if (delta <= SHARP_COUNTER_DELTA) sharpWeight += weight;
  }
  if (!weightSum) return { mean: 0, sharpShare: 0, safety: 0 };
  const mean = deltaSum / weightSum;
  const sharpShare = sharpWeight / weightSum;
  return {
    mean: mean,
    sharpShare: sharpShare,
    safety: mean - 2.2 * sharpShare,
  };
}

function positionOverlap(us, them) {
  const a = roleRates[us];
  const b = roleRates[them];
  if (!a || !b) return { overlap: 0, weight: 0.55, primaryUs: "", primaryThem: "" };
  let overlap = 0;
  if (recRole !== "All") {
    const key = recRole.toLowerCase();
    overlap = a.rates[key] || 0;
  } else {
    for (let i = 0; i < ROLE_KEYS.length; i += 1) {
      const key = ROLE_KEYS[i];
      overlap += Math.min(a.rates[key] || 0, b.rates[key] || 0);
    }
  }
  return {
    overlap: overlap,
    weight: recRole !== "All" ? 0.4 + 0.6 * overlap : 0.45 + 0.55 * overlap,
    primaryUs: a.primary,
    primaryThem: b.primary,
  };
}

function formatShare(share) {
  const pct = share * 100;
  if (pct >= 10) return pct.toFixed(0) + "%";
  if (pct >= 1) return pct.toFixed(1) + "%";
  return pct.toFixed(2) + "%";
}

function matchupPopularity(us, them, games) {
  const usTotal = champGames[us] || 0;
  const themTotal = champGames[them] || 0;
  const shareUs = usTotal > 0 && games ? games / usTotal : 0;
  const shareThem = themTotal > 0 && games ? games / themTotal : 0;
  const geo =
    shareUs > 0 && shareThem > 0 ? Math.sqrt(shareUs * shareThem) : shareUs || shareThem;
  const factor = Math.max(0, Math.min(1, geo / 0.03));
  return {
    shareUs: shareUs,
    shareThem: shareThem,
    weight: 0.95 + 0.1 * factor,
  };
}

function enemyIds() {
  const other = recSide === "blue" ? "red" : "blue";
  return state[other].picks.filter(Boolean);
}

function allyIds() {
  return state[recSide].picks.filter(Boolean);
}

function champRoleRates(id) {
  const info = roleRates[id];
  if (info && info.rates) return info.rates;
  const primary = primaryWinrateRole(id);
  const rates = { top: 0, jng: 0, mid: 0, adc: 0, sup: 0 };
  if (primary) rates[primary] = 1;
  return rates;
}

function filledRoles() {
  const filled = { top: 0, jng: 0, mid: 0, adc: 0, sup: 0 };
  const team = state[recSide];
  if (!team) return filled;
  for (let i = 0; i < 5; i += 1) {
    const id = team.picks[i];
    if (!id) continue;
    const assigned = team.roles[i];
    const key = assigned ? assigned.toLowerCase() : pickPrimaryRole(id);
    if (key && filled[key] != null) filled[key] += 1;
  }
  return filled;
}

function roleTaken(key, filled) {
  return !!key && (filled[key] || 0) >= ROLE_FILL_LOCK;
}

function openRoleFit(id) {
  const filled = filledRoles();
  const rates = champRoleRates(id);
  let fit = 0;
  for (let i = 0; i < ROLE_KEYS.length; i += 1) {
    const role = ROLE_KEYS[i];
    if (roleTaken(role, filled)) continue;
    fit = Math.max(fit, rates[role] || 0);
  }
  return fit;
}

function roleConflict(id, filled) {
  const rates = champRoleRates(id);
  let overlap = 0;
  const hits = [];
  for (let i = 0; i < ROLE_KEYS.length; i += 1) {
    const key = ROLE_KEYS[i];
    const share = (rates[key] || 0) * (filled[key] || 0);
    if (share > 0.02) hits.push({ role: key, share: share, filled: filled[key] });
    overlap += share;
  }
  hits.sort(function (a, b) {
    return b.share - a.share;
  });
  return { overlap: overlap, hits: hits };
}

function responseRoleFit(rates, role) {
  if (role === "adc") return Math.min(1, (rates.adc || 0) + 0.8 * (rates.sup || 0));
  if (role === "sup") return Math.min(1, (rates.sup || 0) + 0.8 * (rates.adc || 0));
  return rates[role] || 0;
}

function roleResponse(id) {
  const other = recSide === "blue" ? "red" : "blue";
  const enemyTeam = state[other];
  const rates = champRoleRates(id);
  let response = 0;
  for (let i = 0; i < enemyTeam.picks.length; i += 1) {
    const enemy = enemyTeam.picks[i];
    if (!enemy) continue;
    const role = (enemyTeam.roles[i] || pickPrimaryRole(enemy) || "").toLowerCase();
    const fit = responseRoleFit(rates, role);
    if (!fit) continue;
    const delta = matchupDelta(id, enemy);
    response += RESPONSE_ROLE_BASE * fit;
    if (delta != null) response += delta * fit;
  }
  return response;
}

function oePickOrder(id, role) {
  const byChamp = oracles.pick_order && oracles.pick_order[id];
  const row = byChamp && byChamp[role];
  if (!row || !row.picks) return null;
  return row;
}

function botEarlyPickScore(id) {
  if (!chartOpen || chartStage !== "play") return 0;
  const step = CHART_STEPS[chartCurrentStep()];
  if (!step || step.kind !== "pick") return 0;
  const pickCount =
    state.blue.picks.filter(Boolean).length + state.red.picks.filter(Boolean).length;
  if (pickCount >= OE_EARLY_PHASE_PICKS) return 0;
  const role = powerRoleFor(id);
  const order = oePickOrder(id, role);
  if (!order) return 0;
  const confidence = order.picks / (order.picks + OE_EARLY_PICK_PRIOR);
  const earlyRate = order.early / order.picks;
  return OE_EARLY_PICK_SCALE * confidence * (earlyRate - 0.5);
}

function botResponseFactor() {
  if (!chartOpen || chartStage !== "play" || !chartYou) return 1;
  const playerPicks = state[chartYou].picks.filter(Boolean).length;
  if (!playerPicks) return 0;
  if (playerPicks === 1) return 0.8;
  if (playerPicks === 2) return 0.45;
  if (playerPicks === 3) return 0.7;
  return 1;
}

function matchupEntry(us, them) {
  if (counters[us] && counters[us][them]) return counters[us][them];
  return null;
}

function matchupDelta(us, them) {
  const direct = matchupEntry(us, them);
  if (direct && typeof direct.delta === "number") return direct.delta;
  if (typeof direct === "number") return direct;
  const inverse = matchupEntry(them, us);
  if (inverse && typeof inverse.delta === "number") return -inverse.delta;
  if (typeof inverse === "number") return -inverse;
  return null;
}

function matchupGames(us, them) {
  const direct = matchupEntry(us, them);
  if (direct && typeof direct.games === "number") return direct.games;
  const inverse = matchupEntry(them, us);
  if (inverse && typeof inverse.games === "number") return inverse.games;
  return null;
}

function proMatchup(us, them) {
  const row = oracles.matchups && oracles.matchups[us];
  if (row && row[them]) return row[them];
  return null;
}

function synergyEntry(us, them) {
  if (synergies[us] && synergies[us][them]) return synergies[us][them];
  if (synergies[them] && synergies[them][us]) return synergies[them][us];
  return null;
}

function teamPickRows(side) {
  const team = state[side];
  const rows = [];
  for (let i = 0; i < 5; i += 1) {
    if (!team.picks[i]) continue;
    rows.push({ id: team.picks[i], role: team.roles[i] || "" });
  }
  return rows;
}

function lineupFor(side) {
  const team = state[side];
  const org = orgOf(side);
  const byRole = {};
  const extra = [];
  for (let i = 0; i < 5; i += 1) {
    const id = team.picks[i];
    if (!id) continue;
    const assigned = team.roles[i] || inferredSlotRole(id) || "";
    const role = assigned.toLowerCase();
    const row = {
      id: id,
      role: role,
      name: (org && role && org.starters[role]) || "",
    };
    if (role && ROLE_KEYS.indexOf(role) !== -1 && !byRole[role]) byRole[role] = row;
    else extra.push(row);
  }
  if (org) {
    for (let i = 0; i < ROLE_KEYS.length; i += 1) {
      const role = ROLE_KEYS[i];
      if (byRole[role]) continue;
      const player = org.starters[role];
      if (!player) continue;
      byRole[role] = { role: role, name: player };
    }
  }
  const rows = [];
  for (let i = 0; i < ROLE_KEYS.length; i += 1) {
    if (byRole[ROLE_KEYS[i]]) rows.push(byRole[ROLE_KEYS[i]]);
  }
  return rows.concat(extra);
}

function expectLaneWeight(us, them, usRole, themRole) {
  if (usRole && themRole) {
    return usRole.toLowerCase() === themRole.toLowerCase() ? 1 : 0.2;
  }
  const a = roleRates[us];
  const b = roleRates[them];
  if (!a || !b) return 0.35;
  let overlap = 0;
  for (let i = 0; i < ROLE_KEYS.length; i += 1) {
    const key = ROLE_KEYS[i];
    overlap += Math.min(a.rates[key] || 0, b.rates[key] || 0);
  }
  return 0.2 + 0.8 * overlap;
}

function clampProb(p) {
  return Math.max(0.01, Math.min(0.99, p));
}

function eloFromDelta(delta) {
  const p = clampProb(0.5 + (Number(delta) || 0) / 100);
  return ELO_SCALE * (Math.log(p / (1 - p)) / Math.LN10);
}

function expectedFromElo(diff) {
  return 1 / (1 + Math.pow(10, -diff / ELO_SCALE));
}

function teamPairing(rows) {
  let eloNum = 0;
  let deltaNum = 0;
  let den = 0;
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const entry = synergyEntry(rows[i].id, rows[j].id);
      if (!entry || typeof entry.delta !== "number") continue;
      const games = entry.games || 0;
      const conf = games / (games + PAIR_PRIOR_GAMES);
      eloNum += eloFromDelta(entry.delta) * conf;
      deltaNum += entry.delta * conf;
      den += conf;
    }
  }
  return { elo: den ? eloNum / den : 0, delta: den ? deltaNum / den : 0 };
}

function teamCounter(usRows, themRows) {
  let eloNum = 0;
  let deltaNum = 0;
  let den = 0;
  for (let i = 0; i < usRows.length; i += 1) {
    for (let j = 0; j < themRows.length; j += 1) {
      const us = usRows[i];
      const them = themRows[j];
      const d = matchupDelta(us.id, them.id);
      if (d == null) continue;
      const games = matchupGames(us.id, them.id) || 0;
      const conf = games / (games + PAIR_PRIOR_GAMES);
      const lane = expectLaneWeight(us.id, them.id, us.role, them.role);
      const weight = lane * Math.max(conf, 0.15);
      eloNum += eloFromDelta(d) * weight;
      deltaNum += d * weight;
      den += weight;
    }
  }
  return { elo: den ? eloNum / den : 0, delta: den ? deltaNum / den : 0 };
}

function draftExpect() {
  const bluePicks = teamPickRows("blue");
  const redPicks = teamPickRows("red");
  const hasDraft = bluePicks.length > 0 && redPicks.length > 0;
  const hasTeams = !!(state.blue.org && state.red.org);
  const predict = window.RIFT_PREDICT;
  if (predict && predict.matchPredict && (hasDraft || hasTeams)) {
    const rec = predict.matchPredict(lineupFor("blue"), lineupFor("red"));
    return {
      ready: true,
      blue: rec.blue,
      red: rec.red,
      elo: rec.elo,
      draft: rec.draft,
      team: rec.team,
      comfort: rec.comfort,
      side: rec.side,
      counter: rec.counter,
      pairing: rec.pairing,
      hasDraft: hasDraft,
      hasTeams: hasTeams,
    };
  }
  if (!hasDraft) {
    return { ready: false, blue: 50, red: 50, counter: 0, pairing: 0, elo: 0 };
  }
  const counter = teamCounter(bluePicks, redPicks);
  const pairBlue = teamPairing(bluePicks);
  const pairRed = teamPairing(redPicks);
  const pairingDelta = pairBlue.delta - pairRed.delta;
  const elo = (counter.elo + pairBlue.elo - pairRed.elo) * ELO_MULT;
  const p = expectedFromElo(elo);
  return {
    ready: true,
    blue: p * 100,
    red: (1 - p) * 100,
    counter: counter.delta,
    pairing: pairingDelta,
    elo: elo,
    hasDraft: true,
    hasTeams: false,
  };
}

function toneClass(value) {
  if (value > 0.05) return "up";
  if (value < -0.05) return "down";
  return "";
}

function renderExpect() {
  if (!els.expectBluePct) return;
  const rec = draftExpect();
  els.expectBlueName.textContent = state.blue.name || "Blue";
  els.expectRedName.textContent = state.red.name || "Red";
  els.expectBluePct.textContent = rec.blue.toFixed(1) + "%";
  els.expectRedPct.textContent = rec.red.toFixed(1) + "%";
  if (els.expectFill) els.expectFill.style.width = rec.blue.toFixed(1) + "%";
  if (!rec.ready) {
    els.expectSub.textContent =
      state.blue.org || state.red.org
        ? "Select both teams or drop picks to estimate win%"
        : "Drop picks on both sides to estimate win%";
    if (els.expectMeter) els.expectMeter.title = "Expected win% from draft, teams, and comfort";
    return;
  }
  const bits = [
    "Elo <span class=\"" + toneClass(rec.elo) + "\">" + formatDelta(rec.elo) + "</span>",
  ];
  if (rec.hasDraft) {
    if (rec.draft != null) {
      bits.push("draft <span class=\"" + toneClass(rec.draft) + "\">" + formatDelta(rec.draft) + "</span>");
    } else {
      bits.push(
        "counter <span class=\"" +
          toneClass(rec.counter) +
          "\">" +
          formatDelta(rec.counter) +
          "</span> · pairing <span class=\"" +
          toneClass(rec.pairing) +
          "\">" +
          formatDelta(rec.pairing) +
          "</span>"
      );
    }
  }
  if (rec.hasTeams && rec.team != null) {
    bits.push("teams <span class=\"" + toneClass(rec.team) + "\">" + formatDelta(rec.team) + "</span>");
  }
  if (rec.comfort) {
    bits.push("comfort <span class=\"" + toneClass(rec.comfort) + "\">" + formatDelta(rec.comfort) + "</span>");
  }
  if (rec.side) {
    bits.push("side <span class=\"" + toneClass(rec.side) + "\">" + formatDelta(rec.side) + "</span>");
  }
  els.expectSub.innerHTML = bits.join(" · ");
  if (els.expectMeter) {
    els.expectMeter.title =
      (state.blue.name || "Blue") +
      " " +
      rec.blue.toFixed(1) +
      "% · " +
      els.expectSub.textContent;
  }
}

function scoreChampion(id, enemies, allies, scoreWeights) {
  const mix = scoreWeights || weights;
  const power = champPower(id);
  const blind = power ? blindPick(id, power, mix) : null;
  const parts = [];
  const pairs = [];
  allies = allies || [];
  enemies = enemies || [];
  for (let i = 0; i < enemies.length; i += 1) {
    const delta = matchupDelta(id, enemies[i]);
    if (delta == null) continue;
    const games = matchupGames(id, enemies[i]);
    const pop = matchupPopularity(id, enemies[i], games);
    const pos = positionOverlap(id, enemies[i]);
    parts.push({
      id: enemies[i],
      delta: delta,
      games: games,
      shareUs: pop.shareUs,
      shareThem: pop.shareThem,
      weight: pop.weight,
      posOverlap: pos.overlap,
      posWeight: pos.weight,
      primaryUs: pos.primaryUs,
      primaryThem: pos.primaryThem,
      weighted: delta * pop.weight * pos.weight,
      pro: proMatchup(id, enemies[i]),
    });
  }
  for (let i = 0; i < allies.length; i += 1) {
    const entry = synergyEntry(id, allies[i]);
    if (!entry || typeof entry.delta !== "number") continue;
    const games = entry.games || 0;
    const conf = games / (games + PAIR_PRIOR_GAMES);
    pairs.push({
      id: allies[i],
      delta: entry.delta,
      games: games,
      role: entry.role || "",
      conf: conf,
      weighted: entry.delta * conf,
    });
  }
  let counter = 0;
  for (let i = 0; i < parts.length; i += 1) counter += parts[i].weighted;
  let pairing = 0;
  for (let i = 0; i < pairs.length; i += 1) pairing += pairs[i].weighted;
  const responseFactor = mix === BOT_WEIGHTS ? botResponseFactor() : 1;
  const response = roleResponse(id) * responseFactor;
  const earlyPick = mix === BOT_WEIGHTS ? botEarlyPickScore(id) : 0;
  const filled = filledRoles();
  const roles = roleConflict(id, filled);
  const primary = pickPrimaryRole(id);
  const primaryTaken = primary ? Math.min(1, filled[primary] || 0) : 0;
  const unique = -UNIQUE_ROLE_SCALE * (roles.overlap + UNIQUE_PRIMARY_SCALE * primaryTaken);
  const base = blind ? blind.score : 0;
  const role = (power && power.role) || powerRoleFor(id);
  const org = orgOf(recSide);
  let teamPop = 0;
  let teamPicks = 0;
  let teamN = 0;
  let comfort = 0;
  let comfortPlayer = "";
  if (org && role && org.roles[role]) {
    teamN = org.roles[role].n || 0;
    teamPicks = org.roles[role].champs[id] || 0;
    if (teamN >= 3) {
      teamPop = POPULARITY_SCALE * (teamPicks / (teamPicks + Math.max(2, teamN * 0.05)));
    }
    comfortPlayer = org.starters[role] || "";
    if (comfortPlayer && window.RIFT_PREDICT && window.RIFT_PREDICT.champResidual) {
      const z = window.RIFT_PREDICT.champResidual(comfortPlayer, role, id);
      if (z != null) comfort = z * TEAM_COMFORT_SCALE;
    }
  }
  const leaguePop = blind ? blind.popularity : 0;
  const popShift = org && teamN >= 3 ? mix.pop * TEAM_POP_BLEND * (teamPop - leaguePop) : 0;
  let rare = 0;
  let teamWr = 0;
  if (org && teamN >= 8) {
    const rate = teamPicks / teamN;
    if (!teamPicks) rare = TEAM_RARE_PENALTY;
    else if (rate < TEAM_RARE_RATE && teamPicks < 4) {
      rare = TEAM_RARE_PENALTY * (1 - Math.min(1, rate / TEAM_RARE_RATE));
    }
  }
  if (org && role && teamPicks >= 6) {
    const wins = (org.roles[role].champWins && org.roles[role].champWins[id]) || 0;
    const conf = teamPicks / (teamPicks + 10);
    const teamPower = (wins / teamPicks - 0.5) * 100 * conf;
    const leaguePower = power ? power.power : 0;
    teamWr = mix.wr * (teamPower - leaguePower);
  }
  rare *= mix.pop;
  if (
    !parts.length &&
    !pairs.length &&
    !blind &&
    !popShift &&
    !comfort &&
    !rare &&
    !teamWr &&
    !response &&
    !earlyPick
  ) {
    return null;
  }
  return {
    avg:
      base +
      mix.counter * counter +
      mix.pairing * pairing +
      mix.unique * unique +
      (mix.response || 0) * response +
      earlyPick +
      popShift +
      comfort +
      teamWr -
      rare,
    power: power,
    blind: blind,
    counter: counter,
    pairing: pairing,
    unique: unique,
    response: response,
    earlyPick: earlyPick,
    teamPop: popShift,
    teamWr: teamWr,
    teamRare: rare,
    teamPicks: teamPicks,
    teamN: teamN,
    teamName: org ? org.name : "",
    comfort: comfort,
    comfortPlayer: comfortPlayer,
    roles: roles,
    parts: parts,
    pairs: pairs,
  };
}

function recommendedPicks() {
  const enemies = enemyIds();
  const allies = allyIds();
  const taken = takenIds();
  const filled = filledRoles();
  const org = orgOf(recSide);
  const recs = [];
  for (let i = 0; i < champions.length; i += 1) {
    const champ = champions[i];
    if (taken.has(champ.id)) continue;
    if (tag !== "All" && champ.tags.indexOf(tag) === -1) continue;
    if (!champFitsRole(champ.id, recRole)) continue;
    if (recRole === "All" && roleTaken(pickPrimaryRole(champ.id), filled)) continue;
    if (org && recRole !== "All") {
      const bag = org.roles[recRole.toLowerCase()];
      if (bag && bag.n >= 8 && !(bag.champs[champ.id] > 0)) continue;
    }
    const score = scoreChampion(champ.id, enemies, allies);
    if (!score) continue;
    recs.push({
      champ: champ,
      avg: score.avg,
      power: score.power,
      blind: score.blind,
      counter: score.counter,
      pairing: score.pairing,
      unique: score.unique,
      response: score.response,
      teamPop: score.teamPop,
      teamWr: score.teamWr,
      teamRare: score.teamRare,
      teamPicks: score.teamPicks,
      teamN: score.teamN,
      teamName: score.teamName,
      comfort: score.comfort,
      comfortPlayer: score.comfortPlayer,
      roles: score.roles,
      parts: score.parts,
      pairs: score.pairs,
    });
  }
  recs.sort(function (a, b) {
    return b.avg - a.avg;
  });
  return recs;
}

function scoreTooltip(champ, score) {
  if (!score) return champ.name + " · drag onto a pick or ban";
  const lines = [champ.name + "  " + formatDelta(score.avg)];
  if (score.power) {
    lines.push(
      "power  " +
        formatDelta(weights.wr * score.power.power) +
        "  (" +
        score.power.wr.toFixed(1) +
        "% " +
        roleLabel(score.power.role) +
        ", " +
        score.power.games.toLocaleString() +
        " games vs " +
        score.power.avg.toFixed(1) +
        "% avg · ×" +
        weights.wr.toFixed(2) +
        ")"
    );
  }
  if (score.blind) {
    const opening = Number(score.blind.picks || 0).toLocaleString(undefined, {
      maximumFractionDigits: 1,
    });
    lines.push(
      "popular  " +
        formatDelta(weights.pop * score.blind.popularity) +
        "  (" +
        opening +
        " opening " +
        roleLabel(score.power && score.power.role) +
        ", " +
        formatShare(score.blind.pickRate) +
        " of recent pro · ×" +
        weights.pop.toFixed(2) +
        ")  ·  safety  " +
        formatDelta(weights.safety * score.blind.safety) +
        "  (" +
        formatShare(score.blind.sharpShare) +
        " hard counters · ×" +
        weights.safety.toFixed(2) +
        ", vs remaining pool · OE-weighted)"
      );
  }
  if (score.parts && score.parts.length) {
    lines.push(
      "counters  " +
        formatDelta(weights.counter * score.counter) +
        " vs enemy · ×" +
        weights.counter.toFixed(2)
    );
  }
  const parts = score.parts || [];
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    let line = "vs " + champName(part.id) + "  " + formatDelta(part.delta);
    if (part.games) {
      line +=
        "  (" +
        part.games.toLocaleString() +
        " games · " +
        formatShare(part.shareUs) +
        " of " +
        champ.name +
        ", " +
        formatShare(part.shareThem) +
        " of " +
        champName(part.id) +
        ")";
    }
    lines.push(line);
    if (part.posOverlap != null) {
      lines.push(
        "  roles  " +
          formatShare(part.posOverlap) +
          " overlap (" +
          roleLabel(part.primaryUs) +
          " vs " +
          roleLabel(part.primaryThem) +
          ")"
      );
    }
    if (part.pro && part.pro.games) {
      const losses = part.pro.games - part.pro.wins;
      lines.push(
        "  pro  " +
          formatDelta(part.pro.delta) +
          "  (" +
          part.pro.wins +
          "-" +
          losses +
          ", " +
          part.pro.games.toLocaleString() +
          " games)"
      );
    }
  }
  if (score.pairs && score.pairs.length) {
    lines.push(
      "pairing  " +
        formatDelta(weights.pairing * score.pairing) +
        " with allies · ×" +
        weights.pairing.toFixed(2)
    );
    for (let i = 0; i < score.pairs.length; i += 1) {
      const pair = score.pairs[i];
      lines.push(
        "with " +
          champName(pair.id) +
          "  " +
          formatDelta(pair.weighted) +
          "  (" +
          formatDelta(pair.delta) +
          " Δ2, " +
          (pair.games || 0).toLocaleString() +
          " games)"
      );
    }
  }
  if (score.unique) {
    const hits = (score.roles && score.roles.hits) || [];
    const filled = hits
      .slice(0, 2)
      .map(function (hit) {
        return roleLabel(hit.role) + " " + formatShare(hit.filled);
      })
      .join(", ");
    lines.push(
      "unique  " +
        formatDelta(weights.unique * score.unique) +
        "  (" +
        (filled ? filled + " already picked" : "role overlap") +
        " · ×" +
        weights.unique.toFixed(2) +
        ")"
    );
  }
  if (score.teamName && (score.teamPop || score.teamN)) {
    lines.push(
      "team  " +
        score.teamName +
        "  " +
        formatDelta(score.teamPop) +
        "  (" +
        (score.teamPicks || 0) +
        " / " +
        (score.teamN || 0) +
        " " +
        roleLabel((score.power && score.power.role) || "") +
        ")"
    );
  }
  if (score.teamWr) {
    lines.push("team form  " + formatDelta(score.teamWr) + "  (their games on " + champ.name + ")");
  }
  if (score.teamRare) {
    lines.push("team rare  " + formatDelta(-score.teamRare) + "  (almost never picked here)");
  }
  if (score.comfortPlayer && score.comfort) {
    lines.push(
      score.comfortPlayer + "  " + formatDelta(score.comfort) + " on " + champ.name
    );
  }
  return lines.join("\n");
}

function slotList(team, kind) {
  return kind === "ban" ? state[team].bans : state[team].picks;
}

function takenIds() {
  return new Set(
    state.blue.bans
      .concat(state.blue.picks, state.red.bans, state.red.picks, state.usedPicks)
      .filter(Boolean)
  );
}

function findSlot(id) {
  const sides = ["blue", "red"];
  const kinds = ["bans", "picks"];
  for (const team of sides) {
    for (const kind of kinds) {
      const index = state[team][kind].indexOf(id);
      if (index !== -1) {
        return { team: team, kind: kind === "bans" ? "ban" : "pick", index: index };
      }
    }
  }
  return null;
}

function snapshot() {
  history.push(structuredClone(state));
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(function () {
    els.toast.hidden = true;
  }, 1800);
}

function clearDropHover() {
  document.querySelectorAll(".drop-hover").forEach(function (node) {
    node.classList.remove("drop-hover");
  });
}

function allowDrop(event) {
  if (!drag) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

function beginDrag(event, payload) {
  drag = payload;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", payload.id || "slot");
  if (event.currentTarget.classList) {
    event.currentTarget.classList.add("is-dragging");
  }
}

function endDrag(event) {
  if (event.currentTarget.classList) {
    event.currentTarget.classList.remove("is-dragging");
  }
  drag = null;
  clearDropHover();
}

function placeChampion(id, team, kind, index) {
  if (!id) return;
  if (state.usedPicks.indexOf(id) !== -1) {
    toast("That champion is locked in the Fearless pool");
    return;
  }
  if (chartOpen && chartStage === "play") {
    const step = CHART_STEPS[chartCurrentStep()];
    if (!step || step.team !== team || step.kind !== kind || step.index !== index) return;
    if (findSlot(id)) return;
  }

  const dest = slotList(team, kind);
  const existing = findSlot(id);
  const replaced = dest[index];
  const sameSlot =
    existing && existing.team === team && existing.kind === kind && existing.index === index;
  if (sameSlot) return;

  snapshot();

  if (existing) {
    slotList(existing.team, existing.kind)[existing.index] = replaced || null;
    if (existing.kind === "pick" && kind === "pick") {
      const movingRole = state[existing.team].roles[existing.index];
      state[existing.team].roles[existing.index] = state[team].roles[index];
      state[team].roles[index] = movingRole;
    } else if (existing.kind === "pick") {
      state[existing.team].roles[existing.index] = null;
    } else if (kind === "pick") {
      state[team].roles[index] = inferredSlotRole(id);
    }
  } else if (kind === "pick") {
    state[team].roles[index] = inferredSlotRole(id);
  }

  dest[index] = id;
  render();
  queueChartBot();
}

function clearSlot(team, kind, index) {
  if (!chartSlotEditable(team, kind, index)) return;
  const dest = slotList(team, kind);
  if (!dest[index]) return;
  snapshot();
  dest[index] = null;
  if (kind === "pick") state[team].roles[index] = null;
  render();
}

function returnToPool(id) {
  const found = findSlot(id);
  if (!found) return;
  clearSlot(found.team, found.kind, found.index);
}

function undo() {
  if (chartOpen && chartStage === "play") {
    clearTimeout(chartBotTimer);
    while (history.length) {
      state = history.pop();
      const step = CHART_STEPS[chartCurrentStep()];
      if (!step || step.team === chartYou) break;
    }
    render();
    return;
  }
  if (!history.length) return;
  state = history.pop();
  render();
}

function resetGame() {
  snapshot();
  const keep = {
    fearless: state.fearless,
    seriesLength: state.seriesLength,
    gameIndex: state.gameIndex,
    usedPicks: state.usedPicks,
    blueName: state.blue.name,
    redName: state.red.name,
    blueOrg: state.blue.org,
    redOrg: state.red.org,
  };
  state = emptyState();
  state.fearless = keep.fearless;
  state.seriesLength = keep.seriesLength;
  state.gameIndex = keep.gameIndex;
  state.usedPicks = keep.usedPicks;
  state.blue.name = keep.blueName;
  state.red.name = keep.redName;
  state.blue.org = keep.blueOrg;
  state.red.org = keep.redOrg;
  if (chartOpen && chartStage === "play") history = [];
  render();
  queueChartBot();
}

function nextGame() {
  const openEndedFearless = state.fearless && state.seriesLength === 1;
  if (!openEndedFearless && state.gameIndex + 1 >= state.seriesLength) {
    toast("Series complete");
    return;
  }
  snapshot();
  if (state.fearless) {
    state.usedPicks = state.usedPicks.concat(
      state.blue.picks.filter(Boolean),
      state.red.picks.filter(Boolean)
    );
  }
  state.gameIndex += 1;
  state.blue.bans = Array(5).fill(null);
  state.blue.picks = Array(5).fill(null);
  state.blue.roles = Array(5).fill(null);
  state.red.bans = Array(5).fill(null);
  state.red.picks = Array(5).fill(null);
  state.red.roles = Array(5).fill(null);
  render();
}

function swapSides() {
  snapshot();
  const blue = structuredClone(state.blue);
  state.blue = structuredClone(state.red);
  state.red = blue;
  render();
}

function cycleRole(team, index) {
  if (!chartSlotEditable(team, "pick", index)) return;
  const current = state[team].roles[index];
  const next = current == null ? 0 : ROLES.indexOf(current) + 1;
  state[team].roles[index] = next >= ROLES.length ? null : ROLES[next];
  render();
}

function visibleChampions() {
  const query = search.trim().toLowerCase().replace(/['.\s]/g, "");
  return champions.filter(function (champ) {
    if (tag !== "All" && champ.tags.indexOf(tag) === -1) return false;
    if (!champFitsRole(champ.id, recRole)) return false;
    if (!query) return true;
    const hay = (champ.name + champ.id + champ.key).toLowerCase().replace(/['.\s]/g, "");
    return hay.indexOf(query) !== -1;
  });
}

function chartSlotEditable(team, kind, index) {
  if (!chartOpen || chartStage !== "play") return true;
  const step = CHART_STEPS[chartCurrentStep()];
  return !!step && step.team === team && step.kind === kind && step.index === index;
}

function bindSlotDrop(node, team, kind, index) {
  if (!chartSlotEditable(team, kind, index)) return;
  node.addEventListener("dragover", function (event) {
    allowDrop(event);
    node.classList.add("drop-hover");
  });
  node.addEventListener("dragleave", function (event) {
    if (!node.contains(event.relatedTarget)) node.classList.remove("drop-hover");
  });
  node.addEventListener("drop", function (event) {
    event.preventDefault();
    node.classList.remove("drop-hover");
    if (!drag) return;
    placeChampion(drag.id, team, kind, index);
    drag = null;
  });
  node.addEventListener("dblclick", function () {
    clearSlot(team, kind, index);
  });
}

function renderBans(team, root) {
  root.innerHTML = "";
  for (let i = 0; i < 5; i += 1) {
    const slot = document.createElement("div");
    const id = state[team].bans[i];
    const editable = chartSlotEditable(team, "ban", i);
    slot.className = "ban";
    slot.title = id ? champName(id) + " — double-click to remove" : "Drop a ban here";
    if (id) {
      slot.classList.add("filled");
      slot.draggable = editable;
      const img = document.createElement("img");
      img.src = portrait(id);
      img.alt = champName(id);
      img.draggable = false;
      slot.append(img);
      if (editable) {
        slot.addEventListener("dragstart", function (event) {
          beginDrag(event, { id: id, team: team, kind: "ban", index: i });
        });
        slot.addEventListener("dragend", endDrag);
      }
    }
    bindSlotDrop(slot, team, "ban", i);
    root.append(slot);
  }
}

function renderPicks(team, root) {
  root.innerHTML = "";
  for (let i = 0; i < 5; i += 1) {
    const slot = document.createElement("article");
    const id = state[team].picks[i];
    const editable = chartSlotEditable(team, "pick", i);
    slot.className = "pick";
    slot.title = id ? champName(id) + " — drag to move, double-click to remove" : "Drop a pick here";
    if (id) {
      slot.draggable = editable;
      slot.classList.add("filled");
      const art = document.createElement("img");
      art.className = "pick-art";
      art.src = loadingArt(id);
      art.alt = champName(id);
      art.draggable = false;
      const meta = document.createElement("div");
      meta.className = "pick-meta";
      const name = document.createElement("div");
      name.className = "pick-name";
      name.textContent = champName(id);
      const role = document.createElement("button");
      role.type = "button";
      role.className = "role-btn";
      role.textContent = state[team].roles[i] || "ROLE";
      role.disabled = !editable;
      role.addEventListener("click", function (event) {
        event.stopPropagation();
        cycleRole(team, i);
      });
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "role-btn";
      clear.textContent = "✕";
      clear.title = "Return to pool";
      clear.disabled = !editable;
      clear.addEventListener("click", function (event) {
        event.stopPropagation();
        clearSlot(team, "pick", i);
      });
      meta.append(name, role, clear);
      slot.append(art, meta);
      if (editable) {
        slot.addEventListener("dragstart", function (event) {
          beginDrag(event, { id: id, team: team, kind: "pick", index: i });
        });
        slot.addEventListener("dragend", endDrag);
      }
    } else {
      const empty = document.createElement("div");
      empty.className = "pick-empty";
      empty.textContent = "Pick " + (i + 1);
      slot.append(empty);
    }
    bindSlotDrop(slot, team, "pick", i);
    root.append(slot);
  }
}

function chartCurrentStep() {
  for (let i = 0; i < CHART_STEPS.length; i += 1) {
    const step = CHART_STEPS[i];
    if (!slotList(step.team, step.kind)[step.index]) return i;
  }
  return CHART_STEPS.length;
}

function withRecContext(side, fn) {
  const prevSide = recSide;
  const prevRole = recRole;
  const prevTag = tag;
  recSide = side;
  recRole = "All";
  tag = "All";
  try {
    return fn();
  } finally {
    recSide = prevSide;
    recRole = prevRole;
    tag = prevTag;
  }
}

function firstFreeChamp() {
  const taken = takenIds();
  for (let i = 0; i < champions.length; i += 1) {
    if (!taken.has(champions[i].id)) return champions[i].id;
  }
  return null;
}

function botSpicePool(choices) {
  if (!choices.length) return [];
  const best = choices[0].score;
  const floor =
    best >= 0
      ? best * (1 - BOT_SPICE_RELATIVE_GAP)
      : best - Math.max(0.75, Math.abs(best) * BOT_SPICE_RELATIVE_GAP);
  return choices
    .slice(0, BOT_SPICE_OPTIONS)
    .filter(function (choice) {
      return choice.score >= floor;
    });
}

function botPickChoice(choices, allowSpice) {
  if (!choices.length) return null;
  if (!allowSpice || Math.random() >= BOT_SPICE_RATE) return choices[0];
  const pool = botSpicePool(choices);
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : choices[0];
}

function chartRankedChoices(side, mode) {
  return withRecContext(side, function () {
    const taken = takenIds();
    const choices = [];
    const other = side === "blue" ? "red" : "blue";
    for (let i = 0; i < champions.length; i += 1) {
      const champ = champions[i];
      if (taken.has(champ.id)) continue;
      const enemies = enemyIds();
      const allies = allyIds();
      const score = scoreChampion(champ.id, enemies, allies, BOT_WEIGHTS);
      let value = score ? score.avg : 0;
      let denial = 0;
      if (mode === "denial") {
        const playerNeed = withRecContext(other, function () {
          return openRoleFit(champ.id);
        });
        if (playerNeed) {
          const otherScore = withRecContext(other, function () {
            const otherScore = scoreChampion(champ.id, enemyIds(), allyIds(), BOT_WEIGHTS);
            return otherScore ? otherScore.avg : 0;
          });
          denial = Math.max(0, value - otherScore) * playerNeed;
        }
        value += BOT_WEIGHTS.denial * denial;
      }
      choices.push({
        id: champ.id,
        score: value,
        baseScore: score ? score.avg : 0,
        denial: denial,
        order: i,
      });
    }
    choices.sort(function (a, b) {
      return b.score - a.score || a.order - b.order;
    });
    return choices;
  });
}

function chartBotChoice(step) {
  const side = step.kind === "ban" ? chartYou : step.team;
  const choices = chartRankedChoices(side, step.kind === "ban" ? "denial" : "");
  const choice = botPickChoice(choices, step.kind === "pick");
  if (choice) return choice.id;
  return firstFreeChamp();
}

function chartTurnSteps() {
  const current = chartCurrentStep();
  const first = CHART_STEPS[current];
  if (!first) return [];
  const steps = [first];
  if (first.kind === "pick") {
    const next = CHART_STEPS[current + 1];
    if (
      next &&
      next.phase === first.phase &&
      next.team === first.team &&
      next.kind === first.kind
    ) {
      steps.push(next);
    }
  }
  return steps;
}

function chartSetSlot(step, id) {
  slotList(step.team, step.kind)[step.index] = id;
  if (step.kind === "pick") {
    state[step.team].roles[step.index] = inferredSlotRole(id);
  }
}

function chartBotPairChoice(steps) {
  if (steps.length < 2) return [];
  const first = steps[0];
  const second = steps[1];
  const firstDest = slotList(first.team, first.kind);
  const secondDest = slotList(second.team, second.kind);
  const oldFirst = firstDest[first.index];
  const oldSecond = secondDest[second.index];
  const oldFirstRole = state[first.team].roles[first.index];
  const oldSecondRole = state[second.team].roles[second.index];
  const firstChoices = chartRankedChoices(first.team);
  let best = null;
  const pairChoices = [];

  for (let i = 0; i < firstChoices.length; i += 1) {
    const firstChoice = firstChoices[i];
    chartSetSlot(first, firstChoice.id);
    const secondChoices = chartRankedChoices(second.team);
    for (let j = 0; j < secondChoices.length; j += 1) {
      const secondChoice = secondChoices[j];
      const combined = firstChoice.score + secondChoice.score;
      pairChoices.push({
        first: firstChoice.id,
        second: secondChoice.id,
        score: combined,
      });
      if (!best || combined > best.score) {
        best = {
          first: firstChoice.id,
          second: secondChoice.id,
          score: combined,
        };
      }
    }
    firstDest[first.index] = oldFirst;
    state[first.team].roles[first.index] = oldFirstRole;
  }
  secondDest[second.index] = oldSecond;
  state[second.team].roles[second.index] = oldSecondRole;
  if (!best) return [];
  if (Math.random() < BOT_SPICE_RATE) {
    pairChoices.sort(function (a, b) {
      return b.score - a.score;
    });
    const pool = botSpicePool(pairChoices);
    if (pool.length) {
      const choice = pool[Math.floor(Math.random() * pool.length)];
      return [choice.first, choice.second];
    }
  }
  return [best.first, best.second];
}

function queueChartBot() {
  clearTimeout(chartBotTimer);
  if (!chartOpen || chartStage !== "play") return;
  const step = CHART_STEPS[chartCurrentStep()];
  if (!step || step.team === chartYou) return;
  chartBotTimer = setTimeout(runChartBot, 520);
}

function runChartBot() {
  if (!chartOpen || chartStage !== "play") return;
  const steps = chartTurnSteps();
  if (!steps.length || steps[0].team === chartYou) return;
  const ids =
    steps.length === 2
      ? chartBotPairChoice(steps)
      : [chartBotChoice(steps[0])];
  if (ids.length !== steps.length || ids.some(function (id) { return !id; })) return;
  snapshot();
  for (let i = 0; i < steps.length; i += 1) {
    chartSetSlot(steps[i], ids[i]);
  }
  render();
  queueChartBot();
}

function lockChartChamp(id) {
  if (!chartOpen || chartStage !== "play") return;
  const step = CHART_STEPS[chartCurrentStep()];
  if (!step) {
    toast("Draft is complete");
    return;
  }
  if (step.team !== chartYou) {
    toast("Wait for the bot");
    return;
  }
  placeChampion(id, step.team, step.kind, step.index);
}

function clearChartBoard() {
  state.blue.bans = Array(5).fill(null);
  state.blue.picks = Array(5).fill(null);
  state.blue.roles = Array(5).fill(null);
  state.red.bans = Array(5).fill(null);
  state.red.picks = Array(5).fill(null);
  state.red.roles = Array(5).fill(null);
  state.usedPicks = [];
  history = [];
}

function enterChart() {
  if (chartOpen) return;
  freeSnapshot = {
    state: structuredClone(state),
    history: history.slice(),
    recSide: recSide,
    recRole: recRole,
    search: search,
    tag: tag,
  };
  chartOpen = true;
  chartStage = "setup";
  chartYou = "";
  clearTimeout(chartBotTimer);
  render();
}

function exitChart() {
  clearTimeout(chartBotTimer);
  chartOpen = false;
  chartStage = "setup";
  chartYou = "";
  if (freeSnapshot) {
    state = freeSnapshot.state;
    history = freeSnapshot.history;
    recSide = freeSnapshot.recSide;
    recRole = freeSnapshot.recRole;
    search = freeSnapshot.search;
    tag = freeSnapshot.tag;
    if (els.search) els.search.value = search;
    freeSnapshot = null;
  }
  render();
}

function startChartPlay(side) {
  chartYou = side;
  chartStage = "play";
  recSide = side;
  recRole = "All";
  tag = "All";
  search = "";
  if (els.chartSearch) els.chartSearch.value = "";
  clearChartBoard();
  render();
  queueChartBot();
}

function createChartSlot(team, kind, index, current) {
  const slot = document.createElement("div");
  const id = slotList(team, kind)[index];
  const label = (kind === "ban" ? "B" : "P") + (index + 1);
  slot.className = "chart-slot chart-" + kind + " chart-" + team;
  if (current) slot.classList.add("is-current");
  if (id) {
    slot.classList.add("filled");
    slot.title = champName(id);
    const img = document.createElement("img");
    img.src = portrait(id);
    img.alt = champName(id);
    img.draggable = false;
    slot.append(img);
  } else {
    slot.title = label;
    const empty = document.createElement("span");
    empty.textContent = label;
    slot.append(empty);
    if (current && team === chartYou) bindSlotDrop(slot, team, kind, index);
  }
  return slot;
}

function renderChartTimeline() {
  if (!els.chartTimeline) return;
  els.chartTimeline.innerHTML = "";
  const current = chartCurrentStep();
  let lastPhase = "";
  for (let i = 0; i < CHART_STEPS.length; i += 1) {
    const step = CHART_STEPS[i];
    if (step.phase !== lastPhase) {
      lastPhase = step.phase;
      const heading = document.createElement("h3");
      heading.textContent = step.phase;
      els.chartTimeline.append(heading);
    }
    const row = document.createElement("div");
    row.className = "chart-step chart-" + step.team;
    if (i === current) row.classList.add("is-current");
    if (i < current) row.classList.add("is-done");
    const who = document.createElement("span");
    who.className = "chart-step-who";
    who.textContent = (step.team === chartYou ? "You · " : "Bot · ") + step.label;
    row.append(who, createChartSlot(step.team, step.kind, step.index, i === current));
    els.chartTimeline.append(row);
  }
  const cur = els.chartTimeline.querySelector(".chart-step.is-current");
  if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest" });
}

function renderChartRecs() {
  if (!els.chartRecs) return;
  els.chartRecs.innerHTML = "";
  const recs = withRecContext(chartYou || recSide, recommendedPicks).slice(0, 6);
  if (!recs.length) return;
  for (let i = 0; i < recs.length; i += 1) {
    const rec = recs[i];
    const card = document.createElement("button");
    card.type = "button";
    card.className = "chart-rec";
    card.title = scoreTooltip(rec.champ, rec);
    const img = document.createElement("img");
    img.src = portrait(rec.champ.id);
    img.alt = rec.champ.name;
    const name = document.createElement("strong");
    name.textContent = rec.champ.name;
    const delta = document.createElement("span");
    delta.className = rec.avg >= 0 ? "up" : "down";
    delta.textContent = formatDelta(rec.avg);
    card.append(img, name, delta);
    card.addEventListener("click", function () {
      lockChartChamp(rec.champ.id);
    });
    els.chartRecs.append(card);
  }
}

function renderChartTurn() {
  if (!els.chartTurn) return;
  const steps = chartTurnSteps();
  const step = steps[0];
  els.chartTurn.classList.remove("is-you", "is-bot");
  if (!step) {
    els.chartTurn.textContent = "Draft complete";
    return;
  }
  const label =
    steps.length > 1 ? steps[0].label + " + " + steps[1].label : step.label;
  const yours = step.team === chartYou;
  els.chartTurn.classList.add(yours ? "is-you" : "is-bot");
  if (yours) {
    els.chartTurn.textContent = "Your turn · " + label;
  } else if (step.kind === "ban") {
    els.chartTurn.textContent = "Bot is banning your best remaining picks · " + label;
  } else {
    els.chartTurn.textContent = "Bot is picking the highest-scoring pair · " + label;
  }
}

function renderChart() {
  const chartSetupMode = chartOpen && chartStage === "setup";
  if (els.app) els.app.classList.toggle("chart-mode", chartSetupMode);
  if (els.board) els.board.hidden = chartSetupMode;
  if (els.chartScreen) els.chartScreen.hidden = !chartSetupMode;
  if (els.chartSetup) els.chartSetup.hidden = !chartOpen || chartStage !== "setup";
  if (els.chartPlay) els.chartPlay.hidden = true;
  if (els.chartBtn) {
    els.chartBtn.classList.toggle("active", chartOpen);
    els.chartBtn.setAttribute("aria-pressed", chartOpen ? "true" : "false");
    els.chartBtn.textContent = chartOpen ? "Exit practice" : "Practice draft";
  }
  if (els.phaseKicker) {
    els.phaseKicker.textContent = chartOpen ? "Practice draft" : "Free draft";
  }
  if (els.phaseTitle) {
    if (!chartOpen) els.phaseTitle.textContent = "Drop a champion on any slot";
    else if (chartStage === "setup") els.phaseTitle.textContent = "First pick or second pick";
    else {
      const steps = chartTurnSteps();
      const step = steps[0];
      const label = steps.length > 1 ? steps[0].label + " + " + steps[1].label : step && step.label;
      els.phaseTitle.textContent = step
        ? (step.team === chartYou ? "Your turn · " : "Bot turn · ") + label
        : "Practice complete";
    }
  }
  if (els.chartFirstTeam) els.chartFirstTeam.textContent = state.blue.name || "Blue Side";
  if (els.chartSecondTeam) els.chartSecondTeam.textContent = state.red.name || "Red Side";
  if (!chartOpen || chartStage !== "play") return;
  renderChartTurn();
  renderChartTimeline();
  renderChartRecs();
}

function renderGrid() {
  const root = els.grid;
  if (!root) return;
  const taken = takenIds();
  const visible = visibleChampions();
  const recs = recommendedPicks();
  const topIds = {};
  for (let i = 0; i < recs.length && i < 8; i += 1) topIds[recs[i].champ.id] = recs[i];
  const enemies = enemyIds();
  const allies = allyIds();
  root.innerHTML = "";
  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "pick-empty";
    empty.textContent =
      recRole !== "All"
        ? "No " + recRole + " champions match that search."
        : "No champions match that search.";
    root.append(empty);
    return;
  }
  for (const champ of visible) {
    const locked = taken.has(champ.id);
    const rec = topIds[champ.id];
    const score = !locked ? scoreChampion(champ.id, enemies, allies) : null;
    const button = document.createElement("div");
    button.className = "champ";
    button.draggable = !locked;
    if (locked) button.classList.add("disabled");
    if (rec) button.classList.add("suggested");
    button.setAttribute("role", "img");
    button.title = locked ? champ.name + " is already on the board" : scoreTooltip(champ, score);
    const img = document.createElement("img");
    img.src = portrait(champ.id);
    img.alt = champ.name;
    img.width = 80;
    img.height = 80;
    img.draggable = false;
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = champ.name;
    button.append(img, label);
    button.addEventListener("mouseenter", function () {
      els.splash.style.backgroundImage = 'url("' + splash(champ.id) + '")';
      els.splash.classList.add("on");
    });
    button.addEventListener("mouseleave", function () {
      els.splash.classList.remove("on");
    });
    if (!locked) {
      button.addEventListener("dragstart", function (event) {
        beginDrag(event, { id: champ.id, source: "pool" });
      });
      button.addEventListener("dragend", endDrag);
      button.addEventListener("click", function () {
        lockChartChamp(champ.id);
      });
    }
    root.append(button);
  }
}

function renderRecs() {
  if (chartOpen && chartStage === "setup") return;
  const recs = recommendedPicks();
  const enemies = enemyIds();
  const allies = allyIds();
  els.recsBlue.classList.toggle("active", recSide === "blue");
  els.recsRed.classList.toggle("active", recSide === "red");
  const hasPower = !!(winrates.lanes && Object.keys(winrates.lanes).length);
  if (!enemies.length && !allies.length && !hasPower) {
    els.recs.hidden = true;
    els.recsList.innerHTML = "";
    return;
  }
  els.recs.hidden = false;
  const ourName = recSide === "blue" ? state.blue.name : state.red.name;
  const otherName = recSide === "blue" ? state.red.name : state.blue.name;
  const roleBit = recRole === "All" ? "" : recRole + " ";
  if (enemies.length && allies.length) {
    els.recsLabel.textContent = "Best " + roleBit + "with " + ourName + " into " + otherName;
  } else if (enemies.length) {
    els.recsLabel.textContent = "Best " + roleBit + "into " + otherName;
  } else if (allies.length) {
    els.recsLabel.textContent = "Best " + roleBit + "with " + ourName;
  } else {
    const org = orgOf(recSide);
    els.recsLabel.textContent =
      (recRole === "All" ? "Blind picks" : "Blind " + recRole) + (org ? " · " + org.name : "");
  }
  els.recsList.innerHTML = "";
  const top = recs.slice(0, 8);
  if (!top.length) {
    const empty = document.createElement("p");
    empty.className = "pick-empty";
    empty.textContent = "No matchup data for the current filters.";
    els.recsList.append(empty);
    return;
  }
  for (let i = 0; i < top.length; i += 1) {
    const rec = top[i];
    const card = document.createElement("div");
    card.className = "rec-card";
    card.draggable = true;
    card.title = scoreTooltip(rec.champ, rec);
    const img = document.createElement("img");
    img.src = portrait(rec.champ.id);
    img.alt = rec.champ.name;
    img.draggable = false;
    const meta = document.createElement("div");
    meta.className = "rec-meta";
    const name = document.createElement("strong");
    name.textContent = rec.champ.name;
    const delta = document.createElement("span");
    delta.className = rec.avg >= 0 ? "up" : "down";
    delta.textContent = formatDelta(rec.avg);
    meta.append(name, delta);
    const sample = document.createElement("em");
    if (rec.power) {
      sample.textContent =
        rec.power.wr.toFixed(1) + "% " + roleLabel(rec.power.role);
    } else if (rec.parts && rec.parts.length === 1 && rec.parts[0].games) {
      sample.textContent = rec.parts[0].games.toLocaleString() + " games";
    }
    if (sample.textContent) meta.append(sample);
    card.append(img, meta);
    card.addEventListener("dragstart", function (event) {
      beginDrag(event, { id: rec.champ.id, source: "pool" });
    });
    card.addEventListener("dragend", endDrag);
    if (chartOpen && chartStage === "play") {
      card.classList.add("practice-rec");
      card.addEventListener("click", function () {
        lockChartChamp(rec.champ.id);
      });
    }
    els.recsList.append(card);
  }
}

function renderUsed() {
  const show = state.fearless && state.usedPicks.length > 0;
  els.usedBar.hidden = !show;
  els.usedChamps.innerHTML = "";
  if (!show) return;
  for (const id of state.usedPicks) {
    const img = document.createElement("img");
    img.src = portrait(id);
    img.alt = champName(id);
    img.title = champName(id);
    els.usedChamps.append(img);
  }
}

function renderRoster(side) {
  const el = side === "blue" ? els.blueRoster : els.redRoster;
  const input = side === "blue" ? els.blueName : els.redName;
  if (!el) return;
  const org = orgOf(side);
  if (input) input.classList.toggle("is-org", !!org);
  if (!org) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  const names = [];
  const tips = [];
  for (let i = 0; i < ROLE_KEYS.length; i += 1) {
    const player = org.starters[ROLE_KEYS[i]];
    if (!player) continue;
    names.push(player);
    tips.push(ROLE_KEYS[i].toUpperCase() + " " + player);
  }
  el.hidden = !names.length;
  el.textContent = names.join(" · ");
  el.title = tips.join(" · ");
}

function hideMenu(menu) {
  if (!menu) return;
  menu.hidden = true;
  menu.innerHTML = "";
}

function fillMenu(menu, items, renderItem, onPick) {
  menu.innerHTML = "";
  if (!items.length) {
    menu.hidden = true;
    return;
  }
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const button = document.createElement("button");
    button.type = "button";
    renderItem(button, item);
    button.addEventListener("mousedown", function (event) {
      event.preventDefault();
    });
    button.addEventListener("click", function () {
      onPick(item);
    });
    menu.append(button);
  }
  menu.hidden = false;
}

function renderTeamMenu(side) {
  const input = side === "blue" ? els.blueName : els.redName;
  const menu = side === "blue" ? els.blueTeamMenu : els.redTeamMenu;
  if (!input || !menu) return;
  const q = input.value;
  const hits = searchTeams(q, 12);
  const items = [];
  if (!isGenericName(q) || state[side].org) {
    items.push({ name: genericName(side), clear: true });
  }
  for (let i = 0; i < hits.length; i += 1) items.push({ name: hits[i], clear: false });
  fillMenu(
    menu,
    items,
    function (button, item) {
      button.textContent = item.clear ? item.name + " — no team data" : item.name;
      if (item.clear) button.style.color = "var(--muted)";
    },
    function (item) {
      setSideOrg(side, item.clear ? "" : item.name);
      input.value = state[side].name;
      hideMenu(menu);
      render();
    }
  );
}

function bindTeamCombo(side) {
  const input = side === "blue" ? els.blueName : els.redName;
  const menu = side === "blue" ? els.blueTeamMenu : els.redTeamMenu;
  if (!input) return;
  input.addEventListener("input", function () {
    renderTeamMenu(side);
  });
  input.addEventListener("focus", function () {
    if (isGenericName(input.value)) input.select();
    renderTeamMenu(side);
  });
  input.addEventListener("blur", function () {
    setTimeout(function () {
      hideMenu(menu);
      commitSideName(side);
      render();
    }, 120);
  });
  input.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      setSideOrg(side, "");
      input.value = genericName(side);
      hideMenu(menu);
      render();
      input.blur();
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    const hits = searchTeams(input.value, 1);
    if (hits.length && !isGenericName(input.value)) setSideOrg(side, hits[0]);
    else commitSideName(side);
    input.value = state[side].name;
    hideMenu(menu);
    render();
    input.blur();
  });
}

function render() {
  if (document.activeElement !== els.blueName) els.blueName.value = state.blue.name;
  if (document.activeElement !== els.redName) els.redName.value = state.red.name;
  renderRoster("blue");
  renderRoster("red");
  els.fearless.checked = state.fearless;
  els.series.value = String(state.seriesLength);
  els.gameLabel.textContent =
    state.fearless && state.seriesLength === 1
      ? "Fearless game " + (state.gameIndex + 1)
      : "Game " + (state.gameIndex + 1) + " / " + state.seriesLength;
  renderBans("blue", els.blueBans);
  renderBans("red", els.redBans);
  renderPicks("blue", els.bluePicks);
  renderPicks("red", els.redPicks);
  renderChart();
  renderRecs();
  renderGrid();
  renderUsed();
  renderExpect();
}

function renderRecRoles() {
  if (!els.recsRoles) return;
  els.recsRoles.innerHTML = "";
  for (const name of ROLE_FILTERS) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = name;
    button.classList.toggle("active", recRole === name);
    button.addEventListener("click", function () {
      recRole = name;
      renderRecRoles();
      renderRecs();
      renderGrid();
    });
    els.recsRoles.append(button);
  }
}

function renderTags() {
  els.tags.innerHTML = "";
  for (const name of TAGS) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = name;
    button.classList.toggle("active", tag === name);
    button.addEventListener("click", function () {
      tag = name;
      renderTags();
      renderRecs();
      renderGrid();
    });
    els.tags.append(button);
  }
}

function clampWeight(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(3, n));
}

function loadWeights() {
  weights = Object.assign({}, WEIGHT_DEFAULTS);
  try {
    let saved = JSON.parse(localStorage.getItem(WEIGHT_STORAGE) || "null");
    if (!saved) {
      saved = JSON.parse(localStorage.getItem(LEGACY_WEIGHT_STORAGE) || "null");
    }
    if (!saved) {
      saved = JSON.parse(localStorage.getItem(LEGACY_WEIGHT_STORAGE_V2) || "null");
      if (saved && Number(saved.unique) === 1) saved.unique = WEIGHT_DEFAULTS.unique;
    }
    if (saved && typeof saved === "object") {
      weights.wr = clampWeight(saved.wr, WEIGHT_DEFAULTS.wr);
      weights.pop = clampWeight(saved.pop, WEIGHT_DEFAULTS.pop);
      weights.safety = clampWeight(saved.safety, WEIGHT_DEFAULTS.safety);
      weights.counter = clampWeight(saved.counter, WEIGHT_DEFAULTS.counter);
      weights.pairing = clampWeight(saved.pairing, WEIGHT_DEFAULTS.pairing);
      weights.unique = clampWeight(saved.unique, WEIGHT_DEFAULTS.unique);
    }
  } catch (err) {}
  if (els.wWr) els.wWr.value = String(weights.wr);
  if (els.wPop) els.wPop.value = String(weights.pop);
  if (els.wSafety) els.wSafety.value = String(weights.safety);
  if (els.wCounter) els.wCounter.value = String(weights.counter);
  if (els.wPairing) els.wPairing.value = String(weights.pairing);
  if (els.wUnique) els.wUnique.value = String(weights.unique);
  syncWeightLabels();
}

function saveWeights() {
  try {
    localStorage.setItem(WEIGHT_STORAGE, JSON.stringify(weights));
  } catch (err) {}
}

function syncWeightLabels() {
  if (els.wWrVal) els.wWrVal.textContent = weights.wr.toFixed(2);
  if (els.wPopVal) els.wPopVal.textContent = weights.pop.toFixed(2);
  if (els.wSafetyVal) els.wSafetyVal.textContent = weights.safety.toFixed(2);
  if (els.wCounterVal) els.wCounterVal.textContent = weights.counter.toFixed(2);
  if (els.wPairingVal) els.wPairingVal.textContent = weights.pairing.toFixed(2);
  if (els.wUniqueVal) els.wUniqueVal.textContent = weights.unique.toFixed(2);
}

function readWeightSliders() {
  weights.wr = clampWeight(els.wWr && els.wWr.value, WEIGHT_DEFAULTS.wr);
  weights.pop = clampWeight(els.wPop && els.wPop.value, WEIGHT_DEFAULTS.pop);
  weights.safety = clampWeight(els.wSafety && els.wSafety.value, WEIGHT_DEFAULTS.safety);
  weights.counter = clampWeight(els.wCounter && els.wCounter.value, WEIGHT_DEFAULTS.counter);
  weights.pairing = clampWeight(els.wPairing && els.wPairing.value, WEIGHT_DEFAULTS.pairing);
  weights.unique = clampWeight(els.wUnique && els.wUnique.value, WEIGHT_DEFAULTS.unique);
  syncWeightLabels();
  saveWeights();
  renderRecs();
  renderGrid();
}

function bindWeights() {
  loadWeights();
  ["wWr", "wPop", "wSafety", "wCounter", "wPairing", "wUnique"].forEach(function (key) {
    if (!els[key]) return;
    els[key].addEventListener("input", readWeightSliders);
  });
}

function bind() {
  bindWeights();
  bindTeamCombo("blue");
  bindTeamCombo("red");
  els.search.addEventListener("input", function () {
    search = els.search.value;
    renderGrid();
  });
  els.fearless.addEventListener("change", function () {
    state.fearless = els.fearless.checked;
    renderUsed();
  });
  els.series.addEventListener("change", function () {
    state.seriesLength = Number(els.series.value);
    if (state.gameIndex >= state.seriesLength) state.gameIndex = state.seriesLength - 1;
    render();
  });
  els.undo.addEventListener("click", undo);
  els.reset.addEventListener("click", resetGame);
  els.next.addEventListener("click", nextGame);
  els.swap.addEventListener("click", swapSides);
  if (els.chartBtn) {
    els.chartBtn.addEventListener("click", function () {
      if (chartOpen) exitChart();
      else enterChart();
    });
  }
  if (els.chartFirst) {
    els.chartFirst.addEventListener("click", function () {
      startChartPlay("blue");
    });
  }
  if (els.chartSecond) {
    els.chartSecond.addEventListener("click", function () {
      startChartPlay("red");
    });
  }
  if (els.chartUndo) els.chartUndo.addEventListener("click", undo);
  if (els.chartReset) els.chartReset.addEventListener("click", resetGame);
  if (els.chartSearch) {
    els.chartSearch.addEventListener("input", function () {
      search = els.chartSearch.value;
      renderGrid();
    });
  }
  els.recsBlue.addEventListener("click", function () {
    recSide = "blue";
    renderRecs();
    renderGrid();
  });
  els.recsRed.addEventListener("click", function () {
    recSide = "red";
    renderRecs();
    renderGrid();
  });

  els.grid.addEventListener("dragover", function (event) {
    if (!drag || drag.source === "pool") return;
    allowDrop(event);
    els.grid.classList.add("drop-hover");
  });
  els.grid.addEventListener("dragleave", function (event) {
    if (!els.grid.contains(event.relatedTarget)) els.grid.classList.remove("drop-hover");
  });
  els.grid.addEventListener("drop", function (event) {
    event.preventDefault();
    els.grid.classList.remove("drop-hover");
    if (drag && drag.source !== "pool") returnToPool(drag.id);
    drag = null;
  });

  document.addEventListener("keydown", function (event) {
    const searchEl =
      chartOpen && chartStage === "play" && els.chartSearch ? els.chartSearch : els.search;
    if (event.key === "/" && document.activeElement !== searchEl) {
      event.preventDefault();
      searchEl.focus();
    }
    if (event.key === "Escape") {
      if (chartOpen && chartStage === "play") {
        if (els.chartSearch) els.chartSearch.value = "";
        search = "";
        renderGrid();
        return;
      }
      els.search.value = "";
      search = "";
      renderGrid();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo();
    }
  });
}

function applyOracles(data) {
  if (!data || !data.matchups) return;
  oracles = data;
  if (!oracles.positions) oracles.positions = {};
  window.RIFT_ORACLES = data;
  rebuildRoleRates();
  rebuildOePop();
}

function loadOracles() {
  applyOracles(window.RIFT_ORACLES);
  if (location.protocol === "file:") return Promise.resolve();
  return fetch("oracles.json", { cache: "no-store" })
    .then(function (res) {
      if (!res.ok) return null;
      return res.json();
    })
    .then(function (data) {
      applyOracles(data);
    })
    .catch(function () {});
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
    if (!data || !data.champions || !data.champions.length) {
      throw new Error("Missing bundled champion data");
    }
    patch = data.patch;
    champions = data.champions;
    champMap = new Map(
      champions.map(function (champ) {
        return [champ.id, champ];
      })
    );
    counters = (window.RIFT_COUNTERS && window.RIFT_COUNTERS.matchups) || {};
    synergies = (window.RIFT_SYNERGIES && window.RIFT_SYNERGIES.synergies) || {};
    winrates = window.RIFT_WINRATES || { lanes: {} };
    if (!winrates.lanes) winrates.lanes = {};
    rebuildChampGames();
    buildTeamIndex();
    if (els.bootStatus) els.bootStatus.textContent = "Loading match data…";
    loadOracles()
      .then(function () {
        bind();
        renderTags();
        renderRecRoles();
        render();
        showApp();
        els.search.focus();
      })
      .catch(function (error) {
        if (els.bootStatus) {
          els.bootStatus.textContent = "Could not start the draft board: " + error.message;
        }
        console.error(error);
      });
  } catch (error) {
    if (els.bootStatus) {
      els.bootStatus.textContent = "Could not start the draft board: " + error.message;
    }
    console.error(error);
  }
}

boot();
