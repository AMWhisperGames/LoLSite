(function () {
  const data = window.HOTS_DATA;
  if (!data) return;

  const ROLES = ["All", "Tank", "Bruiser", "Healer", "Ranged Assassin", "Melee Assassin", "Support"];
  const PICKS = 5;
  const BANS = 3;
  const SAMPLE_PRIOR = 200;
  const BLIND_SCALE = 100;
  const BLIND_FLOOR = 0.5;
  const QUIET_HEROES = { Kerrigan: 75, Probius: 100, "Sgt. Hammer": 75, Rehgar: 50, Samuro: 30, "The Lost Vikings": 80, Alexstrasza: 20 };
  const ANCHOR_BONUS = 30;
  const STEEP_COUNTER = 100;
  const ROLE_TARGETS = { tank: 12, dps: 11.5, healer: 10.5, flex: 13, offlane: 11.5 };
  const ROLE_FLOOR = 0.1;
  const ROLE_EARLY = 2.5;
  const ROLE_LATE = 8;
  const ROLE_MISS = 120;
  const SAME_ROLE_PENALTY = 90;
  const REPEAT_FREE = 3;
  const REPEAT_STEP = 80;
  const DUO_SYNERGY = 0.5;
  const SYLVANAS_MAIEV = 160;
  const DEATHWING_UTHER = 400;
  const ALEX_MEPHISTO = 40;
  const COMFORT_LINE = 5;
  const ROLE_ORDER = ["tank", "healer", "dps", "flex", "offlane"];
  const FULL_ROLES = 31;
  const RACE_TARGET = 14;
  const RACE_UNIT = 6;
  const LINKED = { Cho: "Gall", Gall: "Cho" };
  const DEFAULT_STATS = {
    waveclear: 0.001,
    engage: 0.001,
    peel: 0.001,
    teamSustain: 0.001,
    selfSustain: 0.001,
    anchor: 0,
    race: 0,
  };

  const state = {
    blue: emptySide(),
    red: emptySide(),
    role: "All",
    query: "",
    recSide: "blue",
    selected: null,
    history: [],
    weights: { counter: 0.5, pairing: 2, values: 2, role: 1.4 },
    map: "",
    practice: false,
    human: "blue",
    staged: [],
    recShape: null,
    comfort: { blue: null, red: null },
    comfortMode: { blue: false, red: false },
  };

  const DRAFT = [
    { side: "blue", kind: "bans", count: 1 },
    { side: "red", kind: "bans", count: 1 },
    { side: "blue", kind: "bans", count: 1 },
    { side: "red", kind: "bans", count: 1 },
    { side: "blue", kind: "picks", count: 1 },
    { side: "red", kind: "picks", count: 2 },
    { side: "blue", kind: "picks", count: 2 },
    { side: "red", kind: "bans", count: 1 },
    { side: "blue", kind: "bans", count: 1 },
    { side: "red", kind: "picks", count: 2 },
    { side: "blue", kind: "picks", count: 2 },
    { side: "red", kind: "picks", count: 1 },
  ];
  const PATCH_KICKER = "HotS Draft Practice";
  let botTimer = null;

  const roster = new Map(data.roster.map(function (hero) { return [hero.name, hero]; }));
  let mapMatrix = {};
  let mapAverage = 1;
  let mapNames = [];
  let blindLookup = {};
  let statLookup = {};
  let roleLookup = {};
  let threatKey = "";
  let threatCache = null;
  let duoKey = "";
  let duoCache = null;
  const els = {
    blueBans: document.getElementById("blue-bans"),
    bluePicks: document.getElementById("blue-picks"),
    redBans: document.getElementById("red-bans"),
    redPicks: document.getElementById("red-picks"),
    grid: document.getElementById("grid"),
    search: document.getElementById("search"),
    tags: document.getElementById("tag-filters"),
    recs: document.getElementById("recs"),
    recsLabel: document.getElementById("recs-label"),
    recsList: document.getElementById("recs-list"),
    recsBlue: document.getElementById("recs-blue"),
    recsRed: document.getElementById("recs-red"),
    title: document.getElementById("phase-title"),
    win: document.getElementById("win-readout"),
    splash: document.getElementById("splash"),
    counter: document.getElementById("w-counter"),
    pairing: document.getElementById("w-pairing"),
    values: document.getElementById("w-values"),
    role: document.getElementById("w-role"),
    counterVal: document.getElementById("w-counter-val"),
    pairingVal: document.getElementById("w-pairing-val"),
    valuesVal: document.getElementById("w-values-val"),
    roleVal: document.getElementById("w-role-val"),
    pool: document.querySelector(".pool"),
    maps: document.getElementById("map-select"),
  };

  function emptySide() {
    return { bans: Array(BANS).fill(null), picks: Array(PICKS).fill(null) };
  }

  function snapshot() {
    return JSON.stringify({ blue: state.blue, red: state.red });
  }

  function remember() {
    state.history.push(snapshot());
    if (state.history.length > 40) state.history.shift();
  }

  function taken() {
    const names = new Set();
    ["blue", "red"].forEach(function (side) {
      state[side].bans.forEach(function (name) { if (name) names.add(name); });
      state[side].picks.forEach(function (name) { if (name) names.add(name); });
    });
    return names;
  }

  function otherSide(side) {
    return side === "blue" ? "red" : "blue";
  }

  function lookup(table, hero, other) {
    return table[hero] && table[hero][other];
  }

  function shrink(score, games) {
    const n = games || 0;
    return score * (n / (n + SAMPLE_PRIOR));
  }

  function matchupEdge(hero, enemy) {
    const row = lookup(data.matchups, hero, enemy);
    if (!row) return null;
    const back = lookup(data.matchups, enemy, hero);
    const games = Math.min(row.games || 0, back ? back.games || 0 : 0);
    let score = shrink(row.score, games);
    if (hero === "Sylvanas" && enemy === "Maiev") score += SYLVANAS_MAIEV;
    if (hero === "Maiev" && enemy === "Sylvanas") score -= SYLVANAS_MAIEV;
    return score;
  }

  function pairingEdge(hero, ally) {
    const row = lookup(data.pairings, hero, ally);
    if (!row) return null;
    let score = shrink(row.score, row.games);
    if ((hero === "Deathwing" && ally === "Uther") || (hero === "Uther" && ally === "Deathwing")) {
      score -= DEATHWING_UTHER;
    }
    if ((hero === "Alexstrasza" && ally === "Mephisto") || (hero === "Mephisto" && ally === "Alexstrasza")) {
      score -= ALEX_MEPHISTO;
    }
    return { score: score, games: row.games || 0 };
  }

  function pickCount() {
    return state.blue.picks.filter(Boolean).length + state.red.picks.filter(Boolean).length;
  }

  function canon(name) {
    const folded = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const key = folded.toLowerCase().replace(/[^a-z0-9]/g, "");
    return key === "lcio" ? "lucio" : key;
  }

  function resolveName(raw) {
    if (roster.has(raw)) return raw;
    const key = canon(raw);
    let found = null;
    roster.forEach(function (_hero, name) {
      if (canon(name) === key) found = name;
    });
    return found;
  }

  function heroStats(name) {
    return statLookup[name] || DEFAULT_STATS;
  }

  function blindable(name) {
    const value = blindLookup[name];
    return typeof value === "number" ? value : 0;
  }

  function countsAsBlind(name) {
    return blindable(name) >= BLIND_FLOOR;
  }

  function duoCoversBlinds(names) {
    if (!valuesReady || pickCount() >= 2) return true;
    for (let i = 0; i < names.length; i++) {
      if (!countsAsBlind(names[i])) return false;
    }
    return true;
  }

  function sustainOf(stats) {
    return stats.teamSustain + stats.selfSustain / 4;
  }

  function statWeights(allies) {
    const remain = { engage: 20, peel: 17, waveclear: 25, sustain: 14 };
    allies.forEach(function (name) {
      const stats = heroStats(name);
      remain.engage -= stats.engage;
      remain.peel -= stats.peel;
      remain.waveclear -= stats.waveclear;
      remain.sustain -= sustainOf(stats);
    });
    const vals = [remain.engage, remain.peel, remain.waveclear, remain.sustain];
    const min = Math.min.apply(null, vals);
    const max = Math.max.apply(null, vals);
    const eps = 0.001;
    function weight(value) {
      return ((value - min + eps) / (max - min + eps)) * 1.5 + 0.5;
    }
    return {
      engage: weight(remain.engage),
      peel: weight(remain.peel),
      waveclear: weight(remain.waveclear),
      sustain: weight(remain.sustain),
    };
  }

  function statBoost(name, allies) {
    if (!valuesReady) return 0;
    const weights = statWeights(allies);
    const stats = heroStats(name);
    const statScore = stats.engage * weights.engage
      + stats.peel * weights.peel
      + stats.waveclear * weights.waveclear
      + sustainOf(stats) * weights.sustain;
    const progress = Math.min(pickCount() / 10, 1);
    return statScore * 0.5 * (1 + progress);
  }

  const DEFAULT_ROLES = { tank: 0, dps: 0, healer: 0, flex: 0, offlane: 0 };

  function heroRoles(name, side) {
    const custom = side && state.comfort[side];
    if (custom && Object.prototype.hasOwnProperty.call(custom.roles, name)) return custom.roles[name];
    return roleLookup[name] || DEFAULT_ROLES;
  }

  function hasComfort(name, side) {
    const roles = heroRoles(name, side);
    return roles.tank + roles.dps + roles.healer + roles.flex + roles.offlane > 0;
  }

  let legalKey = "";
  let legalCache = null;

  function comfortMask(name, side) {
    const sheet = state.comfort[side];
    if (!sheet || !Object.prototype.hasOwnProperty.call(sheet.roles, name)) return 0;
    const roles = sheet.roles[name];
    let mask = 0;
    ROLE_ORDER.forEach(function (role, index) {
      if (roles[role] > COMFORT_LINE) mask |= 1 << index;
    });
    return mask;
  }

  function canFillRoles(roleBits, pool) {
    const roles = [];
    for (let i = 0; i < 5; i++) {
      if (roleBits & (1 << i)) roles.push(1 << i);
    }
    if (!roles.length) return true;
    const heroRole = new Array(pool.length).fill(-1);
    function dfs(roleIndex, seen) {
      const bit = roles[roleIndex];
      for (let h = 0; h < pool.length; h++) {
        if (seen[h] || !(pool[h].mask & bit)) continue;
        seen[h] = 1;
        const prev = heroRole[h];
        if (prev === -1 || dfs(prev, seen)) {
          heroRole[h] = roleIndex;
          return true;
        }
      }
      return false;
    }
    for (let r = 0; r < roles.length; r++) {
      if (!dfs(r, new Array(pool.length).fill(0))) return false;
    }
    return true;
  }

  function canWith(required, pool) {
    if (required.length > 5) return false;
    function assign(index, usedBits) {
      if (index === required.length) return canFillRoles(FULL_ROLES ^ usedBits, pool);
      let bits = required[index].mask & ~usedBits;
      while (bits) {
        const bit = bits & -bits;
        if (assign(index + 1, usedBits | bit)) return true;
        bits ^= bit;
      }
      return false;
    }
    return assign(0, 0);
  }

  function pairKey(left, right) {
    return left < right ? left + "|" + right : right + "|" + left;
  }

  function comfortPlan(side) {
    const allies = state[side].picks.filter(Boolean);
    const stamp = state.comfort[side] ? state.comfort[side].stamp : "";
    const key = [side, stamp, allies.join("|"), Array.from(taken()).sort().join("|")].join("~");
    if (key === legalKey && legalCache) return legalCache;
    const heroes = {};
    const pairs = {};
    const fail = { heroes: heroes, pairs: pairs, ok: false };
    const base = [];
    let blocked = false;
    allies.forEach(function (name) {
      const mask = comfortMask(name, side);
      if (!mask) blocked = true;
      base.push({ name: name, mask: mask });
    });
    const required = {};
    allies.forEach(function (name) {
      const partner = linkedPartner(name);
      if (partner && allies.indexOf(partner) === -1 && !taken().has(partner)) required[partner] = true;
    });
    Object.keys(required).forEach(function (name) {
      const mask = comfortMask(name, side);
      if (!mask) blocked = true;
      base.push({ name: name, mask: mask });
    });
    if (blocked || base.length > 5) {
      legalKey = key;
      legalCache = fail;
      return legalCache;
    }
    const pool = [];
    data.roster.forEach(function (hero) {
      if (taken().has(hero.name) || lockedOut(hero.name)) return;
      if (allies.indexOf(hero.name) !== -1 || required[hero.name]) return;
      const mask = comfortMask(hero.name, side);
      if (!mask) return;
      pool.push({ name: hero.name, mask: mask });
    });
    if (!canWith(base, pool)) {
      legalKey = key;
      legalCache = fail;
      return legalCache;
    }
    base.forEach(function (hero) {
      if (allies.indexOf(hero.name) === -1) heroes[hero.name] = true;
    });
    const legal = [];
    pool.forEach(function (hero) {
      const others = pool.filter(function (row) { return row.name !== hero.name; });
      if (!canWith(base.concat([hero]), others)) return;
      heroes[hero.name] = true;
      legal.push(hero);
    });
    if (base.length + 2 <= 5) {
      for (let a = 0; a < legal.length; a++) {
        for (let b = a + 1; b < legal.length; b++) {
          const others = pool.filter(function (row) {
            return row.name !== legal[a].name && row.name !== legal[b].name;
          });
          if (canWith(base.concat([legal[a], legal[b]]), others)) {
            pairs[pairKey(legal[a].name, legal[b].name)] = true;
          }
        }
      }
    }
    const forcedNames = Object.keys(required);
    forcedNames.forEach(function (name) {
      legal.forEach(function (hero) {
        pairs[pairKey(name, hero.name)] = true;
      });
    });
    if (forcedNames.length === 2) pairs[pairKey(forcedNames[0], forcedNames[1])] = true;
    legalKey = key;
    legalCache = { heroes: heroes, pairs: pairs, ok: Object.keys(heroes).length > 0 || base.length === 5 };
    return legalCache;
  }

  function comfortAllows(side, names) {
    if (!state.comfortMode[side] || !state.comfort[side]) return true;
    const plan = comfortPlan(side);
    if (names.length === 1) return !!plan.heroes[names[0]];
    if (names.length === 2) {
      const left = names[0] < names[1] ? names[0] : names[1];
      const right = names[0] < names[1] ? names[1] : names[0];
      return !!plan.pairs[left + "|" + right];
    }
    return true;
  }

  function noteComfortGap(side) {
    if (!state.comfortMode[side] || !state.comfort[side] || els.recsList.children.length) return;
    if (comfortPlan(side).ok) return;
    const note = document.createElement("p");
    note.className = "comfort-note";
    note.textContent = "No set of picks covers every role with comfort above 5.";
    els.recsList.append(note);
  }

  function roleCoverage(allies, side) {
    const cover = { tank: 0, dps: 0, healer: 0, flex: 0, offlane: 0 };
    allies.forEach(function (ally) {
      const roles = heroRoles(ally, side);
      cover.tank += roles.tank;
      cover.dps += roles.dps;
      cover.healer += roles.healer;
      cover.flex += roles.flex;
      cover.offlane += roles.offlane;
    });
    return cover;
  }

  function roleWeights(allies, side) {
    const cover = roleCoverage(allies, side);
    const remain = {
      tank: ROLE_TARGETS.tank - cover.tank,
      dps: ROLE_TARGETS.dps - cover.dps,
      healer: ROLE_TARGETS.healer - cover.healer,
      flex: ROLE_TARGETS.flex - cover.flex,
      offlane: ROLE_TARGETS.offlane - cover.offlane,
    };
    const vals = [remain.tank, remain.dps, remain.healer, remain.flex, remain.offlane];
    const min = Math.min.apply(null, vals);
    const max = Math.max.apply(null, vals);
    const eps = 0.001;
    function weight(value) {
      return ((value - min + eps) / (max - min + eps)) * (1 - ROLE_FLOOR) + ROLE_FLOOR;
    }
    return {
      tank: weight(remain.tank),
      dps: weight(remain.dps),
      healer: weight(remain.healer),
      flex: weight(remain.flex),
      offlane: weight(remain.offlane),
    };
  }

  function roleBoost(name, allies, side) {
    if (!valuesReady) return 0;
    const weights = roleWeights(allies, side);
    const roles = heroRoles(name, side);
    const roleScore = roles.tank * weights.tank
      + roles.dps * weights.dps
      + roles.healer * weights.healer
      + roles.flex * weights.flex
      + roles.offlane * weights.offlane;
    const progress = Math.min(allies.length / 4, 1);
    const scale = ROLE_EARLY + (ROLE_LATE - ROLE_EARLY) * progress;
    const cover = roleCoverage(allies, side);
    const slotsLeft = Math.max(0, 5 - allies.length);
    const holes = [];
    if (cover.tank < 7) holes.push("tank");
    if (cover.healer < 5) holes.push("healer");
    if (cover.offlane < 5) holes.push("offlane");
    if (cover.dps + cover.flex < 8) holes.push("damage");
    let urgency = 0;
    if (slotsLeft > 0 && slotsLeft <= holes.length) {
      const fills = holes.filter(function (hole) {
        if (hole === "tank") return roles.tank >= 4;
        if (hole === "healer") return roles.healer >= 4;
        if (hole === "offlane") return roles.offlane >= 4;
        return roles.dps + roles.flex >= 4;
      }).length;
      if (fills === 0) urgency = -ROLE_MISS * (0.35 + 0.65 * progress);
    }
    return (roleScore * scale + urgency) * state.weights.role;
  }

  function anchorBoost(name, allies) {
    if (!valuesReady || state.map !== "Dragon Shire") return 0;
    const count = allies.filter(function (ally) { return heroStats(ally).anchor === 1; }).length;
    if (count >= 1.5) return 0;
    return heroStats(name).anchor === 1 ? ANCHOR_BONUS : 0;
  }

  function raceBoost(name, allies) {
    if (!valuesReady || state.map !== "Battlefield of Eternity") return 0;
    let have = 0;
    allies.forEach(function (ally) { have += heroStats(ally).race || 0; });
    const gap = RACE_TARGET - have;
    if (gap <= 0) return 0;
    return (heroStats(name).race || 0) * (gap / RACE_TARGET) * RACE_UNIT * state.weights.values;
  }

  function linkedPartner(name) {
    return LINKED[name] || null;
  }

  function lockedOut(name) {
    const partner = linkedPartner(name);
    if (!partner || taken().has(name)) return false;
    return taken().has(partner);
  }

  function poolThreat(name, ignore) {
    const key = Array.from(taken()).sort().join("|");
    if (key !== threatKey || !threatCache) {
      threatKey = key;
      threatCache = {};
      data.roster.forEach(function (hero) {
        const threats = [];
        data.roster.forEach(function (other) {
          if (other.name === hero.name || taken().has(other.name) || lockedOut(other.name)) return;
          const edge = matchupEdge(other.name, hero.name);
          if (edge == null) return;
          threats.push({ name: other.name, score: edge });
        });
        threats.sort(function (a, b) { return b.score - a.score; });
        threatCache[hero.name] = threats.slice(0, 4);
      });
    }
    const skip = {};
    (ignore || []).forEach(function (hero) { skip[hero] = true; });
    skip[name] = true;
    const partner = linkedPartner(name);
    if (partner) skip[partner] = true;
    const best = (threatCache[name] || []).filter(function (row) { return !skip[row.name]; })[0];
    if (!best || best.score <= STEEP_COUNTER) return { penalty: 0, name: "", score: best ? best.score : 0 };
    return { penalty: best.score - STEEP_COUNTER, name: best.name, score: best.score };
  }

  function mapValue(name) {
    if (!state.map) return null;
    const row = mapMatrix[name];
    const value = row && row[state.map];
    return typeof value === "number" ? value : mapAverage;
  }

  function mapFactor(name) {
    if (!state.map) return 1;
    return mapValue(name) / mapAverage;
  }

  function scoreHero(name, side, extraAllies) {
    const allies = state[side].picks.filter(function (pick) { return pick && pick !== name; });
    (extraAllies || []).forEach(function (ally) {
      if (ally && ally !== name && allies.indexOf(ally) === -1) allies.push(ally);
    });
    const enemies = state[otherSide(side)].picks.filter(Boolean);
    let counter = 0;
    let pairing = 0;
    let counterGames = 0;
    let pairingGames = 0;
    enemies.forEach(function (enemy) {
      const edge = matchupEdge(name, enemy);
      if (edge == null) return;
      counter += edge;
      const row = lookup(data.matchups, name, enemy);
      const back = lookup(data.matchups, enemy, name);
      counterGames += Math.min(row.games || 0, back ? back.games || 0 : 0);
    });
    allies.forEach(function (ally) {
      const edge = pairingEdge(name, ally);
      if (!edge) return;
      pairing += edge.score;
      pairingGames += edge.games;
    });
    const hasContext = enemies.length || allies.length;
    const factor = mapFactor(name);
    const base = state.weights.counter * counter + state.weights.pairing * pairing;
    const stats = statBoost(name, allies) * state.weights.values - (QUIET_HEROES[name] || 0);
    const role = roleBoost(name, allies, side);
    const blind = valuesReady && pickCount() < 2 && countsAsBlind(name) ? blindable(name) * BLIND_SCALE : 0;
    const anchor = anchorBoost(name, allies);
    const race = raceBoost(name, allies);
    const threat = poolThreat(name, allies);
    const threatPenalty = threat.penalty * state.weights.counter;
    const draft = base + stats + role + blind + anchor + race - threatPenalty;
    if (!hasContext && !state.map && draft === 0 && !threatPenalty) return null;
    const matchup = hasContext ? base * factor : 0;
    const total = state.map ? (draft === 0 && !threatPenalty ? factor : draft * factor) : draft;
    return {
      total: total,
      matchup: matchup,
      counter: counter,
      pairing: pairing,
      stats: stats,
      role: role,
      blind: blind,
      anchor: anchor,
      race: race,
      threat: threatPenalty,
      threatName: threat.name,
      map: factor,
      hasContext: hasContext,
      games: counterGames + pairingGames,
    };
  }

  function recommendations() {
    const used = taken();
    const query = state.query.trim().toLowerCase();
    const ranked = [];
    data.roster.forEach(function (hero) {
      if (used.has(hero.name) || lockedOut(hero.name)) return;
      if (!hasComfort(hero.name, state.recSide)) return;
      if (!comfortAllows(state.recSide, [hero.name])) return;
      if (linkedPartner(hero.name)) return;
      if (state.role !== "All" && hero.role !== state.role) return;
      if (query && hero.name.toLowerCase().indexOf(query) === -1) return;
      if (state.practice) {
        const cursor = draftCursor();
        if (!cursor.step || cursor.step.side !== state.human || cursor.step.kind !== "picks") return;
        if (cursor.step.count === 2 && cursor.filled === 0 && state.staged.length === 0) return;
        const already = state.staged.length ? state.staged : heroesThisTurn(cursor);
        if (already.indexOf(hero.name) !== -1) return;
      }
      const score = scoreHero(hero.name, state.recSide);
      if (!score) return;
      ranked.push({ hero: hero, score: score });
    });
    ranked.sort(function (a, b) { return b.score.total - a.score.total; });
    return ranked;
  }

  function teamScore(side) {
    let total = 0;
    let counted = 0;
    state[side].picks.filter(Boolean).forEach(function (name) {
      const score = scoreHero(name, side);
      if (!score || !score.hasContext) return;
      total += score.matchup;
      counted += 1;
    });
    return counted ? total : null;
  }

  function formatScore(value) {
    const rounded = Math.round(value);
    return (rounded > 0 ? "+" : "") + rounded;
  }

  function portrait(hero, className) {
    const opener = pickCount() < 2 && countsAsBlind(hero.name);
    const classes = [className, opener ? "is-blind" : ""].filter(Boolean).join(" ");
    if (hero.icon) {
      const img = document.createElement("img");
      img.src = hero.icon;
      img.alt = hero.name;
      img.draggable = false;
      if (classes) img.className = classes;
      return img;
    }
    const fallback = document.createElement("span");
    fallback.className = (classes + " fallback").trim();
    fallback.textContent = hero.name.slice(0, 1);
    return fallback;
  }

  function renderSlots(root, side, kind) {
    root.innerHTML = "";
    state[side][kind].forEach(function (name, index) {
      const slot = document.createElement("div");
      slot.className = kind === "bans" ? "ban" : "pick";
      const key = side + ":" + kind + ":" + index;
      if (state.practice && activeTurnSlots(side, kind).indexOf(index) !== -1) slot.classList.add("turn");
      if (state.selected === key) slot.classList.add("selected");
      const staged = stagedAt(side, kind, index);
      const shown = name || staged;
      if (shown) {
        const hero = roster.get(shown);
        if (name) slot.draggable = true;
        if (staged) slot.classList.add("staged");
        const art = portrait(hero, kind === "picks" ? "pick-art" : "");
        slot.append(art);
        if (kind === "picks") {
          const meta = document.createElement("div");
          meta.className = "pick-meta";
          const label = document.createElement("span");
          label.className = "pick-name";
          label.textContent = hero.name;
          meta.append(label);
          slot.append(meta);
        }
        if (name) {
          slot.addEventListener("dragstart", function (event) {
            event.dataTransfer.setData("text/plain", JSON.stringify({ name: name, from: key }));
            slot.classList.add("is-dragging");
          });
          slot.addEventListener("dragend", function () { slot.classList.remove("is-dragging"); });
        }
      }
      slot.addEventListener("dragover", function (event) {
        event.preventDefault();
        slot.classList.add("drop-hover");
      });
      slot.addEventListener("dragleave", function () { slot.classList.remove("drop-hover"); });
      slot.addEventListener("drop", function (event) {
        event.preventDefault();
        slot.classList.remove("drop-hover");
        const raw = event.dataTransfer.getData("text/plain");
        if (!raw) return;
        const payload = JSON.parse(raw);
        if (state.practice) {
          if (!payload.from) practiceAdd(payload.name);
          return;
        }
        place(payload.name, side, kind, index, payload.from);
      });
      slot.addEventListener("click", function () {
        if (state.practice) {
          if (staged) {
            state.staged = state.staged.filter(function (hero) { return hero !== staged; });
            render();
          }
          return;
        }
        if (name) {
          remember();
          const partner = kind === "picks" ? linkedPartner(name) : null;
          state[side][kind][index] = null;
          if (partner) {
            ["blue", "red"].forEach(function (team) {
              state[team].picks = state[team].picks.map(function (current) {
                return current === partner ? null : current;
              });
            });
          }
          state.selected = null;
          render();
          return;
        }
        state.selected = state.selected === key ? null : key;
        state.recSide = side;
        render();
      });
      root.append(slot);
    });
  }

  function placePair(a, b, side) {
    if (lockedOut(a) || lockedOut(b) || taken().has(a) || taken().has(b)) return;
    let room = 0;
    state[side].picks.forEach(function (current) {
      if (!current || current === a || current === b) room += 1;
    });
    if (room < 2) return;
    remember();
    ["blue", "red"].forEach(function (team) {
      ["bans", "picks"].forEach(function (slotKind) {
        state[team][slotKind] = state[team][slotKind].map(function (current) {
          return current === a || current === b ? null : current;
        });
      });
    });
    const opens = [];
    state[side].picks.forEach(function (current, index) {
      if (!current) opens.push(index);
    });
    state[side].picks[opens[0]] = a;
    state[side].picks[opens[1]] = b;
    state.selected = null;
    state.recSide = side;
    render();
  }

  function placeTwo(a, b, side) {
    if (linkedPartner(a) === b) {
      placePair(a, b, side);
      return;
    }
    if (linkedPartner(a) || linkedPartner(b)) return;
    if (taken().has(a) || taken().has(b) || lockedOut(a) || lockedOut(b)) return;
    let room = 0;
    state[side].picks.forEach(function (current) {
      if (!current || current === a || current === b) room += 1;
    });
    if (room < 2) return;
    remember();
    ["blue", "red"].forEach(function (team) {
      ["bans", "picks"].forEach(function (slotKind) {
        state[team][slotKind] = state[team][slotKind].map(function (current) {
          return current === a || current === b ? null : current;
        });
      });
    });
    const ordered = orderForBlind([a, b]);
    const opens = [];
    state[side].picks.forEach(function (current, index) {
      if (!current) opens.push(index);
    });
    state[side].picks[opens[0]] = ordered[0];
    state[side].picks[opens[1]] = ordered[1];
    state.selected = null;
    state.recSide = side;
    render();
  }

  function place(name, side, kind, index, from) {
    if (lockedOut(name)) return;
    if (linkedPartner(name) && kind === "picks") {
      placePair(name, linkedPartner(name), side);
      return;
    }
    remember();
    if (from) {
      const parts = from.split(":");
      if (state[parts[0]][parts[1]][Number(parts[2])] === name) {
        state[parts[0]][parts[1]][Number(parts[2])] = null;
      }
    }
    ["blue", "red"].forEach(function (team) {
      ["bans", "picks"].forEach(function (slotKind) {
        state[team][slotKind] = state[team][slotKind].map(function (current) {
          return current === name ? null : current;
        });
      });
    });
    state[side][kind][index] = name;
    state.selected = null;
    state.recSide = side;
    render();
  }

  function renderTags() {
    els.tags.innerHTML = "";
    ROLES.forEach(function (role) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = role === "Ranged Assassin" ? "Ranged" : role === "Melee Assassin" ? "Melee" : role;
      button.className = role === state.role ? "active" : "";
      button.addEventListener("click", function () {
        state.role = role;
        render();
      });
      els.tags.append(button);
    });
  }

  function renderGrid() {
    const used = taken();
    const query = state.query.trim().toLowerCase();
    const suggested = new Set();
    if (recShape() === "duo" && !state.practice) {
      duoRecommendations(state.recSide, null, true).slice(0, 8).forEach(function (row) {
        row.names.forEach(function (name) { suggested.add(name); });
      });
    } else if (recShape() === "duo" && state.practice) {
      const cursor = draftCursor();
      const side = cursor.step ? cursor.step.side : state.human;
      duoRecommendations(side).slice(0, 8).forEach(function (row) {
        row.names.forEach(function (name) { suggested.add(name); });
      });
    } else {
      recommendations().slice(0, 8).forEach(function (row) { suggested.add(row.hero.name); });
    }
    els.grid.innerHTML = "";
    data.roster.forEach(function (hero) {
      if (state.role !== "All" && hero.role !== state.role) return;
      if (query && hero.name.toLowerCase().indexOf(query) === -1) return;
      const card = document.createElement("div");
      const locked = blockReason(hero.name);
      const held = state.staged.indexOf(hero.name) !== -1;
      const out = lockedOut(hero.name);
      card.className = "champ" + (locked === "blind" || locked === "linked" ? " blind-locked" : "");
      card.draggable = !used.has(hero.name) && !held && !out && locked !== "bot" && locked !== "done";
      if (used.has(hero.name) || held || out || locked === "bot" || locked === "done") card.classList.add("disabled");
      if (suggested.has(hero.name)) card.classList.add("suggested");
      if (out) card.title = "Requires " + linkedPartner(hero.name);
      else if (locked === "linked") card.title = "Cho and Gall pick together";
      else if (locked === "bot") card.title = "Bot turn";
      else card.title = (pickCount() < 2 && countsAsBlind(hero.name) ? "Opener · " : "") + hero.role;
      card.append(portrait(hero), labelFor(hero.name));
      if (!used.has(hero.name) && locked !== "bot" && locked !== "done") {
        card.addEventListener("dragstart", function (event) {
          event.dataTransfer.setData("text/plain", JSON.stringify({ name: hero.name }));
        });
        card.addEventListener("click", function () {
          if (!held && !out && !blockReason(hero.name)) quickPlace(hero.name);
        });
      }
      card.addEventListener("mouseenter", function () {
        if (!hero.icon) return;
        els.splash.style.backgroundImage = 'url("' + hero.icon + '")';
        els.splash.classList.add("on");
      });
      card.addEventListener("mouseleave", function () { els.splash.classList.remove("on"); });
      els.grid.append(card);
    });
  }

  function labelFor(name) {
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = name;
    return label;
  }

  function quickPlace(name) {
    if (state.practice) {
      practiceAdd(name);
      return;
    }
    if (state.selected) {
      const parts = state.selected.split(":");
      place(name, parts[0], parts[1], Number(parts[2]));
      return;
    }
    const picks = state[state.recSide].picks;
    const open = picks.findIndex(function (pick) { return !pick; });
    if (open === -1) return;
    place(name, state.recSide, "picks", open);
  }

  function renderRecs() {
    const allies = state[state.recSide].picks.filter(Boolean);
    const enemies = state[otherSide(state.recSide)].picks.filter(Boolean);
    els.recsBlue.classList.toggle("active", state.recSide === "blue");
    els.recsRed.classList.toggle("active", state.recSide === "red");
    if (!allies.length && !enemies.length && !state.map && !valuesReady) {
      els.recs.hidden = true;
      els.title.textContent = "Drop a hero on any slot";
      return;
    }
    els.recs.hidden = false;
    const sideName = state.recSide === "blue" ? "Blue" : "Red";
    const early = pickCount() < 2;
    els.title.textContent = "Suggestions for " + sideName;
    if (allies.length && enemies.length) els.recsLabel.textContent = "Best with " + sideName + " into the other side";
    else if (enemies.length) els.recsLabel.textContent = "Best into the other side";
    else if (allies.length) els.recsLabel.textContent = "Best with " + sideName;
    else if (early) els.recsLabel.textContent = "Opening picks";
    else if (state.map) els.recsLabel.textContent = "Best on " + state.map;
    else els.recsLabel.textContent = "Best with " + sideName;
    els.recsList.innerHTML = "";
    if (recShape() === "duo") {
      els.recsLabel.textContent = "Best pairs for " + sideName;
      const open = state[state.recSide].picks.filter(function (pick) { return !pick; }).length;
      shownRecs(duoRecommendations(state.recSide, null, true), 8).forEach(function (row) {
        const ordered = orderForBlind(row.names);
        const card = document.createElement("div");
        card.className = "rec-card pair";
        card.title = pairTitle(ordered, row.total);
        const meta = document.createElement("div");
        meta.className = "rec-meta";
        const name = document.createElement("strong");
        name.textContent = ordered.join(" + ");
        const delta = document.createElement("span");
        delta.className = row.total >= 0 ? "up" : "down";
        delta.textContent = formatScore(row.total);
        meta.append(name, delta);
        ordered.forEach(function (heroName) {
          const art = portrait(roster.get(heroName));
          if (pickCount() < 2 && countsAsBlind(heroName)) art.classList.add("is-blind");
          card.append(art);
        });
        card.append(meta);
        card.addEventListener("click", function () {
          if (open >= 2) placeTwo(ordered[0], ordered[1], state.recSide);
        });
        els.recsList.append(card);
      });
      noteComfortGap(state.recSide);
      return;
    }
    const ranked = recommendations().slice(0, 8);
    const pairLegal = !taken().has("Cho") && !taken().has("Gall") && !lockedOut("Cho") && !blockReason("Cho") && hasComfort("Cho", state.recSide) && hasComfort("Gall", state.recSide);
    const linkedTotal = pairLegal ? pairTotal("Cho", "Gall", state.recSide) : null;
    let linkedShown = false;
    function appendLinked() {
      const card = document.createElement("div");
      card.className = "rec-card pair";
      card.title = "Cho + Gall " + formatScore(linkedTotal);
      const meta = document.createElement("div");
      meta.className = "rec-meta";
      const name = document.createElement("strong");
      name.textContent = "Cho + Gall";
      const delta = document.createElement("span");
      delta.className = linkedTotal >= 0 ? "up" : "down";
      delta.textContent = formatScore(linkedTotal);
      const sample = document.createElement("em");
      sample.textContent = "Locked pair";
      meta.append(name, delta, sample);
      card.append(portrait(roster.get("Cho")), meta);
      card.addEventListener("click", function () { placePair("Cho", "Gall", state.recSide); });
      els.recsList.append(card);
    }
    ranked.forEach(function (row) {
      if (linkedTotal != null && !linkedShown && linkedTotal >= row.score.total) {
        appendLinked();
        linkedShown = true;
      }
      const card = document.createElement("div");
      card.className = "rec-card";
      card.draggable = true;
      const bits = [
        "Counter " + formatScore(row.score.counter),
        "Pairing " + formatScore(row.score.pairing),
        "Values " + formatScore(row.score.stats),
        "Comfort " + formatScore(row.score.role),
      ];
      if (row.score.blind) bits.push("Blind " + formatScore(row.score.blind));
      if (row.score.race) bits.push("Race " + formatScore(row.score.race));
      if (row.score.threat) bits.push("Open " + row.score.threatName + " " + formatScore(-row.score.threat));
      bits.push("Map " + row.score.map.toFixed(2) + "×");
      card.title = bits.join(" · ");
      const meta = document.createElement("div");
      meta.className = "rec-meta";
      const name = document.createElement("strong");
      name.textContent = row.hero.name;
      const delta = document.createElement("span");
      delta.className = row.score.total >= 0 ? "up" : "down";
      delta.textContent = formatScore(row.score.total);
      const sample = document.createElement("em");
      sample.textContent = row.hero.role;
      meta.append(name, delta, sample);
      card.append(portrait(row.hero), meta);
      card.addEventListener("dragstart", function (event) {
        event.dataTransfer.setData("text/plain", JSON.stringify({ name: row.hero.name }));
      });
      card.addEventListener("click", function () { quickPlace(row.hero.name); });
      els.recsList.append(card);
    });
    if (linkedTotal != null && !linkedShown && ranked.length < 8) appendLinked();
    noteComfortGap(state.recSide);
  }

  function renderWin() {
    const blue = teamScore("blue");
    const red = teamScore("red");
    if (blue == null || red == null) {
      els.win.textContent = "Add picks on both sides for a win estimate";
      els.win.className = "game-label";
      return;
    }
    const diff = (blue - red) / 5;
    const blueWin = 1 / (1 + Math.exp(-diff / 400));
    els.win.textContent = "Blue " + Math.round(blueWin * 100) + "% · Red " + Math.round((1 - blueWin) * 100) + "%";
    els.win.className = "game-label " + (blueWin >= 0.5 ? "win-positive" : "win-negative");
  }

  function fillMaps() {
    const current = state.map;
    els.maps.innerHTML = "";
    const any = document.createElement("option");
    any.value = "";
    any.textContent = "Any map";
    els.maps.append(any);
    mapNames.forEach(function (map) {
      const option = document.createElement("option");
      option.value = map;
      option.textContent = map;
      els.maps.append(option);
    });
    els.maps.value = current;
  }

  function release(name) {
    if (!taken().has(name)) return;
    const partner = linkedPartner(name);
    let inPicks = false;
    ["blue", "red"].forEach(function (side) {
      if (state[side].picks.indexOf(name) !== -1) inPicks = true;
    });
    remember();
    ["blue", "red"].forEach(function (side) {
      ["bans", "picks"].forEach(function (kind) {
        state[side][kind] = state[side][kind].map(function (current) {
          return current === name ? null : current;
        });
      });
    });
    if (inPicks && partner) {
      ["blue", "red"].forEach(function (side) {
        state[side].picks = state[side].picks.map(function (current) {
          return current === partner ? null : current;
        });
      });
    }
    state.selected = null;
    render();
  }

  function draftCursor() {
    const have = {
      blue: {
        bans: state.blue.bans.filter(Boolean).length,
        picks: state.blue.picks.filter(Boolean).length,
      },
      red: {
        bans: state.red.bans.filter(Boolean).length,
        picks: state.red.picks.filter(Boolean).length,
      },
    };
    const used = { blue: { bans: 0, picks: 0 }, red: { bans: 0, picks: 0 } };
    for (let i = 0; i < DRAFT.length; i++) {
      const step = DRAFT[i];
      const got = have[step.side][step.kind] - used[step.side][step.kind];
      if (got < step.count) return { index: i, step: step, filled: Math.max(0, got) };
      used[step.side][step.kind] += step.count;
    }
    return { index: DRAFT.length, step: null, filled: 0 };
  }

  function stagedAt(side, kind, index) {
    if (!state.staged.length) return null;
    const slots = activeTurnSlots(side, kind);
    const pos = slots.indexOf(index);
    if (pos < 0 || pos >= state.staged.length) return null;
    return state.staged[pos];
  }

  function heroesThisTurn(cursor) {
    if (!cursor.step || cursor.filled <= 0) return [];
    const filled = state[cursor.step.side][cursor.step.kind].filter(Boolean);
    return filled.slice(filled.length - cursor.filled);
  }

  function activeTurnSlots(side, kind) {
    if (!state.practice) return [];
    const cursor = draftCursor();
    if (!cursor.step || cursor.step.side !== side || cursor.step.kind !== kind) return [];
    const open = [];
    state[side][kind].forEach(function (name, index) {
      if (!name) open.push(index);
    });
    return open.slice(0, cursor.step.count - cursor.filled);
  }

  function canAddDuringTurn(name, step, already) {
    const projected = already.concat([name]);
    const remaining = step.count - projected.length;
    if (!valuesReady || step.kind !== "picks") return true;
    if (pickCount() < 2 && step.count >= 2 && !duoCoversBlinds(projected)) return false;
    const needed = Math.max(0, 2 - pickCount());
    const blind = projected.filter(function (hero) { return countsAsBlind(hero); }).length;
    return blind + remaining >= Math.min(needed, projected.length + remaining);
  }

  function blockReason(name) {
    if (taken().has(name)) return "";
    if (lockedOut(name)) return "linked";
    const partner = linkedPartner(name);
    if (!state.practice) {
      if (state.selected && state.selected.split(":")[1] === "bans") return "";
      if (partner && state[state.recSide].picks.filter(function (pick) { return !pick; }).length < 2) return "linked";
      return "";
    }
    const cursor = draftCursor();
    if (!cursor.step) return "done";
    if (cursor.step.side !== state.human) return "bot";
    if (cursor.step.kind === "bans") return "";
    if (partner) {
      if (cursor.step.count < 2 || state.staged.length) return "linked";
      return "";
    }
    return "";
  }

  function commitNames(names, side, kind) {
    remember();
    names.forEach(function (name) {
      ["blue", "red"].forEach(function (team) {
        ["bans", "picks"].forEach(function (slotKind) {
          state[team][slotKind] = state[team][slotKind].map(function (current) {
            return current === name ? null : current;
          });
        });
      });
      const index = state[side][kind].findIndex(function (current) { return !current; });
      if (index !== -1) state[side][kind][index] = name;
    });
    state.selected = null;
    state.recSide = side;
  }

  function practiceAdd(name) {
    const cursor = draftCursor();
    if (!cursor.step || cursor.step.side !== state.human || taken().has(name)) return;
    const step = cursor.step;
    if (step.kind === "picks" && step.count === 2 && linkedPartner(name)) {
      const partner = linkedPartner(name);
      if (state.staged.length || taken().has(partner) || lockedOut(partner)) return;
      state.staged = [];
      commitNames(orderForBlind([name, partner]), step.side, step.kind);
      render();
      return;
    }
    if (step.kind === "picks" && linkedPartner(name)) return;
    if (step.kind === "picks" && step.count === 2) {
      if (state.staged.indexOf(name) !== -1) return;
      if (state.staged.length + 1 < step.count) {
        state.staged = state.staged.concat([name]);
        render();
        return;
      }
      const names = orderForBlind(state.staged.concat([name]));
      state.staged = [];
      commitNames(names, step.side, step.kind);
      render();
      return;
    }
    state.staged = [];
    commitNames([name], step.side, step.kind);
    render();
  }

  function undoCurrentTurn(name) {
    const cursor = draftCursor();
    if (!cursor.step || heroesThisTurn(cursor).indexOf(name) === -1) return;
    remember();
    const drop = {};
    drop[name] = true;
    if (cursor.step.kind === "picks" && linkedPartner(name)) drop[linkedPartner(name)] = true;
    const kept = state[cursor.step.side][cursor.step.kind].filter(function (current) {
      return current && !drop[current];
    });
    const size = state[cursor.step.side][cursor.step.kind].length;
    while (kept.length < size) kept.push(null);
    state[cursor.step.side][cursor.step.kind] = kept;
    render();
  }

  function scoreWithoutBlind(score) {
    if (!score) return 0;
    const factor = state.map ? score.map : 1;
    return score.total - score.blind * factor;
  }

  function pairTotal(a, b, side) {
    const left = scoreHero(a, side, [b]);
    const right = scoreHero(b, side, [a]);
    const together = scoreWithoutBlind(left) + scoreWithoutBlind(right);
    const individuals = scoreWithoutBlind(scoreHero(a, side)) + scoreWithoutBlind(scoreHero(b, side));
    let total = individuals + DUO_SYNERGY * (together - individuals);
    if (valuesReady && pickCount() < 2) {
      const needed = Math.max(0, 2 - pickCount());
      const options = [
        { blind: blindable(a), factor: left ? left.map : 1 },
        { blind: blindable(b), factor: right ? right.map : 1 },
      ].filter(function (row) { return row.blind >= BLIND_FLOOR; });
      options.sort(function (x, y) { return y.blind - x.blind; });
      options.slice(0, needed).forEach(function (row) {
        total += row.blind * BLIND_SCALE * (state.map ? row.factor : 1);
      });
    }
    return total - sameRolePenalty(a, b);
  }

  function sameRolePenalty(a, b) {
    const left = roster.get(a);
    const right = roster.get(b);
    if (!left || !right || left.role !== right.role) return 0;
    return SAME_ROLE_PENALTY * state.weights.role;
  }

  function repeatPenalty(shown) {
    if (shown < REPEAT_FREE) return 0;
    return REPEAT_STEP * (shown - REPEAT_FREE + 1);
  }

  function diversifyPairs(ranked, limit) {
    const pool = ranked.slice();
    const shown = [];
    const counts = {};
    while (shown.length < limit && pool.length) {
      let bestIndex = 0;
      let bestScore = -Infinity;
      for (let i = 0; i < pool.length; i++) {
        let penalty = 0;
        pool[i].names.forEach(function (name) {
          penalty += repeatPenalty(counts[name] || 0);
        });
        const score = pool[i].total - penalty;
        if (score > bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      }
      const pick = pool.splice(bestIndex, 1)[0];
      shown.push(pick);
      pick.names.forEach(function (name) {
        counts[name] = (counts[name] || 0) + 1;
      });
    }
    return shown;
  }

  function shownRecs(ranked, limit) {
    if (!ranked.length || ranked[0].names.length < 2) return ranked.slice(0, limit);
    return diversifyPairs(ranked, limit);
  }

  function pairTitle(names, total) {
    const bits = [names.join(" + ") + " " + formatScore(total)];
    if (names.length === 2) {
      const penalty = sameRolePenalty(names[0], names[1]);
      if (penalty) bits.push("Same role " + formatScore(-penalty));
    }
    return bits.join(" · ");
  }

  function orderForBlind(names) {
    if (!valuesReady || pickCount() >= 2) return names.slice();
    return names.slice().sort(function (a, b) {
      const left = countsAsBlind(a) ? blindable(a) : 0;
      const right = countsAsBlind(b) ? blindable(b) : 0;
      return right - left;
    });
  }

  function recShape() {
    if (state.practice) {
      const cursor = draftCursor();
      if (cursor.step && cursor.step.kind === "bans") return "single";
    }
    return state.recShape === "duo" ? "duo" : "single";
  }

  function syncRecShape() {
    const shape = recShape();
    const single = document.getElementById("recs-single");
    const duo = document.getElementById("recs-duo");
    if (!single || !duo) return;
    single.classList.toggle("active", shape === "single");
    duo.classList.toggle("active", shape === "duo");
  }

  function duoRecommendations(side, step, filterUi, blindOnly) {
    const key = [
      side,
      step ? step.kind + step.count : "",
      state.map,
      filterUi ? state.role : "",
      filterUi ? state.query : "",
      state.weights.counter,
      state.weights.pairing,
      state.weights.values,
      state.weights.role,
      state.comfort[side] ? state.comfort[side].stamp : "base",
      state.comfortMode[side] ? "comfort" : "",
      blindOnly ? "blind" : "",
      pickCount(),
      Array.from(taken()).sort().join("|"),
    ].join("~");
    if (key === duoKey && duoCache) return duoCache;
    const query = state.query.trim().toLowerCase();
    const names = data.roster.map(function (hero) { return hero.name; }).filter(function (name) {
      return !taken().has(name) && !lockedOut(name);
    });
    const ranked = [];
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const pair = [names[i], names[j]];
        if (!hasComfort(pair[0], side) || !hasComfort(pair[1], side)) continue;
        if (!comfortAllows(side, pair)) continue;
        if (linkedPartner(pair[0]) && linkedPartner(pair[0]) !== pair[1]) continue;
        if (linkedPartner(pair[1]) && linkedPartner(pair[1]) !== pair[0]) continue;
        if (filterUi && query) {
          const hit = pair[0].toLowerCase().indexOf(query) !== -1 || pair[1].toLowerCase().indexOf(query) !== -1;
          if (!hit) continue;
        }
        if (filterUi && state.role !== "All") {
          const left = roster.get(pair[0]);
          const right = roster.get(pair[1]);
          if ((!left || left.role !== state.role) && (!right || right.role !== state.role)) continue;
        }
        if (blindOnly && valuesReady && pickCount() < 2 && !duoCoversBlinds(pair)) continue;
        if (blindOnly && step && step.count >= 2 && !canAddDuringTurn(pair[1], step, [pair[0]])) continue;
        ranked.push({ names: pair, total: pairTotal(pair[0], pair[1], side) });
      }
    }
    ranked.sort(function (a, b) { return b.total - a.total; });
    duoKey = key;
    duoCache = ranked;
    return ranked;
  }

  function rankedChoices(cursor, shape, blindOnly) {
    const step = cursor.step;
    const names = data.roster.map(function (hero) { return hero.name; }).filter(function (name) {
      return !taken().has(name) && !lockedOut(name);
    });
    const ranked = [];
    if (step.kind === "bans") {
      const enemy = otherSide(step.side);
      names.forEach(function (name) {
        if (!hasComfort(name, enemy)) return;
        const score = scoreHero(name, enemy);
        ranked.push({ names: [name], total: score ? score.total : 0 });
      });
    } else if (step.count === 2 && state.staged.length === 1) {
      const held = state.staged[0];
      names.forEach(function (name) {
        if (name === held || !hasComfort(name, step.side) || !comfortAllows(step.side, [held, name])) return;
        if (blindOnly && !canAddDuringTurn(name, step, state.staged)) return;
        if (linkedPartner(held) && name !== linkedPartner(held)) return;
        if (linkedPartner(name) && linkedPartner(name) !== held) return;
        ranked.push({ names: [name], total: pairTotal(held, name, step.side) });
      });
    } else if (shape === "duo" || (shape !== "single" && step.count === 2 && state.staged.length === 0 && cursor.filled === 0)) {
      duoRecommendations(step.side, step, false, blindOnly).forEach(function (row) { ranked.push(row); });
    } else {
      const already = heroesThisTurn(cursor);
      names.forEach(function (name) {
        if (linkedPartner(name)) return;
        if (!hasComfort(name, step.side)) return;
        if (!comfortAllows(step.side, [name])) return;
        if (blindOnly && !canAddDuringTurn(name, step, already)) return;
        const extra = already.slice();
        const score = scoreHero(name, step.side, extra);
        ranked.push({ names: [name], total: score ? score.total : 0 });
      });
    }
    ranked.sort(function (a, b) { return b.total - a.total; });
    return ranked;
  }

  function weightedTop(ranked) {
    const top = ranked.slice(0, 3);
    if (!top.length) return null;
    const weights = [3, 2, 1].slice(0, top.length);
    let roll = Math.random() * weights.reduce(function (sum, weight) { return sum + weight; }, 0);
    for (let i = 0; i < top.length; i++) {
      roll -= weights[i];
      if (roll < 0) return top[i];
    }
    return top[0];
  }

  function runBot() {
    const cursor = draftCursor();
    if (!state.practice || !valuesReady || !cursor.step || cursor.step.side === state.human) return;
    const choice = weightedTop(rankedChoices(cursor, null, true));
    if (!choice) return;
    const names = cursor.step.kind === "picks" ? orderForBlind(choice.names) : choice.names;
    commitNames(names, cursor.step.side, cursor.step.kind);
    render();
  }

  function maybeBot() {
    clearTimeout(botTimer);
    if (!state.practice || !valuesReady) return;
    const cursor = draftCursor();
    if (!cursor.step || cursor.step.side === state.human) return;
    botTimer = setTimeout(runBot, 350);
  }

  function clearBoard() {
    state.blue = emptySide();
    state.red = emptySide();
    state.selected = null;
    state.history = [];
    state.staged = [];
  }

  function renderPracticeRecs() {
    const cursor = draftCursor();
    els.recsBlue.classList.toggle("active", state.human === "blue");
    els.recsRed.classList.toggle("active", state.human === "red");
    if (!cursor.step) {
      els.recs.hidden = true;
      els.recsList.innerHTML = "";
      els.title.textContent = "Draft complete";
      return;
    }
    const yours = cursor.step.side === state.human;
    const team = cursor.step.side === "blue" ? "Blue" : "Red";
    const action = cursor.step.kind === "bans" ? "ban" : "pick";
    const count = cursor.step.count === 2 ? "two " + action + "s" : action;
    els.title.textContent = (yours ? "Your " : "Bot ") + count;
    if (!yours) {
      els.recs.hidden = true;
      return;
    }
    const shape = recShape();
    const ranked = shape === "duo" && cursor.step.kind === "picks"
      ? duoRecommendations(cursor.step.side, cursor.step)
      : rankedChoices(cursor, shape);
    els.recs.hidden = false;
    if (cursor.step.kind === "bans") els.recsLabel.textContent = "Best bans for " + team;
    else if (shape === "duo") els.recsLabel.textContent = "Best pairs for " + team;
    else if (cursor.step.count === 2 && state.staged.length === 1) els.recsLabel.textContent = "Best with " + state.staged[0];
    else els.recsLabel.textContent = "Best " + action + " for " + team;
    els.recsList.innerHTML = "";
    shownRecs(ranked, 8).forEach(function (row) {
      const ordered = orderForBlind(row.names);
      const card = document.createElement("div");
      card.className = "rec-card" + (ordered.length > 1 ? " pair" : "");
      card.title = pairTitle(ordered, row.total);
      const meta = document.createElement("div");
      meta.className = "rec-meta";
      const name = document.createElement("strong");
      name.textContent = ordered.join(" + ");
      const delta = document.createElement("span");
      delta.className = row.total >= 0 ? "up" : "down";
      delta.textContent = formatScore(row.total);
      meta.append(name, delta);
      ordered.forEach(function (heroName) {
        const art = portrait(roster.get(heroName));
        if (ordered.length > 1 && pickCount() < 2 && countsAsBlind(heroName)) art.classList.add("is-blind");
        card.append(art);
      });
      card.append(meta);
      card.addEventListener("click", function () {
        if (ordered.length === 1) practiceAdd(ordered[0]);
        else if (cursor.step.kind === "picks" && cursor.step.count === 2) {
          state.staged = [];
          commitNames(ordered, cursor.step.side, cursor.step.kind);
          render();
        }
      });
      els.recsList.append(card);
    });
    if (cursor.step.kind === "picks") noteComfortGap(cursor.step.side);
  }

  function renderPhase() {
    const practiceBtn = document.getElementById("practice-btn");
    const sideBox = document.getElementById("practice-side");
    practiceBtn.setAttribute("aria-pressed", state.practice ? "true" : "false");
    sideBox.hidden = !state.practice;
    document.getElementById("play-blue").classList.toggle("active", state.human === "blue");
    document.getElementById("play-red").classList.toggle("active", state.human === "red");
    if (!state.practice) {
      document.getElementById("phase-kicker").textContent = PATCH_KICKER;
      return;
    }
    const seat = state.human === "blue" ? "Blue · first pick" : "Red · second pick";
    document.getElementById("phase-kicker").textContent = "Practice · " + seat;
  }

  function render() {
    syncRecShape();
    renderSlots(els.blueBans, "blue", "bans");
    renderSlots(els.bluePicks, "blue", "picks");
    renderSlots(els.redBans, "red", "bans");
    renderSlots(els.redPicks, "red", "picks");
    renderTags();
    renderGrid();
    if (state.practice) renderPracticeRecs();
    else renderRecs();
    renderComfort();
    renderWin();
    renderPhase();
    maybeBot();
  }

  els.search.addEventListener("input", function () {
    state.query = els.search.value;
    render();
  });
  els.recsBlue.addEventListener("click", function () {
    state.recSide = "blue";
    render();
  });
  els.recsRed.addEventListener("click", function () {
    state.recSide = "red";
    render();
  });
  document.getElementById("recs-single").addEventListener("click", function () {
    state.recShape = "single";
    render();
  });
  document.getElementById("recs-duo").addEventListener("click", function () {
    state.recShape = "duo";
    render();
  });
  function bindWeight(input, label, key) {
    input.addEventListener("input", function () {
      state.weights[key] = Number(input.value);
      label.textContent = Number(input.value).toFixed(2);
      render();
    });
  }
  bindWeight(els.counter, els.counterVal, "counter");
  bindWeight(els.pairing, els.pairingVal, "pairing");
  bindWeight(els.values, els.valuesVal, "values");
  bindWeight(els.role, els.roleVal, "role");
  document.getElementById("undo-btn").addEventListener("click", function () {
    if (state.practice && state.staged.length) {
      state.staged = [];
      render();
      return;
    }
    const previous = state.history.pop();
    if (!previous) return;
    const board = JSON.parse(previous);
    state.blue = board.blue;
    state.red = board.red;
    render();
  });
  document.getElementById("reset-btn").addEventListener("click", function () {
    if (state.practice) {
      clearBoard();
      render();
      return;
    }
    remember();
    state.blue = emptySide();
    state.red = emptySide();
    state.selected = null;
    render();
  });
  document.getElementById("swap-btn").addEventListener("click", function () {
    if (state.practice) {
      state.human = state.human === "blue" ? "red" : "blue";
      const sheet = state.comfort.blue;
      state.comfort.blue = state.comfort.red;
      state.comfort.red = sheet;
      clearBoard();
      render();
      return;
    }
    remember();
    const blue = state.blue;
    state.blue = state.red;
    state.red = blue;
    const sheet = state.comfort.blue;
    state.comfort.blue = state.comfort.red;
    state.comfort.red = sheet;
    render();
  });
  document.getElementById("practice-btn").addEventListener("click", function () {
    state.practice = !state.practice;
    state.human = "blue";
    clearBoard();
    render();
  });
  document.getElementById("play-blue").addEventListener("click", function () {
    if (!state.practice || state.human === "blue") return;
    state.human = "blue";
    clearBoard();
    render();
  });
  document.getElementById("play-red").addEventListener("click", function () {
    if (!state.practice || state.human === "red") return;
    state.human = "red";
    clearBoard();
    render();
  });

  els.pool.addEventListener("dragover", function (event) {
    event.preventDefault();
    els.pool.classList.add("drop-hover");
  });
  els.pool.addEventListener("dragleave", function (event) {
    if (!els.pool.contains(event.relatedTarget)) els.pool.classList.remove("drop-hover");
  });
  els.pool.addEventListener("drop", function (event) {
    els.pool.classList.remove("drop-hover");
    const raw = event.dataTransfer.getData("text/plain");
    if (!raw) return;
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      return;
    }
    if (!payload.from) return;
    if (state.practice) {
      undoCurrentTurn(payload.name);
      return;
    }
    event.preventDefault();
    release(payload.name);
  });

  els.maps.addEventListener("change", function () {
    state.map = els.maps.value;
    render();
  });

  let comfortSerial = 0;

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    const src = String(text || "").replace(/^\uFEFF/, "");
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (quoted) {
        if (ch === '"') {
          if (src[i + 1] === '"') {
            cell += '"';
            i += 1;
          } else quoted = false;
        } else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else if (ch !== "\r") cell += ch;
    }
    if (cell.length || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows.filter(function (line) {
      return line.some(function (value) { return String(value).trim(); });
    });
  }

  function comfortFromCsv(text) {
    const rows = parseCsv(text);
    if (!rows.length) throw new Error("empty");
    const header = rows[0].map(function (value) { return String(value).trim(); });
    const idx = {};
    ["Hero Name", "Healer", "Tank", "RangedDPS", "Flex", "Offlane"].forEach(function (key) {
      idx[key] = header.indexOf(key);
    });
    if (idx["Hero Name"] < 0 || idx.Healer < 0 || idx.Tank < 0 || idx.RangedDPS < 0 || idx.Flex < 0 || idx.Offlane < 0) {
      throw new Error("header");
    }
    const roles = {};
    let count = 0;
    rows.slice(1).forEach(function (line) {
      const raw = String(line[idx["Hero Name"]] || "").trim();
      if (!raw || raw === "DEFAULT") return;
      const name = resolveName(raw);
      if (!name) return;
      function num(key) {
        const value = Number(line[idx[key]]);
        return value || 0;
      }
      roles[name] = {
        tank: num("Tank"),
        dps: num("RangedDPS"),
        healer: num("Healer"),
        flex: num("Flex"),
        offlane: num("Offlane"),
      };
      count += 1;
    });
    if (!count) throw new Error("none");
    return { roles: roles, count: count };
  }

  function applyComfortText(side, text, label) {
    const box = document.getElementById(side + "-comfort");
    let parsed;
    try {
      parsed = comfortFromCsv(text);
    } catch (err) {
      box.classList.add("is-error");
      box.querySelector(".comfort-status").textContent = "Use columns Hero Name, Healer, Tank, RangedDPS, Flex, Offlane";
      return;
    }
    parsed.label = label;
    parsed.stamp = String(++comfortSerial);
    state.comfort[side] = parsed;
    render();
  }

  function readComfortFile(side, file) {
    const reader = new FileReader();
    reader.onload = function () {
      applyComfortText(side, String(reader.result || ""), file.name || "Comfort sheet");
    };
    reader.readAsText(file);
  }

  function renderComfort() {
    ["blue", "red"].forEach(function (side) {
      const box = document.getElementById(side + "-comfort");
      if (!box) return;
      const sheet = state.comfort[side];
      const status = box.querySelector(".comfort-status");
      const clear = box.querySelector(".comfort-clear");
      box.classList.toggle("has-custom", !!sheet);
      box.classList.remove("is-error");
      if (sheet) {
        status.textContent = sheet.label + " · " + sheet.count + " overriding base";
        clear.hidden = false;
      } else {
        status.textContent = "Drop a CSV to override roles";
        clear.hidden = true;
        state.comfortMode[side] = false;
      }
      const mode = box.querySelector(".comfort-mode");
      const toggle = box.querySelector(".comfort-mode-input");
      if (mode && toggle) {
        mode.hidden = !sheet;
        toggle.checked = !!state.comfortMode[side];
      }
    });
  }

  function bindComfort(side) {
    const box = document.getElementById(side + "-comfort");
    const input = box.querySelector(".comfort-file");
    box.addEventListener("click", function (event) {
      if (event.target.closest(".comfort-clear") || event.target.closest(".comfort-mode")) return;
      input.click();
    });
    input.addEventListener("click", function (event) { event.stopPropagation(); });
    input.addEventListener("change", function () {
      const file = input.files && input.files[0];
      input.value = "";
      if (file) readComfortFile(side, file);
    });
    box.addEventListener("dragover", function (event) {
      event.preventDefault();
      box.classList.add("is-over");
    });
    box.addEventListener("dragleave", function () { box.classList.remove("is-over"); });
    box.addEventListener("drop", function (event) {
      event.preventDefault();
      box.classList.remove("is-over");
      const file = event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) {
        readComfortFile(side, file);
        return;
      }
      const text = event.dataTransfer.getData("text/plain");
      if (text) applyComfortText(side, text, "Pasted sheet");
    });
    box.addEventListener("paste", function (event) {
      const text = event.clipboardData && event.clipboardData.getData("text/plain");
      if (!text) return;
      event.preventDefault();
      applyComfortText(side, text, "Pasted sheet");
    });
    box.querySelector(".comfort-clear").addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      state.comfort[side] = null;
      state.comfortMode[side] = false;
      render();
    });
    const toggle = box.querySelector(".comfort-mode-input");
    if (toggle) {
      toggle.addEventListener("click", function (event) { event.stopPropagation(); });
      toggle.addEventListener("change", function () {
        state.comfortMode[side] = toggle.checked;
        render();
      });
    }
  }

  bindComfort("blue");
  bindComfort("red");

  function indexRows(rows, read) {
    rows.forEach(function (row) {
      if (row["Hero Name"] === "DEFAULT") return;
      const name = resolveName(row["Hero Name"]);
      if (!name) return;
      read(name, row);
    });
  }

  Promise.all([
    fetch("hots_map_matrix.json?v=2").then(function (response) { return response.json(); }),
    fetch("hotsblindable.json?v=2").then(function (response) { return response.json(); }),
    fetch("herovalues.json?v=7").then(function (response) { return response.json(); }),
    fetch("hotsroles.json?v=3").then(function (response) { return response.json(); }),
  ]).then(function (loaded) {
    const matrix = loaded[0];
    mapMatrix = matrix;
    const values = [];
    Object.keys(matrix).forEach(function (hero) {
      Object.keys(matrix[hero]).forEach(function (map) {
        values.push(matrix[hero][map]);
      });
    });
    mapAverage = values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
    mapNames = Object.keys(matrix[Object.keys(matrix)[0]]);
    fillMaps();
    indexRows(loaded[1], function (name, row) {
      blindLookup[name] = Number(row.Blindable) || 0;
    });
    indexRows(loaded[2], function (name, row) {
      statLookup[name] = {
        waveclear: Number(row["Wave Clear"]) || 0,
        engage: Number(row.Engage) || 0,
        peel: Number(row.Peel) || 0,
        teamSustain: Number(row.TeamSustain) || 0,
        selfSustain: Number(row.SelfSustain) || 0,
        anchor: Number(row.Anchor) || 0,
        race: Number(row.Race) || 0,
      };
    });
    indexRows(loaded[3], function (name, row) {
      roleLookup[name] = {
        tank: Number(row.Tank) || 0,
        dps: Number(row.RangedDPS) || 0,
        healer: Number(row.Healer) || 0,
        flex: Number(row.Flex) || 0,
        offlane: Number(row.Offlane) || 0,
      };
    });
    valuesReady = true;
    render();
  });

  render();
})();
