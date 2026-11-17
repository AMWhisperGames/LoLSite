(function () {
  const DDRAGON = "https://ddragon.leagueoflegends.com";
  const ROLES = ["TOP", "JNG", "MID", "ADC", "SUP"];
  const ROLE_KEYS = ["top", "jng", "mid", "adc", "sup"];
  const LEAGUES = ["All", "LPL", "LCK", "LEC", "LCS", "Worlds", "MSI"];
  const SOURCES = [
    { id: "pro", label: "Pro" },
    { id: "solo", label: "Solo" },
  ];
  const VIEWS = [
    { id: "champ", label: "Champs" },
    { id: "duo", label: "Duos" },
  ];
  const EDGE_PRIOR = 20;
  const MIN_STRENGTH = 3; // overview graph only; focus uses min-games alone
  const MAX_EDGE_PER_NODE = 6;
  const ELO_SCALE = 400;
  const TEAM_SCORE_ELO = 14;
  const MIN_ROLE_PRESENCE = 5; // % of a champ's games that must be in the filtered role
  const DUO_ADC = "adc";
  const DUO_SUP = "sup";

  const els = {
    boot: document.getElementById("boot"),
    bootStatus: document.getElementById("boot-status"),
    app: document.getElementById("app"),
    range: document.getElementById("bubble-range"),
    kicker: document.getElementById("bubble-kicker"),
    hint: document.getElementById("bubble-hint"),
    search: document.getElementById("bubble-search"),
    searchMenu: document.getElementById("bubble-search-menu"),
    views: document.getElementById("bubble-views"),
    sources: document.getElementById("bubble-sources"),
    leagues: document.getElementById("bubble-leagues"),
    roles: document.getElementById("bubble-roles"),
    windows: document.getElementById("bubble-windows"),
    network: document.getElementById("bubble-network"),
    topn: document.getElementById("bubble-topn"),
    topnVal: document.getElementById("bubble-topn-val"),
    minGames: document.getElementById("bubble-mingames"),
    minGamesVal: document.getElementById("bubble-mingames-val"),
    canvas: document.getElementById("bubble-canvas"),
    tooltip: document.getElementById("bubble-tooltip"),
    detail: document.getElementById("bubble-detail"),
    detailIcon: document.getElementById("bubble-detail-icon"),
    detailName: document.getElementById("bubble-detail-name"),
    detailSub: document.getElementById("bubble-detail-sub"),
    detailVs: document.getElementById("bubble-detail-vs"),
    detailClear: document.getElementById("bubble-detail-clear"),
    detailCounters: document.getElementById("bubble-detail-counters"),
    detailHistory: document.getElementById("bubble-detail-history"),
    historyTitle: document.getElementById("bubble-history-title"),
    historySub: document.getElementById("bubble-history-sub"),
    historyList: document.getElementById("bubble-history-list"),
    historyClear: document.getElementById("bubble-history-clear"),
    stage: document.querySelector(".bubble-stage"),
  };

  let patch = "";
  let champMap = new Map();
  let bundle = { games: [], leagues: LEAGUES.filter(function (l) { return l !== "All"; }), to: "" };
  let source = "pro"; // pro = Oracle's Elixir, solo = LoLalytics
  let viewMode = "champ"; // champ | duo (ADC+SUP)
  let league = "All";
  let role = "MID";
  let topN = 36;
  let minGames = 8;
  let showNetwork = false;
  let selected = "";
  let hoverId = "";
  let hoverEdge = null;
  let historyPair = null; // { us, them }
  let search = "";
  let lastData = null;

  let nodes = [];
  let edges = [];
  let nodeById = {};
  let imgCache = {};
  let simRunning = false;
  let raf = 0;
  let drag = null;
  let dpr = 1;
  let view = { w: 0, h: 0 };

  function portrait(id) {
    return DDRAGON + "/cdn/" + patch + "/img/champion/" + id + ".png";
  }

  function champName(id) {
    return (champMap.get(id) && champMap.get(id).name) || id;
  }

  function addDays(iso, days) {
    const date = new Date(iso + "T00:00:00");
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function cutoffDate() {
    return RIFT_WINDOW.cutoff(bundle.to, addDays);
  }

  function filteredGames() {
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

  function delta(wins, games) {
    if (!games) return 0;
    return (wins / games - 0.5) * 100;
  }

  function adjDelta(rec) {
    if (!rec || !rec.games) return 0;
    // Mean (actual − roster-expected) as percentage points.
    return (rec.adj / rec.games) * 100;
  }

  function baseAdj(stats, id) {
    const st = stats && stats[id];
    if (!st || !st.picks) return 0;
    // Champ's typical skill-adj performance (actual − roster-expected).
    return (st.adj / st.picks) * 100;
  }

  function relDelta(rec, basePp) {
    // Matchup edge = skill-adj result relative to this champ's own baseline.
    // A 51% skill-adj WR is a bad matchup if the champ usually sits at 54%.
    return adjDelta(rec) - (basePp || 0);
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

  function playerKey(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/\s+/g, "");
  }

  function playerScore(name, roleName) {
    const key = playerKey(name);
    if (!key) return null;
    const roles = (window.RIFT_PLAYER_RATINGS && window.RIFT_PLAYER_RATINGS.roles) || {};
    const roleKey = String(roleName || "").toLowerCase();
    if (roleKey && roles[roleKey] && roles[roleKey][key] && roles[roleKey][key].s != null) {
      return roles[roleKey][key].s;
    }
    let best = null;
    for (let i = 0; i < ROLE_KEYS.length; i += 1) {
      const rec = roles[ROLE_KEYS[i]] && roles[ROLE_KEYS[i]][key];
      if (!rec || rec.s == null) continue;
      if (best == null || rec.s > best) best = rec.s;
    }
    return best;
  }

  function rosterScore(names) {
    let num = 0;
    let den = 0;
    for (let i = 0; i < 5; i += 1) {
      const s = playerScore(names[i], ROLE_KEYS[i]);
      if (s == null || !isFinite(s)) continue;
      num += s;
      den += 1;
    }
    return den ? num / den : null;
  }

  function expectedBlueWin(game) {
    const blue = rosterScore(game.bp || []);
    const red = rosterScore(game.rp || []);
    if (blue == null || red == null) return 0.5;
    const elo = (blue - red) * TEAM_SCORE_ELO;
    return 1 / (1 + Math.pow(10, -elo / ELO_SCALE));
  }

  function bump(map, us, them, win, expected) {
    if (!map[us]) map[us] = {};
    if (!map[us][them]) map[us][them] = { games: 0, wins: 0, adj: 0, exp: 0 };
    map[us][them].games += 1;
    map[us][them].wins += win ? 1 : 0;
    map[us][them].adj += (win ? 1 : 0) - expected;
    map[us][them].exp += expected;
  }

  function isPro() {
    return source !== "solo";
  }

  function isDuo() {
    return viewMode === "duo";
  }

  function duoKey(adc, sup) {
    return String(adc || "") + "|" + String(sup || "");
  }

  function parseDuo(id) {
    const parts = String(id || "").split("|");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    return { adc: parts[0], sup: parts[1] };
  }

  function duoLabel(id) {
    const pair = parseDuo(id);
    if (!pair) return champName(id);
    return champName(pair.adc) + " + " + champName(pair.sup);
  }

  function nodeLabel(id) {
    return isDuo() ? duoLabel(id) : champName(id);
  }

  function soloLane(id, roleKey) {
    const lanes = (window.RIFT_WINRATES && window.RIFT_WINRATES.lanes) || {};
    const lane = lanes[roleKey];
    return (lane && lane.champs && lane.champs[id]) || null;
  }

  function soloInRole(id, roleKey) {
    const rec = soloLane(id, roleKey);
    return !!(rec && (rec.lane_pct || 0) >= MIN_ROLE_PRESENCE);
  }

  function soloTally() {
    const roleKey = role.toLowerCase();
    const lanes = (window.RIFT_WINRATES && window.RIFT_WINRATES.lanes) || {};
    const lane = lanes[roleKey] || {};
    const champs = lane.champs || {};
    const counters = (window.RIFT_COUNTERS && window.RIFT_COUNTERS.matchups) || {};
    const stats = {};
    const matchups = {};
    let pickSum = 0;
    const ids = Object.keys(champs);
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i];
      const rec = champs[id];
      const games = rec && rec.games ? rec.games : 0;
      if (!games) continue;
      if ((rec.lane_pct || 0) < MIN_ROLE_PRESENCE) continue;
      const wr = ((rec.wr != null ? rec.wr : 50) / 100);
      const wins = games * wr;
      const exp = games * 0.5;
      stats[id] = {
        picks: games,
        wins: wins,
        adj: wins - exp,
        exp: exp,
        roles: {},
      };
      stats[id].roles[roleKey] = games;
      pickSum += games;
    }
    const focusIds = Object.keys(stats);
    for (let i = 0; i < focusIds.length; i += 1) {
      const id = focusIds[i];
      const vs = counters[id] || {};
      const themIds = Object.keys(vs);
      matchups[id] = {};
      for (let j = 0; j < themIds.length; j += 1) {
        const them = themIds[j];
        if (them === id) continue;
        if (!soloInRole(them, roleKey) && !stats[them]) continue;
        const entry = vs[them];
        const games = entry && entry.games ? entry.games : 0;
        if (!games) continue;
        const shift = entry && typeof entry.delta === "number" ? entry.delta : 0;
        const wins = games * (0.5 + shift / 100);
        const exp = games * 0.5;
        matchups[id][them] = { games: games, wins: wins, adj: wins - exp, exp: exp };
        if (!stats[them]) {
          const laneRec = soloLane(them, roleKey);
          const g = laneRec && laneRec.games ? laneRec.games : Math.max(games, 1);
          const wr = laneRec && laneRec.wr != null ? laneRec.wr / 100 : 0.5;
          const w = g * wr;
          const e = g * 0.5;
          stats[them] = {
            picks: g,
            wins: w,
            adj: w - e,
            exp: e,
            roles: {},
          };
          stats[them].roles[roleKey] = g;
        }
      }
    }
    return { games: pickSum / 2, stats: stats, matchups: matchups, source: "solo" };
  }

  function proTally(games) {
    const roleKey = role.toLowerCase();
    const roleTotals = {};
    for (let g = 0; g < games.length; g += 1) {
      const game = games[g];
      for (let i = 0; i < 5; i += 1) {
        const rk = ROLE_KEYS[i];
        const ids = [game.b[i], game.r[i]];
        for (let s = 0; s < 2; s += 1) {
          const id = ids[s];
          if (!id) continue;
          if (!roleTotals[id]) roleTotals[id] = { total: 0, roles: {} };
          roleTotals[id].total += 1;
          if (!roleTotals[id].roles[rk]) roleTotals[id].roles[rk] = 0;
          roleTotals[id].roles[rk] += 1;
        }
      }
    }
    function proInRole(id) {
      const rec = roleTotals[id];
      if (!rec || !rec.total) return false;
      return ((rec.roles[roleKey] || 0) / rec.total) * 100 >= MIN_ROLE_PRESENCE;
    }
    const stats = {};
    const matchups = {};
    for (let g = 0; g < games.length; g += 1) {
      const game = games[g];
      const pBlue = expectedBlueWin(game);
      for (let i = 0; i < 5; i += 1) {
        if (ROLE_KEYS[i] !== roleKey) continue;
        const both = [
          { id: game.b[i], win: game.w === 1, enemy: game.r[i], expected: pBlue },
          { id: game.r[i], win: game.w === 0, enemy: game.b[i], expected: 1 - pBlue },
        ];
        for (let s = 0; s < 2; s += 1) {
          const us = both[s];
          if (!us.id || !us.enemy) continue;
          if (!proInRole(us.id)) continue;
          if (!stats[us.id]) stats[us.id] = { picks: 0, wins: 0, adj: 0, exp: 0, roles: {} };
          stats[us.id].picks += 1;
          stats[us.id].wins += us.win ? 1 : 0;
          stats[us.id].adj += (us.win ? 1 : 0) - us.expected;
          stats[us.id].exp += us.expected;
          const rk = ROLE_KEYS[i];
          if (!stats[us.id].roles[rk]) stats[us.id].roles[rk] = 0;
          stats[us.id].roles[rk] += 1;
          bump(matchups, us.id, us.enemy, us.win, us.expected);
        }
      }
    }
    return { games: games.length, stats: stats, matchups: matchups, source: "pro" };
  }

  function soloDuoTally() {
    const lanes = (window.RIFT_WINRATES && window.RIFT_WINRATES.lanes) || {};
    const adcLane = (lanes[DUO_ADC] && lanes[DUO_ADC].champs) || {};
    const supLane = (lanes[DUO_SUP] && lanes[DUO_SUP].champs) || {};
    const synergies = (window.RIFT_SYNERGIES && window.RIFT_SYNERGIES.synergies) || {};
    const adcOk = {};
    const supOk = {};
    const adcIds = Object.keys(adcLane);
    for (let i = 0; i < adcIds.length; i += 1) {
      const id = adcIds[i];
      const rec = adcLane[id];
      if (rec && rec.games && (rec.lane_pct || 0) >= MIN_ROLE_PRESENCE) adcOk[id] = true;
    }
    const supIds = Object.keys(supLane);
    for (let i = 0; i < supIds.length; i += 1) {
      const id = supIds[i];
      const rec = supLane[id];
      if (rec && rec.games && (rec.lane_pct || 0) >= MIN_ROLE_PRESENCE) supOk[id] = true;
    }
    const stats = {};
    const matchups = {};
    let pickSum = 0;
    const byAdc = {};
    const bySup = {};
    const mains = Object.keys(synergies);
    for (let i = 0; i < mains.length; i += 1) {
      const adc = mains[i];
      if (!adcOk[adc]) continue;
      const mates = synergies[adc] || {};
      const mateIds = Object.keys(mates);
      for (let j = 0; j < mateIds.length; j += 1) {
        const sup = mateIds[j];
        if (!supOk[sup]) continue;
        const entry = mates[sup];
        if (!entry || entry.role !== DUO_SUP) continue;
        const games = entry.games || 0;
        if (!games) continue;
        const shift = typeof entry.delta === "number" ? entry.delta : 0;
        const wins = games * (0.5 + shift / 100);
        const exp = games * 0.5;
        const id = duoKey(adc, sup);
        stats[id] = {
          picks: games,
          wins: wins,
          adj: wins - exp,
          exp: exp,
          roles: { adc: games, sup: games },
          adc: adc,
          sup: sup,
          delta: shift,
        };
        pickSum += games;
        if (!byAdc[adc]) byAdc[adc] = [];
        byAdc[adc].push(id);
        if (!bySup[sup]) bySup[sup] = [];
        bySup[sup].push(id);
      }
    }
    const duoIds = Object.keys(stats);
    for (let i = 0; i < duoIds.length; i += 1) {
      const id = duoIds[i];
      const st = stats[id];
      matchups[id] = {};
      const shareAdc = byAdc[st.adc] || [];
      const shareSup = bySup[st.sup] || [];
      for (let j = 0; j < shareAdc.length; j += 1) {
        const other = shareAdc[j];
        if (other === id || matchups[id][other]) continue;
        const ot = stats[other];
        if (!ot || ot.picks < minGames) continue;
        const games = Math.min(st.picks, ot.picks);
        const shift = (ot.delta || 0) - (st.delta || 0);
        const wins = games * (0.5 + shift / 100);
        const exp = games * 0.5;
        matchups[id][other] = { games: games, wins: wins, adj: wins - exp, exp: exp, kind: "share-adc" };
      }
      for (let j = 0; j < shareSup.length; j += 1) {
        const other = shareSup[j];
        if (other === id || matchups[id][other]) continue;
        const ot = stats[other];
        if (!ot || ot.picks < minGames) continue;
        const games = Math.min(st.picks, ot.picks);
        const shift = (ot.delta || 0) - (st.delta || 0);
        const wins = games * (0.5 + shift / 100);
        const exp = games * 0.5;
        matchups[id][other] = { games: games, wins: wins, adj: wins - exp, exp: exp, kind: "share-sup" };
      }
    }
    let adcGames = 0;
    for (let i = 0; i < adcIds.length; i += 1) {
      const rec = adcLane[adcIds[i]];
      if (rec && rec.games) adcGames += rec.games;
    }
    return {
      games: adcGames / 2 || pickSum,
      stats: stats,
      matchups: matchups,
      source: "solo",
      kind: "duo",
    };
  }

  function proDuoTally(games) {
    const roleTotals = {};
    for (let g = 0; g < games.length; g += 1) {
      const game = games[g];
      for (let i = 0; i < 5; i += 1) {
        const rk = ROLE_KEYS[i];
        const ids = [game.b[i], game.r[i]];
        for (let s = 0; s < 2; s += 1) {
          const id = ids[s];
          if (!id) continue;
          if (!roleTotals[id]) roleTotals[id] = { total: 0, roles: {} };
          roleTotals[id].total += 1;
          if (!roleTotals[id].roles[rk]) roleTotals[id].roles[rk] = 0;
          roleTotals[id].roles[rk] += 1;
        }
      }
    }
    function roleShare(id, roleKey) {
      const rec = roleTotals[id];
      if (!rec || !rec.total) return 0;
      return ((rec.roles[roleKey] || 0) / rec.total) * 100;
    }
    function duoOk(adc, sup) {
      return (
        roleShare(adc, DUO_ADC) >= MIN_ROLE_PRESENCE &&
        roleShare(sup, DUO_SUP) >= MIN_ROLE_PRESENCE
      );
    }
    const stats = {};
    const matchups = {};
    function bumpDuo(id, adc, sup, win, expected) {
      if (!stats[id]) {
        stats[id] = {
          picks: 0,
          wins: 0,
          adj: 0,
          exp: 0,
          roles: { adc: 0, sup: 0 },
          adc: adc,
          sup: sup,
        };
      }
      stats[id].picks += 1;
      stats[id].wins += win ? 1 : 0;
      stats[id].adj += (win ? 1 : 0) - expected;
      stats[id].exp += expected;
      stats[id].roles.adc += 1;
      stats[id].roles.sup += 1;
    }
    for (let g = 0; g < games.length; g += 1) {
      const game = games[g];
      const bAdc = game.b && game.b[3];
      const bSup = game.b && game.b[4];
      const rAdc = game.r && game.r[3];
      const rSup = game.r && game.r[4];
      if (!bAdc || !bSup || !rAdc || !rSup) continue;
      const blueId = duoKey(bAdc, bSup);
      const redId = duoKey(rAdc, rSup);
      const pBlue = expectedBlueWin(game);
      if (duoOk(bAdc, bSup)) bumpDuo(blueId, bAdc, bSup, game.w === 1, pBlue);
      if (duoOk(rAdc, rSup)) bumpDuo(redId, rAdc, rSup, game.w === 0, 1 - pBlue);
      if (duoOk(bAdc, bSup) && duoOk(rAdc, rSup) && blueId !== redId) {
        bump(matchups, blueId, redId, game.w === 1, pBlue);
        bump(matchups, redId, blueId, game.w === 0, 1 - pBlue);
      }
    }
    return { games: games.length, stats: stats, matchups: matchups, source: "pro", kind: "duo" };
  }

  function tally(games) {
    if (isDuo()) return isPro() ? proDuoTally(games) : soloDuoTally();
    if (!isPro()) return soloTally();
    return proTally(games);
  }

  function primaryRole(roles) {
    let best = "";
    let n = 0;
    for (let i = 0; i < ROLE_KEYS.length; i += 1) {
      const c = (roles && roles[ROLE_KEYS[i]]) || 0;
      if (c > n) {
        n = c;
        best = ROLE_KEYS[i];
      }
    }
    return best;
  }

  function edgeWeight(games, strengthAbs) {
    const conf = games / (games + EDGE_PRIOR);
    const str = Math.min(1, strengthAbs / 20);
    return conf * (0.35 + 0.65 * str);
  }

  function counterLinksFor(id, matchups, stats, opts) {
    const requireStrength = !opts || opts.requireStrength !== false;
    const map = matchups[id] || {};
    const base = baseAdj(stats, id);
    const rows = [];
    const them = Object.keys(map);
    for (let i = 0; i < them.length; i += 1) {
      const other = them[i];
      const rec = map[other];
      if (!rec || rec.games < minGames) continue;
      const raw = delta(rec.wins, rec.games);
      const skill = adjDelta(rec);
      const d = relDelta(rec, base);
      if (requireStrength && Math.abs(d) < MIN_STRENGTH) continue;
      let src = id;
      let dst = other;
      let signed = d;
      if (d < 0) {
        src = other;
        dst = id;
        signed = -d;
      }
      rows.push({
        source: src,
        target: dst,
        other: other,
        games: rec.games,
        wins: rec.wins,
        delta: signed,
        rawDelta: d,
        skillDelta: skill,
        rawWrDelta: raw,
        baseDelta: base,
        expected: rec.games ? rec.exp / rec.games : 0.5,
        w: edgeWeight(rec.games, Math.abs(d)),
      });
    }
    rows.sort(function (a, b) {
      return b.w - a.w;
    });
    return rows;
  }

  function significantEdgesAmong(keep, keepSet, data, skipPairs) {
    const candidates = [];
    const seen = skipPairs || {};
    for (let i = 0; i < keep.length; i += 1) {
      const a = keep[i];
      const map = data.matchups[a] || {};
      const them = Object.keys(map);
      for (let j = 0; j < them.length; j += 1) {
        const b = them[j];
        if (!keepSet[b] || a === b) continue;
        const key = a < b ? a + "|" + b : b + "|" + a;
        if (seen[key]) continue;
        seen[key] = true;
        const rec = map[b];
        if (!rec || rec.games < minGames) continue;
        const recBa = (data.matchups[b] || {})[a];
        const relA = relDelta(rec, baseAdj(data.stats, a));
        const relB = recBa ? relDelta(recBa, baseAdj(data.stats, b)) : -relA;
        const favorA = relA >= relB;
        const d = favorA ? relA : relB;
        if (Math.abs(d) < MIN_STRENGTH) continue;
        const src = favorA ? a : b;
        const dst = favorA ? b : a;
        const rawFromSrc = favorA
          ? delta(rec.wins, rec.games)
          : recBa
            ? delta(recBa.wins, recBa.games)
            : -delta(rec.wins, rec.games);
        const skillFromSrc = favorA
          ? adjDelta(rec)
          : recBa
            ? adjDelta(recBa)
            : -adjDelta(rec);
        candidates.push({
          type: "vs",
          source: src,
          target: dst,
          games: rec.games,
          wins: favorA ? rec.wins : recBa ? recBa.wins : rec.games - rec.wins,
          delta: Math.abs(d),
          rawDelta: d,
          rawWrDelta: rawFromSrc,
          skillDelta: skillFromSrc,
          baseDelta: favorA ? baseAdj(data.stats, a) : baseAdj(data.stats, b),
          expected: favorA
            ? rec.games
              ? rec.exp / rec.games
              : 0.5
            : recBa && recBa.games
              ? recBa.exp / recBa.games
              : 0.5,
          w: edgeWeight(rec.games, Math.abs(d)),
        });
      }
    }
    candidates.sort(function (a, b) {
      return b.w - a.w;
    });
    const out = [];
    const degree = {};
    for (let i = 0; i < candidates.length; i += 1) {
      const e = candidates[i];
      const da = degree[e.source] || 0;
      const db = degree[e.target] || 0;
      if (da >= MAX_EDGE_PER_NODE && db >= MAX_EDGE_PER_NODE) continue;
      out.push(e);
      degree[e.source] = da + 1;
      degree[e.target] = db + 1;
    }
    return out;
  }

  function buildGraph(data) {
    let keep = [];
    const keepSet = {};
    let nextEdges = [];

    if (selected && data.stats[selected]) {
      const links = counterLinksFor(selected, data.matchups, data.stats, {
        requireStrength: false,
      })
        .sort(function (a, b) {
          return b.games - a.games || b.w - a.w;
        })
        .slice(0, topN);
      keep = [selected];
      keepSet[selected] = true;
      const usedPairs = {};
      for (let i = 0; i < links.length; i += 1) {
        const other = links[i].other;
        if (!keepSet[other]) {
          if (!data.stats[other]) {
            data.stats[other] = {
              picks: links[i].games || 1,
              wins: (links[i].games || 1) * 0.5,
              adj: 0,
              exp: (links[i].games || 1) * 0.5,
              roles: {},
            };
          }
          keep.push(other);
          keepSet[other] = true;
        }
        const pairKey =
          links[i].source < links[i].target
            ? links[i].source + "|" + links[i].target
            : links[i].target + "|" + links[i].source;
        usedPairs[pairKey] = true;
        nextEdges.push({
          type: "vs",
          source: links[i].source,
          target: links[i].target,
          games: links[i].games,
          wins: links[i].wins,
          delta: links[i].delta,
          rawDelta: links[i].rawDelta,
          rawWrDelta: links[i].rawWrDelta,
          skillDelta: links[i].skillDelta,
          baseDelta: links[i].baseDelta,
          expected: links[i].expected,
          w: links[i].w,
        });
      }
      if (showNetwork) {
        const peerKeep = keep.filter(function (id) {
          return id !== selected;
        });
        const peerSet = {};
        for (let i = 0; i < peerKeep.length; i += 1) peerSet[peerKeep[i]] = true;
        const extras = significantEdgesAmong(peerKeep, peerSet, data, usedPairs);
        for (let i = 0; i < extras.length; i += 1) nextEdges.push(extras[i]);
      }
    } else {
      const ids = Object.keys(data.stats).sort(function (a, b) {
        return data.stats[b].picks - data.stats[a].picks;
      });
      keep = ids.slice(0, topN);
      for (let i = 0; i < keep.length; i += 1) keepSet[keep[i]] = true;
      nextEdges = significantEdgesAmong(keep, keepSet, data, {});
    }

    let maxPicks = 1;
    for (let i = 0; i < keep.length; i += 1) {
      const st = data.stats[keep[i]];
      if (st && st.picks > maxPicks) maxPicks = st.picks;
    }

    const nextNodes = [];
    const nextById = {};
    const focus = selected && keepSet[selected];
    for (let i = 0; i < keep.length; i += 1) {
      const id = keep[i];
      const st = data.stats[id];
      if (!st) continue;
      const prev = nodeById[id];
      const t = Math.sqrt(st.picks / maxPicks);
      const r = 14 + t * 28;
      let x;
      let y;
      if (prev) {
        x = prev.x;
        y = prev.y;
      } else if (focus && id === selected) {
        x = view.w * 0.5;
        y = view.h * 0.5;
      } else if (focus) {
        const idx = keep.indexOf(id) - 1;
        const count = Math.max(1, keep.length - 1);
        const ang = (idx / count) * Math.PI * 2 - Math.PI / 2;
        const ring = Math.min(view.w, view.h) * 0.28;
        x = view.w * 0.5 + Math.cos(ang) * ring;
        y = view.h * 0.5 + Math.sin(ang) * ring;
      } else {
        const ang = (i / keep.length) * Math.PI * 2;
        const ring = Math.min(view.w, view.h) * 0.28;
        x = view.w * 0.5 + Math.cos(ang) * ring;
        y = view.h * 0.5 + Math.sin(ang) * ring;
      }
      const node = {
        id: id,
        picks: st.picks,
        wins: st.wins,
        wr: st.picks ? st.wins / st.picks : 0,
        role: isDuo() ? "duo" : primaryRole(st.roles),
        adc: st.adc || "",
        sup: st.sup || "",
        delta: st.delta,
        r: r,
        x: x,
        y: y,
        vx: prev ? prev.vx * 0.15 : 0,
        vy: prev ? prev.vy * 0.15 : 0,
      };
      nextNodes.push(node);
      nextById[id] = node;
      if (isDuo() && st.adc && st.sup) {
        ensureImage(st.adc);
        ensureImage(st.sup);
      } else {
        ensureImage(id);
      }
    }

    nodes = nextNodes;
    edges = nextEdges;
    nodeById = nextById;
  }

  function ensureImage(id) {
    if (imgCache[id]) return imgCache[id];
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.src = portrait(id);
    imgCache[id] = img;
    return img;
  }

  function resize() {
    if (!els.stage || !els.canvas) return;
    const rect = els.stage.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    view.w = Math.max(320, rect.width);
    view.h = Math.max(280, rect.height);
    els.canvas.width = Math.floor(view.w * dpr);
    els.canvas.height = Math.floor(view.h * dpr);
    els.canvas.style.width = view.w + "px";
    els.canvas.style.height = view.h + "px";
  }

  function stepSim() {
    const n = nodes.length;
    if (!n) return;
    const cx = view.w * 0.5;
    const cy = view.h * 0.5;
    const k = Math.sqrt((view.w * view.h) / Math.max(1, n)) * 0.38;

    for (let i = 0; i < n; i += 1) {
      const a = nodes[i];
      if (drag && drag.id === a.id) continue;
      for (let j = i + 1; j < n; j += 1) {
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist2 = dx * dx + dy * dy;
        if (dist2 < 1) dist2 = 1;
        const dist = Math.sqrt(dist2);
        const minDist = a.r + b.r + 14;
        let force = (k * k) / dist;
        if (dist < minDist) force += (minDist - dist) * 0.85;
        force = Math.min(force, 18);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx * 0.04;
        a.vy += fy * 0.04;
        if (!(drag && drag.id === b.id)) {
          b.vx -= fx * 0.04;
          b.vy -= fy * 0.04;
        }
      }
    }

    for (let i = 0; i < edges.length; i += 1) {
      const e = edges[i];
      const a = nodeById[e.source];
      const b = nodeById[e.target];
      if (!a || !b) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const ideal = 70 + (1 - e.w) * 110 + (a.r + b.r) * 0.35;
      const force = (dist - ideal) * 0.035 * (0.45 + e.w);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (!(drag && drag.id === a.id)) {
        a.vx += fx;
        a.vy += fy;
      }
      if (!(drag && drag.id === b.id)) {
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    for (let i = 0; i < n; i += 1) {
      const a = nodes[i];
      if (drag && drag.id === a.id) {
        a.vx = 0;
        a.vy = 0;
        continue;
      }
      a.vx += (cx - a.x) * 0.022;
      a.vy += (cy - a.y) * 0.022;
      a.vx *= 0.78;
      a.vy *= 0.78;
      const speed = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
      if (speed > 12) {
        a.vx = (a.vx / speed) * 12;
        a.vy = (a.vy / speed) * 12;
      }
      a.x += a.vx;
      a.y += a.vy;
      const pad = a.r + 10;
      if (a.x < pad) {
        a.x = pad;
        a.vx *= -0.4;
      } else if (a.x > view.w - pad) {
        a.x = view.w - pad;
        a.vx *= -0.4;
      }
      if (a.y < pad) {
        a.y = pad;
        a.vy *= -0.4;
      } else if (a.y > view.h - pad) {
        a.y = view.h - pad;
        a.vy *= -0.4;
      }
    }
  }

  function nodeDimmed(id) {
    if (!hoverId || selected) return false;
    if (id === hoverId) return false;
    for (let i = 0; i < edges.length; i += 1) {
      const e = edges[i];
      if ((e.source === hoverId || e.target === hoverId) && (e.source === id || e.target === id)) {
        return false;
      }
    }
    return true;
  }

  function edgeDimmed(e) {
    if (!hoverId || selected) return false;
    return e.source !== hoverId && e.target !== hoverId;
  }

  function draw() {
    const ctx = els.canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);

    const g = ctx.createRadialGradient(
      view.w * 0.5,
      view.h * 0.45,
      40,
      view.w * 0.5,
      view.h * 0.5,
      Math.max(view.w, view.h) * 0.65
    );
    g.addColorStop(0, "rgba(26, 34, 44, 0.55)");
    g.addColorStop(1, "rgba(8, 9, 11, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);

    for (let i = 0; i < edges.length; i += 1) {
      const e = edges[i];
      const a = nodeById[e.source];
      const b = nodeById[e.target];
      if (!a || !b) continue;
      const geom = edgeGeom(e);
      if (!geom) continue;
      const dim = edgeDimmed(e);
      const hot = hoverEdge === e;
      const alpha = dim ? 0.06 : hot ? 0.95 : 0.22 + e.w * 0.7;
      const width = (0.7 + e.w * 5.5) * (hot ? 1.35 : 1);
      const good = selected ? e.rawDelta >= 0 : false;
      const rgb = selected
        ? good
          ? "88, 186, 168"
          : "232, 112, 108"
        : "232, 112, 108";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(geom.cx, geom.cy, b.x, b.y);
      ctx.strokeStyle = "rgba(" + rgb + ", " + alpha + ")";
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.stroke();

      if ((!dim || hot) && (e.w > 0.35 || hot)) {
        const t = 0.78;
        const px = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * geom.cx + t * t * b.x;
        const py = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * geom.cy + t * t * b.y;
        const tx = 2 * (1 - t) * (geom.cx - a.x) + 2 * t * (b.x - geom.cx);
        const ty = 2 * (1 - t) * (geom.cy - a.y) + 2 * t * (b.y - geom.cy);
        const len = Math.sqrt(tx * tx + ty * ty) || 1;
        const ux = tx / len;
        const uy = ty / len;
        ctx.beginPath();
        ctx.moveTo(px - ux * 7 - uy * 4, py - uy * 7 + ux * 4);
        ctx.lineTo(px, py);
        ctx.lineTo(px - ux * 7 + uy * 4, py - uy * 7 - ux * 4);
        ctx.strokeStyle = "rgba(" + rgb + ", " + (alpha + 0.15) + ")";
        ctx.lineWidth = Math.max(1, width * 0.7);
        ctx.stroke();
      }
    }

    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      const dim = nodeDimmed(node.id);
      const active =
        node.id === selected ||
        node.id === hoverId ||
        (hoverEdge && (node.id === hoverEdge.source || node.id === hoverEdge.target));
      ctx.save();
      ctx.globalAlpha = dim ? 0.22 : 1;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
      ctx.fillStyle = "#10141a";
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.r - 1.5, 0, Math.PI * 2);
      ctx.clip();
      if (isDuo() && node.adc && node.sup) {
        const left = imgCache[node.adc];
        const right = imgCache[node.sup];
        const size = node.r * 2;
        const x0 = node.x - node.r;
        const y0 = node.y - node.r;
        if (left && left.complete && left.naturalWidth) {
          ctx.drawImage(left, x0, y0, size, size);
        } else {
          ctx.fillStyle = "#1c2430";
          ctx.fillRect(x0, y0, node.r, size);
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(node.x, y0, node.r, size);
        ctx.clip();
        if (right && right.complete && right.naturalWidth) {
          ctx.drawImage(right, x0, y0, size, size);
        } else {
          ctx.fillStyle = "#243040";
          ctx.fillRect(node.x, y0, node.r, size);
        }
        ctx.restore();
        ctx.beginPath();
        ctx.moveTo(node.x, y0);
        ctx.lineTo(node.x, y0 + size);
        ctx.strokeStyle = "rgba(16, 20, 26, 0.85)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        const img = imgCache[node.id];
        if (img && img.complete && img.naturalWidth) {
          ctx.drawImage(img, node.x - node.r, node.y - node.r, node.r * 2, node.r * 2);
        } else {
          ctx.fillStyle = "#1c2430";
          ctx.fillRect(node.x - node.r, node.y - node.r, node.r * 2, node.r * 2);
        }
      }
      ctx.restore();
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
      ctx.strokeStyle = active ? "rgba(238, 243, 246, 0.95)" : "rgba(197, 208, 216, 0.28)";
      ctx.lineWidth = active ? 2.4 : 1.2;
      ctx.stroke();
      if (node.r >= 20 || active || selected) {
        ctx.font = "600 10px Manrope, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = dim ? "rgba(238,241,244,0.25)" : "rgba(238,241,244,0.78)";
        const label = nodeLabel(node.id);
        const maxLen = isDuo() ? 16 : 10;
        ctx.fillText(
          label.length > maxLen ? label.slice(0, maxLen - 1) + "…" : label,
          node.x,
          node.y + node.r + 4
        );
      }
      ctx.restore();
    }
  }

  function loop() {
    stepSim();
    draw();
    raf = requestAnimationFrame(loop);
  }

  function startSim() {
    if (simRunning) return;
    simRunning = true;
    raf = requestAnimationFrame(loop);
  }

  function edgeGeom(e) {
    const a = nodeById[e.source];
    const b = nodeById[e.target];
    if (!a || !b) return null;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return { a: a, b: b, cx: mx + dy * 0.1, cy: my - dx * 0.1 };
  }

  function distToQuad(px, py, x0, y0, cx, cy, x1, y1) {
    let best = Infinity;
    for (let i = 0; i <= 24; i += 1) {
      const t = i / 24;
      const ox = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1;
      const oy = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
      const dx = px - ox;
      const dy = py - oy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < best) best = d;
    }
    return best;
  }

  function hitTestNode(x, y) {
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      const dx = n.x - x;
      const dy = n.y - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= n.r + 4 && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  function hitTestEdge(x, y) {
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < edges.length; i += 1) {
      const e = edges[i];
      if (edgeDimmed(e)) continue;
      const geom = edgeGeom(e);
      if (!geom) continue;
      const hitPad = Math.max(8, 4 + e.w * 4);
      const d = distToQuad(x, y, geom.a.x, geom.a.y, geom.cx, geom.cy, geom.b.x, geom.b.y);
      if (d <= hitPad && d < bestD) {
        best = e;
        bestD = d;
      }
    }
    return best;
  }

  function pointerPos(evt) {
    const rect = els.canvas.getBoundingClientRect();
    const src = evt.touches && evt.touches[0] ? evt.touches[0] : evt;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  function placeTooltip(x, y) {
    const pad = 12;
    const tw = els.tooltip.offsetWidth || 180;
    const th = els.tooltip.offsetHeight || 52;
    let left = x + 14;
    let top = y + 14;
    if (left + tw > view.w - pad) left = x - tw - 10;
    if (top + th > view.h - pad) top = y - th - 10;
    els.tooltip.style.left = Math.max(pad, left) + "px";
    els.tooltip.style.top = Math.max(pad, top) + "px";
  }

  function showNodeTooltip(node, x, y) {
    if (!node) {
      els.tooltip.hidden = true;
      return;
    }
    const pickRate = lastData && lastData.games ? node.picks / lastData.games : 0;
    els.tooltip.hidden = false;
    const synBit =
      isDuo() && node.delta != null && isFinite(node.delta)
        ? " · syn " + fmtDelta(node.delta)
        : "";
    els.tooltip.innerHTML =
      "<strong>" +
      nodeLabel(node.id) +
      "</strong><span>" +
      (isDuo() ? "ADC+SUP" : (node.role || "").toUpperCase()) +
      " · " +
      node.picks +
      " picks · " +
      fmtPct(pickRate) +
      " · WR " +
      fmtPct(node.wr) +
      synBit +
      "</span>";
    placeTooltip(x, y);
  }

  function showEdgeTooltip(edge, x, y) {
    if (!edge) {
      els.tooltip.hidden = true;
      return;
    }
    let adj = edge.rawDelta != null ? edge.rawDelta : edge.delta;
    let raw = edge.rawWrDelta != null ? edge.rawWrDelta : adj;
    let favor = edge.source;
    let under = edge.target;
    if (selected && (selected === edge.source || selected === edge.target)) {
      // Focus edges store rawDelta from the focused champ's POV.
      favor = selected;
      under = selected === edge.source ? edge.target : edge.source;
    } else if (adj < 0) {
      favor = edge.target;
      under = edge.source;
      adj = -adj;
      raw = -raw;
    }
    els.tooltip.hidden = false;
    els.tooltip.innerHTML =
      "<strong>" +
      nodeLabel(favor) +
      (adj >= 0 ? " beats " : " loses to ") +
      nodeLabel(under) +
      "</strong><span>" +
      "vs avg " +
      fmtDelta(adj) +
      " · raw " +
      fmtDelta(raw) +
      " · " +
      edge.games +
      "g</span>";
    placeTooltip(x, y);
  }

  function fillDetailList(ul, rows) {
    ul.textContent = "";
    if (!rows.length) {
      const li = document.createElement("li");
      li.className = "muted";
      li.textContent = isDuo()
        ? isPro()
          ? "No strong duo matchups in this filter."
          : "No related botlane duos in this filter."
        : "No strong counters in this filter.";
      ul.appendChild(li);
      return;
    }
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const li = document.createElement("li");
      const good = row.rawDelta >= 0;
      const verb = isDuo() && !isPro() ? (good ? "better syn" : "worse syn") : good ? "beats" : "loses to";
      const pair = parseDuo(row.other);
      const icons = pair
        ? '<img src="' +
          portrait(pair.adc) +
          '" alt="" /><img src="' +
          portrait(pair.sup) +
          '" alt="" />'
        : '<img src="' + portrait(row.other) + '" alt="" />';
      li.innerHTML =
        '<button type="button" data-id="' +
        row.other +
        '">' +
        icons +
        "<span>" +
        nodeLabel(row.other) +
        '</span><em class="' +
        (good ? "is-good" : "is-bad") +
        '">' +
        verb +
        " " +
        fmtDelta(row.rawDelta) +
        " · " +
        row.games +
        "g</em></button>";
      ul.appendChild(li);
    }
  }

  function matchupGames(us, them) {
    const want = ROLE_KEYS.indexOf(role.toLowerCase());
    const games = filteredGames();
    const out = [];
    for (let i = 0; i < games.length; i += 1) {
      const game = games[i];
      for (let r = 0; r < 5; r += 1) {
        if (want >= 0 && r !== want) continue;
        let side = "";
        if (game.b[r] === us && game.r[r] === them) side = "b";
        else if (game.r[r] === us && game.b[r] === them) side = "r";
        if (!side) continue;
        const win = side === "b" ? game.w === 1 : game.w === 0;
        const names = side === "b" ? game.bp : game.rp;
        const oppNames = side === "b" ? game.rp : game.bp;
        const pBlue = expectedBlueWin(game);
        const expected = side === "b" ? pBlue : 1 - pBlue;
        out.push({
          id: game.g,
          date: game.d,
          league: game.l,
          role: ROLE_KEYS[r],
          player: names[r] || "",
          oppPlayer: oppNames[r] || "",
          team: side === "b" ? game.bt : game.rt,
          opp: side === "b" ? game.rt : game.bt,
          win: win,
          expected: expected,
        });
      }
    }
    out.sort(function (a, b) {
      return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
    });
    return out;
  }

  function clearHistory() {
    historyPair = null;
    if (els.detailHistory) els.detailHistory.hidden = true;
    if (els.detailCounters) els.detailCounters.hidden = false;
  }

  function openMatchupHistory(us, them) {
    if (!us || !them) return;
    if (!isPro()) {
      historyPair = { us: us, them: them };
      if (els.detailCounters) els.detailCounters.hidden = true;
      if (els.detailHistory) els.detailHistory.hidden = false;
      els.historyTitle.textContent = champName(us) + " vs " + champName(them);
      els.historySub.textContent = "Solo queue uses LoLalytics aggregates — no individual game log.";
      els.historyList.textContent = "";
      const li = document.createElement("li");
      li.className = "muted";
      li.textContent = "Switch to Pro for Oracle's Elixir match history.";
      els.historyList.appendChild(li);
      return;
    }
    let pov = us;
    let foe = them;
    if (selected === them) {
      pov = them;
      foe = us;
    } else if (selected && selected !== us) {
      selected = us;
      pov = us;
      foe = them;
      historyPair = { us: pov, them: foe };
      syncUrl();
      refresh();
      return;
    } else if (!selected) {
      selected = us;
      historyPair = { us: pov, them: foe };
      syncUrl();
      refresh();
      return;
    }
    historyPair = { us: pov, them: foe };
    renderDetail(lastData || tally(filteredGames()));
  }

  function renderHistory() {
    if (!historyPair || !els.detailHistory) {
      if (els.detailHistory) els.detailHistory.hidden = true;
      if (els.detailCounters) els.detailCounters.hidden = false;
      return;
    }
    const us = historyPair.us;
    const them = historyPair.them;
    const rows = matchupGames(us, them);
    let wins = 0;
    let adjSum = 0;
    let expSum = 0;
    for (let i = 0; i < rows.length; i += 1) {
      if (rows[i].win) wins += 1;
      adjSum += (rows[i].win ? 1 : 0) - rows[i].expected;
      expSum += rows[i].expected;
    }
    const rawD = delta(wins, rows.length);
    const skillD = rows.length ? (adjSum / rows.length) * 100 : 0;
    const baseD = lastData ? baseAdj(lastData.stats, us) : 0;
    const relD = skillD - baseD;
    const expWr = rows.length ? expSum / rows.length : 0.5;
    els.detailCounters.hidden = true;
    els.detailHistory.hidden = false;
    els.historyTitle.textContent = champName(us) + " vs " + champName(them);
    els.historySub.textContent =
      rows.length +
      " " +
      role +
      " games · " +
      wins +
      "–" +
      (rows.length - wins) +
      " · vs avg " +
      fmtDelta(relD) +
      " (raw " +
      fmtDelta(rawD) +
      ", baseline " +
      fmtDelta(baseD) +
      ", exp " +
      fmtPct(expWr) +
      ")";
    els.historyList.textContent = "";
    if (!rows.length) {
      const li = document.createElement("li");
      li.className = "muted";
      li.textContent = "No lane matchups in this filter.";
      els.historyList.appendChild(li);
      return;
    }
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const li = document.createElement("li");
      li.innerHTML =
        '<a class="bubble-history-row" href="match.html?g=' +
        encodeURIComponent(row.id) +
        "&champ=" +
        encodeURIComponent(us) +
        '">' +
        '<span class="bubble-history-result ' +
        (row.win ? "is-good" : "is-bad") +
        '">' +
        (row.win ? "W" : "L") +
        "</span>" +
        '<span class="bubble-history-main">' +
        "<strong>" +
        row.team +
        " vs " +
        row.opp +
        "</strong>" +
        "<em>" +
        row.date +
        " · " +
        row.league +
        (row.player ? " · " + row.player : "") +
        " · exp " +
        fmtPct(row.expected) +
        "</em>" +
        "</span>" +
        '<img src="' +
        portrait(them) +
        '" alt="" />' +
        "</a>";
      els.historyList.appendChild(li);
    }
  }

  function renderDetail(data) {
    if (!selected || !data || !data.stats[selected]) {
      els.detail.hidden = true;
      clearHistory();
      return;
    }
    const st = data.stats[selected];
    els.detail.hidden = false;
    const pair = parseDuo(selected);
    els.detailIcon.src = portrait(pair ? pair.adc : selected);
    els.detailName.textContent = nodeLabel(selected);
    const listTitle = document.getElementById("bubble-detail-list-title");
    if (listTitle) {
      listTitle.textContent = isDuo() ? (isPro() ? "Duo matchups" : "Related duos") : "Counters";
    }
    const synBit =
      isDuo() && st.delta != null && isFinite(st.delta) ? " · syn " + fmtDelta(st.delta) : "";
    els.detailSub.textContent =
      (isDuo() ? "ADC+SUP" : role) +
      " · " +
      st.picks +
      " picks · WR " +
      fmtPct(st.picks ? st.wins / st.picks : 0) +
      (isDuo() ? synBit : " · baseline " + fmtDelta(baseAdj(data.stats, selected)));
    const rows = counterLinksFor(selected, data.matchups, data.stats, {
      requireStrength: false,
    }).slice();
    rows.sort(function (a, b) {
      return isDuo() && !isPro() ? b.games - a.games : a.rawDelta - b.rawDelta;
    });
    fillDetailList(els.detailVs, rows.slice(0, 16));
    if (historyPair) {
      if (historyPair.us !== selected && historyPair.them !== selected) clearHistory();
      else if (historyPair.them === selected) {
        historyPair = { us: selected, them: historyPair.us };
      } else if (historyPair.us !== selected) {
        historyPair = { us: selected, them: historyPair.them };
      }
    }
    renderHistory();
  }

  function syncSourceUi() {
    const pro = isPro();
    const duo = isDuo();
    if (els.leagues) els.leagues.hidden = !pro;
    if (els.windows) els.windows.hidden = !pro;
    if (els.roles) els.roles.hidden = duo;
    if (els.kicker) {
      els.kicker.textContent = duo
        ? pro
          ? "Pro bot duos"
          : "Solo bot duos"
        : pro
          ? "Pro network"
          : "Solo network";
    }
    if (els.hint) {
      let base;
      if (duo) {
        base = pro
          ? "Bubble size = duo pick rate. Edges are botlane H2H vs each duo’s baseline. Green = good for the focused duo."
          : "Bubble size = duo games. Solo links related botlanes that share an ADC or support (synergy Δ).";
      } else {
        base = pro
          ? "Bubble size = pick rate. Pro counters are skill-adjusted then compared to each champ’s own baseline. Green = good for the focused champ, red = bad."
          : "Bubble size = pick rate. Solo counters come from LoLalytics and are compared to each champ’s lane baseline. Green = good for the focused champ, red = bad.";
      }
      els.hint.textContent = showNetwork
        ? base + " Network adds significant links among the others."
        : base;
    }
    if (els.search) {
      els.search.placeholder = duo
        ? "Search or focus a botlane duo"
        : "Search or focus a champion";
    }
  }

  function refresh() {
    syncSourceUi();
    if (selected && lastData && lastData.kind === "duo" && !isDuo()) selected = "";
    if (selected && lastData && lastData.kind !== "duo" && isDuo()) selected = "";
    const games = isPro() ? filteredGames() : [];
    const data = tally(games);
    lastData = data;
    if (selected && !data.stats[selected]) selected = "";
    buildGraph(data);
    if (isPro()) {
      const winLabel = RIFT_WINDOW.key === "season" ? "Season" : RIFT_WINDOW.days + "d";
      els.range.textContent =
        data.games.toLocaleString() +
        " games · " +
        (league === "All" ? "All leagues" : league) +
        " · " +
        winLabel +
        (isDuo() ? " · ADC+SUP" : "") +
        (selected ? " · " + nodeLabel(selected) : "");
    } else {
      const wr = window.RIFT_WINRATES || {};
      const patchBit = wr.patch || wr.patch_query || wr.tier || "";
      els.range.textContent =
        Math.round(data.games).toLocaleString() +
        " games · LoLalytics" +
        (patchBit ? " · " + patchBit : "") +
        (isDuo() ? " · ADC+SUP" : "") +
        (selected ? " · " + nodeLabel(selected) : "");
    }
    renderDetail(data);
    startSim();
  }

  function renderChips(root, items, active, onPick) {
    root.textContent = "";
    for (let i = 0; i < items.length; i += 1) {
      const value = items[i];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = value;
      if (value === active) btn.classList.add("active");
      btn.addEventListener("click", function () {
        onPick(value);
      });
      root.appendChild(btn);
    }
  }

  function syncUrl() {
    const url = new URL(location.href);
    url.searchParams.set("source", source);
    if (isPro()) {
      url.searchParams.set("league", league);
      url.searchParams.set("window", RIFT_WINDOW.param());
    } else {
      url.searchParams.delete("league");
      url.searchParams.delete("window");
    }
    url.searchParams.set("view", viewMode);
    if (!isDuo()) url.searchParams.set("role", role);
    else url.searchParams.delete("role");
    url.searchParams.set("n", String(topN));
    url.searchParams.set("min", String(minGames));
    if (showNetwork) url.searchParams.set("net", "1");
    else url.searchParams.delete("net");
    if (selected) url.searchParams.set("champ", selected);
    else url.searchParams.delete("champ");
    url.searchParams.delete("patch");
    url.searchParams.delete("links");
    history.replaceState({}, "", url);
  }

  function readUrl() {
    const url = new URL(location.href);
    const src = url.searchParams.get("source");
    source = src === "solo" || src === "normal" ? "solo" : "pro";
    const view = url.searchParams.get("view");
    viewMode = view === "duo" ? "duo" : "champ";
    const lg = url.searchParams.get("league");
    const rl = url.searchParams.get("role");
    league = LEAGUES.indexOf(lg) >= 0 ? lg : "All";
    role = ROLES.indexOf(rl) >= 0 ? rl : "MID";
    topN = Math.max(1, Math.min(60, Number(url.searchParams.get("n")) || 36));
    minGames = Math.max(4, Math.min(24, Number(url.searchParams.get("min")) || 8));
    showNetwork = url.searchParams.get("net") === "1";
    selected = url.searchParams.get("champ") || "";
    RIFT_WINDOW.init(url.searchParams.get("window") || "60");
    els.topn.value = String(topN);
    els.topnVal.textContent = String(topN);
    els.minGames.value = String(minGames);
    els.minGamesVal.textContent = String(minGames);
  }

  function searchHits(q) {
    const needle = q.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!needle) return [];
    const out = [];
    if (isDuo() && lastData && lastData.stats) {
      const ids = Object.keys(lastData.stats);
      for (let i = 0; i < ids.length; i += 1) {
        const id = ids[i];
        const pair = parseDuo(id);
        if (!pair) continue;
        const label = duoLabel(id)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
        const a = pair.adc.toLowerCase();
        const s = pair.sup.toLowerCase();
        if (
          label.indexOf(needle) !== -1 ||
          a.indexOf(needle) !== -1 ||
          s.indexOf(needle) !== -1
        ) {
          out.push(id);
        }
      }
      out.sort(function (a, b) {
        const pa = lastData.stats[a].picks || 0;
        const pb = lastData.stats[b].picks || 0;
        return pb - pa || duoLabel(a).localeCompare(duoLabel(b));
      });
      return out.slice(0, 10);
    }
    champMap.forEach(function (champ, id) {
      const slug = String(champ.name || id)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      if (slug.indexOf(needle) !== -1 || id.toLowerCase().indexOf(needle) !== -1) {
        out.push(id);
      }
    });
    out.sort(function (a, b) {
      const pa = (lastData && lastData.stats[a] && lastData.stats[a].picks) || 0;
      const pb = (lastData && lastData.stats[b] && lastData.stats[b].picks) || 0;
      return pb - pa || champName(a).localeCompare(champName(b));
    });
    return out.slice(0, 10);
  }

  function renderSearchMenu() {
    const hits = searchHits(search);
    els.searchMenu.textContent = "";
    if (!hits.length || !search.trim()) {
      els.searchMenu.hidden = true;
      return;
    }
    for (let i = 0; i < hits.length; i += 1) {
      const id = hits[i];
      const btn = document.createElement("button");
      btn.type = "button";
      const pair = parseDuo(id);
      if (pair) {
        btn.innerHTML =
          '<img src="' +
          portrait(pair.adc) +
          '" alt="" /><img src="' +
          portrait(pair.sup) +
          '" alt="" /><span>' +
          duoLabel(id) +
          "</span>";
      } else {
        btn.innerHTML = '<img src="' + portrait(id) + '" alt="" /><span>' + champName(id) + "</span>";
      }
      btn.addEventListener("click", function () {
        focusChamp(id);
        search = "";
        els.search.value = "";
        els.searchMenu.hidden = true;
      });
      els.searchMenu.appendChild(btn);
    }
    els.searchMenu.hidden = false;
  }

  function focusChamp(id) {
    selected = id || "";
    if (!selected) clearHistory();
    else if (historyPair && historyPair.us !== selected && historyPair.them !== selected) {
      clearHistory();
    }
    syncUrl();
    refresh();
  }

  function wireCanvas() {
    let edgeClick = null;
    els.canvas.addEventListener("pointerdown", function (evt) {
      const p = pointerPos(evt);
      const hit = hitTestNode(p.x, p.y);
      edgeClick = null;
      if (hit) {
        drag = { id: hit.id, ox: p.x - hit.x, oy: p.y - hit.y, moved: false };
        els.canvas.setPointerCapture(evt.pointerId);
        return;
      }
      const edge = hitTestEdge(p.x, p.y);
      if (edge) {
        edgeClick = { edge: edge, x: p.x, y: p.y };
        els.canvas.setPointerCapture(evt.pointerId);
        return;
      }
      if (historyPair) {
        clearHistory();
        renderDetail(lastData || tally(filteredGames()));
        return;
      }
      if (selected) focusChamp("");
    });
    els.canvas.addEventListener("pointermove", function (evt) {
      const p = pointerPos(evt);
      if (drag) {
        const node = nodeById[drag.id];
        if (node) {
          node.x = p.x - drag.ox;
          node.y = p.y - drag.oy;
          drag.moved = true;
        }
        hoverEdge = null;
        showNodeTooltip(nodeById[drag.id], p.x, p.y);
        return;
      }
      if (edgeClick) {
        const dx = p.x - edgeClick.x;
        const dy = p.y - edgeClick.y;
        if (dx * dx + dy * dy > 36) edgeClick.moved = true;
        return;
      }
      const hit = hitTestNode(p.x, p.y);
      if (hit) {
        hoverId = hit.id;
        hoverEdge = null;
        els.canvas.style.cursor = "pointer";
        showNodeTooltip(hit, p.x, p.y);
        return;
      }
      hoverId = "";
      const edge = hitTestEdge(p.x, p.y);
      hoverEdge = edge;
      els.canvas.style.cursor = edge ? "pointer" : "default";
      showEdgeTooltip(edge, p.x, p.y);
    });
    els.canvas.addEventListener("pointerup", function () {
      if (drag && !drag.moved) {
        clearHistory();
        focusChamp(selected === drag.id ? "" : drag.id);
      } else if (drag && lastData) {
        renderDetail(lastData);
      } else if (edgeClick && !edgeClick.moved) {
        const e = edgeClick.edge;
        const us = selected && (selected === e.source || selected === e.target) ? selected : e.source;
        const them = us === e.source ? e.target : e.source;
        if (isDuo()) focusChamp(them);
        else openMatchupHistory(us, them);
      }
      drag = null;
      edgeClick = null;
    });
    els.canvas.addEventListener("pointerleave", function () {
      hoverId = "";
      hoverEdge = null;
      els.tooltip.hidden = true;
    });
  }

  function boot() {
    const data = window.RIFT_DRAFT_DATA;
    if (!data || !data.champions) throw new Error("Missing champion data");
    patch = data.patch || "";
    champMap = new Map(
      data.champions.map(function (champ) {
        return [champ.id, champ];
      })
    );
    bundle = window.RIFT_PRO_GAMES || bundle;
    if (!bundle.games || !bundle.games.length) throw new Error("Missing pro game logs");
    bundle.to = bundle.to || (bundle.games[0] && bundle.games[0].d) || "";
    if (!window.RIFT_WINRATES || !window.RIFT_COUNTERS) {
      throw new Error("Missing solo queue winrates/counters");
    }
    if (!window.RIFT_SYNERGIES) {
      throw new Error("Missing solo queue synergies");
    }

    readUrl();
    if (els.views) {
      els.views.textContent = "";
      for (let i = 0; i < VIEWS.length; i += 1) {
        const item = VIEWS[i];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = item.label;
        btn.title = item.id === "duo" ? "ADC + Support botlane duos" : "Single-champion counter network";
        if (item.id === viewMode) btn.classList.add("active");
        btn.addEventListener("click", function () {
          if (viewMode === item.id) return;
          viewMode = item.id;
          selected = "";
          clearHistory();
          if (els.views) {
            const kids = els.views.querySelectorAll("button");
            for (let k = 0; k < kids.length; k += 1) {
              kids[k].classList.toggle("active", kids[k].textContent === item.label);
            }
          }
          syncUrl();
          refresh();
        });
        els.views.appendChild(btn);
      }
    }
    if (els.sources) {
      els.sources.textContent = "";
      for (let i = 0; i < SOURCES.length; i += 1) {
        const item = SOURCES[i];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = item.label;
        btn.title =
          item.id === "pro"
            ? "Oracle's Elixir pro games (skill-adjusted)"
            : "LoLalytics solo queue matchups";
        if (item.id === source) btn.classList.add("active");
        btn.addEventListener("click", function () {
          if (source === item.id) return;
          source = item.id;
          clearHistory();
          syncUrl();
          if (els.sources) {
            const kids = els.sources.querySelectorAll("button");
            for (let k = 0; k < kids.length; k += 1) {
              kids[k].classList.toggle("active", kids[k].textContent === item.label);
            }
          }
          refresh();
        });
        els.sources.appendChild(btn);
      }
    }
    renderChips(els.leagues, LEAGUES, league, function (v) {
      league = v;
      syncUrl();
      refresh();
    });
    renderChips(els.roles, ROLES, role, function (v) {
      role = v;
      syncUrl();
      refresh();
    });
    RIFT_WINDOW.mount(els.windows, function () {
      syncUrl();
      refresh();
    });
    function renderNetworkChip() {
      if (!els.network) return;
      renderChips(els.network, ["Network"], showNetwork ? "Network" : "", function () {
        showNetwork = !showNetwork;
        renderNetworkChip();
        syncSourceUi();
        syncUrl();
        refresh();
      });
    }
    renderNetworkChip();

    els.topn.addEventListener("input", function () {
      topN = Number(els.topn.value);
      els.topnVal.textContent = String(topN);
    });
    els.topn.addEventListener("change", function () {
      syncUrl();
      refresh();
    });
    els.minGames.addEventListener("input", function () {
      minGames = Number(els.minGames.value);
      els.minGamesVal.textContent = String(minGames);
    });
    els.minGames.addEventListener("change", function () {
      syncUrl();
      refresh();
    });
    els.search.addEventListener("input", function () {
      search = els.search.value;
      renderSearchMenu();
    });
    els.detailClear.addEventListener("click", function () {
      focusChamp("");
    });
    if (els.historyClear) {
      els.historyClear.addEventListener("click", function () {
        clearHistory();
        renderDetail(lastData || tally(filteredGames()));
      });
    }
    els.detailVs.addEventListener("click", function (evt) {
      const btn = evt.target.closest("button[data-id]");
      if (!btn) return;
      const them = btn.getAttribute("data-id");
      if (isDuo()) focusChamp(them);
      else if (selected && them) openMatchupHistory(selected, them);
      else focusChamp(them);
    });

    wireCanvas();
    window.addEventListener("resize", resize);
    els.boot.hidden = true;
    els.app.hidden = false;
    resize();
    refresh();
    requestAnimationFrame(resize);
  }

  try {
    boot();
  } catch (err) {
    console.error(err);
    if (els.bootStatus) els.bootStatus.textContent = String(err.message || err);
  }

})();
