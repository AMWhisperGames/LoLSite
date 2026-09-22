(function (root) {
  // Locked via ratings/tune_predict.py (60d primary, 30d + Brier tie-break).
  // Draft weight is 0: both LoLalytics and leave-one-out OE hurt once team+comfort are tuned.
  const ELO_SCALE = 400;
  const ELO_MULT = 0;
  const SYN_MULT = 0;
  const PAIR_PRIOR = 400;
  const OE_PAIR_PRIOR = 40;
  const TEAM_SCORE_ELO = 18;
  const CHAMP_SCORE_ELO = 9;
  const BLUE_SIDE_ELO = 10;
  const CHAMP_SCORE_CLAMP = 15;
  const CHAMP_RESIDUAL_CLAMP = 5;
  const CHAMP_MIN_GAMES = 6;
  const ROLE_KEYS = ["top", "jng", "mid", "adc", "sup"];

  function matchups() {
    return (root.RIFT_COUNTERS && root.RIFT_COUNTERS.matchups) || {};
  }

  function oeMatchups() {
    return (root.RIFT_ORACLES && root.RIFT_ORACLES.matchups) || {};
  }

  function synergies() {
    return (root.RIFT_SYNERGIES && root.RIFT_SYNERGIES.synergies) || {};
  }

  function ratings() {
    return (root.RIFT_PLAYER_RATINGS && root.RIFT_PLAYER_RATINGS.roles) || {};
  }

  function champLadders() {
    return (root.RIFT_PLAYER_RATINGS && root.RIFT_PLAYER_RATINGS.champs) || {};
  }

  function champSlug(id) {
    return String(id || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function clampScore(value) {
    const n = Number(value);
    if (!isFinite(n)) return null;
    return Math.max(-CHAMP_SCORE_CLAMP, Math.min(CHAMP_SCORE_CLAMP, n));
  }

  function playerKey(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/\s+/g, "");
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

  function lookupMatchup(map, us, them) {
    const direct = map[us] && map[us][them];
    if (direct && typeof direct.delta === "number") {
      return { delta: direct.delta, games: direct.games || 0, source: "direct" };
    }
    const inverse = map[them] && map[them][us];
    if (inverse && typeof inverse.delta === "number") {
      return { delta: -inverse.delta, games: inverse.games || 0, source: "inverse" };
    }
    return null;
  }

  // Solo-queue counters — used by draft recommendation scoring.
  function matchupRec(us, them) {
    return lookupMatchup(matchups(), us, them);
  }

  // Pro matchups prefer Oracle's Elixir, fall back to LoLalytics.
  function proMatchupRec(us, them) {
    const oe = lookupMatchup(oeMatchups(), us, them);
    if (oe && oe.games >= 3) return { delta: oe.delta, games: oe.games, prior: OE_PAIR_PRIOR, source: "oe" };
    const solo = lookupMatchup(matchups(), us, them);
    if (!solo) return null;
    return { delta: solo.delta, games: solo.games, prior: PAIR_PRIOR, source: "solo" };
  }

  function synergyRec(us, them) {
    const map = synergies();
    const direct = map[us] && map[us][them];
    if (direct && typeof direct.delta === "number") return direct;
    const inverse = map[them] && map[them][us];
    if (inverse && typeof inverse.delta === "number") return inverse;
    return null;
  }

  function laneWeight(usRole, themRole) {
    if (usRole && themRole) {
      return String(usRole).toLowerCase() === String(themRole).toLowerCase() ? 1 : 0.2;
    }
    return 0.35;
  }

  function pairingOf(rows) {
    let eloNum = 0;
    let deltaNum = 0;
    let den = 0;
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        const entry = synergyRec(rows[i].id, rows[j].id);
        if (!entry) continue;
        const games = entry.games || 0;
        const conf = games / (games + PAIR_PRIOR);
        eloNum += eloFromDelta(entry.delta) * conf;
        deltaNum += entry.delta * conf;
        den += conf;
      }
    }
    return { elo: den ? eloNum / den : 0, delta: den ? deltaNum / den : 0 };
  }

  function counterOf(usRows, themRows, preferPro) {
    let eloNum = 0;
    let deltaNum = 0;
    let den = 0;
    for (let i = 0; i < usRows.length; i += 1) {
      for (let j = 0; j < themRows.length; j += 1) {
        const us = usRows[i];
        const them = themRows[j];
        const rec = preferPro ? proMatchupRec(us.id, them.id) : matchupRec(us.id, them.id);
        if (!rec) continue;
        const prior = rec.prior != null ? rec.prior : PAIR_PRIOR;
        const conf = rec.games / (rec.games + prior);
        const weight = laneWeight(us.role, them.role) * Math.max(conf, preferPro ? 0.05 : 0.15);
        eloNum += eloFromDelta(rec.delta) * weight;
        deltaNum += rec.delta * weight;
        den += weight;
      }
    }
    return { elo: den ? eloNum / den : 0, delta: den ? deltaNum / den : 0 };
  }

  function lineupExpect(blue, red) {
    const counter = counterOf(blue || [], red || [], true);
    const pairBlue = pairingOf(blue || []);
    const pairRed = pairingOf(red || []);
    const elo = counter.elo * ELO_MULT + (pairBlue.elo - pairRed.elo) * SYN_MULT;
    return {
      elo: elo,
      counter: counter.delta,
      pairing: pairBlue.delta - pairRed.delta,
    };
  }

  function playerScore(name, role) {
    const key = playerKey(name);
    if (!key) return null;
    const roles = ratings();
    const roleName = String(role || "").toLowerCase();
    if (roleName && roles[roleName] && roles[roleName][key] && roles[roleName][key].s != null) {
      return roles[roleName][key].s;
    }
    let best = null;
    for (let i = 0; i < ROLE_KEYS.length; i += 1) {
      const rec = roles[ROLE_KEYS[i]] && roles[ROLE_KEYS[i]][key];
      if (!rec || rec.s == null) continue;
      if (best == null || rec.s > best) best = rec.s;
    }
    return best;
  }

  function playerChampScore(name, champId) {
    const key = playerKey(name);
    if (!key || !champId) return null;
    const rec = champLadders()[champSlug(champId)];
    const rows = rec && rec.players;
    if (!rows) return null;
    for (let i = 0; i < rows.length; i += 1) {
      if (playerKey(rows[i].n) === key) {
        if ((rows[i].g || 0) < CHAMP_MIN_GAMES) return null;
        return clampScore(rows[i].s);
      }
    }
    return null;
  }

  function champResidual(name, role, champId) {
    const champ = playerChampScore(name, champId);
    const overall = playerScore(name, role);
    if (champ == null || overall == null || !isFinite(overall)) return null;
    const raw = champ - overall;
    return Math.max(-CHAMP_RESIDUAL_CLAMP, Math.min(CHAMP_RESIDUAL_CLAMP, raw));
  }

  function champLineupElo(blue, red) {
    const byRole = function (rows) {
      const map = {};
      for (let i = 0; i < (rows || []).length; i += 1) {
        const role = String(rows[i].role || "").toLowerCase();
        if (role) map[role] = rows[i];
      }
      return map;
    };
    const us = byRole(blue);
    const them = byRole(red);
    let sum = 0;
    for (let i = 0; i < ROLE_KEYS.length; i += 1) {
      const role = ROLE_KEYS[i];
      const b = us[role];
      const r = them[role];
      const bHit = b ? champResidual(b.name, b.role, b.id) : null;
      const rHit = r ? champResidual(r.name, r.role, r.id) : null;
      if (bHit == null && rHit == null) continue;
      sum += (bHit || 0) - (rHit || 0);
    }
    return (sum / ROLE_KEYS.length) * CHAMP_SCORE_ELO;
  }

  function rosterScore(rows) {
    let num = 0;
    let den = 0;
    for (let i = 0; i < (rows || []).length; i += 1) {
      const score = playerScore(rows[i].name, rows[i].role);
      if (score == null || !isFinite(score)) continue;
      num += score;
      den += 1;
    }
    if (!den) return null;
    return num / den;
  }

  const DRAFT_WEIGHTS = { wr: 1, pop: 1, safety: 1, counter: 2, pairing: 2, ban: 1.5, forced: 1.5 };
  const POWER_PRIOR_GAMES = 4000;
  const POPULARITY_SCALE = 4.7;
  const PAIR_PRIOR_GAMES = 400;
  const UNIQUE_ROLE_SCALE = 8;
  const SHARP_COUNTER_DELTA = -2;
  const BAN_MASTERY_SCALE = 0.25;
  let draftMemo = null;

  function winrates() {
    return root.RIFT_WINRATES || {};
  }

  function oracles() {
    return root.RIFT_ORACLES || {};
  }

  function oePicks() {
    const rec = oracles();
    if (rec.recent && rec.recent.picks) return rec.recent.picks;
    return rec.positions || {};
  }

  function rebuildDraftMemo() {
    const counters = matchups();
    const positions = oracles().positions || {};
    const picks = oePicks();
    const champGames = {};
    const ids = Object.keys(counters);
    for (let i = 0; i < ids.length; i += 1) {
      const vs = counters[ids[i]] || {};
      const opp = Object.keys(vs);
      let total = 0;
      for (let j = 0; j < opp.length; j += 1) {
        if (vs[opp[j]] && typeof vs[opp[j]].games === "number") total += vs[opp[j]].games;
      }
      champGames[ids[i]] = total;
    }
    const roleRates = {};
    const posIds = Object.keys(positions);
    for (let i = 0; i < posIds.length; i += 1) {
      const counts = positions[posIds[i]] || {};
      let total = 0;
      for (let r = 0; r < ROLE_KEYS.length; r += 1) total += counts[ROLE_KEYS[r]] || 0;
      if (!total) continue;
      const rates = {};
      let primary = ROLE_KEYS[0];
      let best = -1;
      for (let r = 0; r < ROLE_KEYS.length; r += 1) {
        const key = ROLE_KEYS[r];
        const rate = (counts[key] || 0) / total;
        rates[key] = rate;
        if (rate > best) {
          best = rate;
          primary = key;
        }
      }
      roleRates[posIds[i]] = { rates: rates, primary: primary };
    }
    const popPrior = {};
    for (let r = 0; r < ROLE_KEYS.length; r += 1) {
      const role = ROLE_KEYS[r];
      const counts = [];
      const champIds = Object.keys(picks);
      for (let i = 0; i < champIds.length; i += 1) {
        const n = (picks[champIds[i]] && picks[champIds[i]][role]) || 0;
        if (n) counts.push(n);
      }
      counts.sort(function (a, b) {
        return a - b;
      });
      const median = counts.length ? counts[Math.floor(counts.length / 2)] : 20;
      popPrior[role] = Math.max(8, median);
    }
    draftMemo = { champGames: champGames, roleRates: roleRates, picks: picks, popPrior: popPrior, blind: {} };
    return draftMemo;
  }

  function draftIndex() {
    return draftMemo || rebuildDraftMemo();
  }

  function laneEntry(id, role) {
    const lanes = winrates().lanes || {};
    const lane = lanes[role];
    return (lane && lane.champs && lane.champs[id]) || null;
  }

  function champPower(id, role) {
    const lanes = winrates().lanes || {};
    const lane = lanes[role];
    const entry = laneEntry(id, role);
    if (!lane || !entry || typeof entry.wr !== "number") return 0;
    const avg = typeof lane.avg_wr === "number" ? lane.avg_wr : 50;
    const games = entry.games || 0;
    return (entry.wr - avg) * (games / (games + POWER_PRIOR_GAMES));
  }

  function champPop(id, role) {
    const idx = draftIndex();
    const n = (idx.picks[id] && idx.picks[id][role]) || 0;
    const prior = idx.popPrior[role] || 20;
    return POPULARITY_SCALE * (n / (n + prior));
  }

  function champSafety(id, role) {
    const vs = matchups()[id];
    if (!vs) return 0;
    const oppIds = Object.keys(vs);
    let deltaSum = 0;
    let weightSum = 0;
    let sharpWeight = 0;
    for (let i = 0; i < oppIds.length; i += 1) {
      const them = oppIds[i];
      if (them === id) continue;
      const threat = laneEntry(them, role);
      if (!threat || (threat.lane_pct || 0) < 8) continue;
      const rec = matchupRec(id, them);
      if (!rec) continue;
      const weight = threat.games || 0;
      if (weight <= 0) continue;
      deltaSum += rec.delta * weight;
      weightSum += weight;
      if (rec.delta <= SHARP_COUNTER_DELTA) sharpWeight += weight;
    }
    if (!weightSum) return 0;
    return deltaSum / weightSum - 2.2 * (sharpWeight / weightSum);
  }

  function matchupPopWeight(us, them, games) {
    const totals = draftIndex().champGames;
    const usTotal = totals[us] || 0;
    const themTotal = totals[them] || 0;
    const shareUs = usTotal > 0 && games ? games / usTotal : 0;
    const shareThem = themTotal > 0 && games ? games / themTotal : 0;
    const geo =
      shareUs > 0 && shareThem > 0 ? Math.sqrt(shareUs * shareThem) : shareUs || shareThem;
    return 0.95 + 0.1 * Math.max(0, Math.min(1, geo / 0.03));
  }

  function positionWeight(id, role) {
    const info = draftIndex().roleRates[id];
    const overlap = info && info.rates ? info.rates[role] || 0 : 0;
    return 0.4 + 0.6 * overlap;
  }

  function champBlind(id, role) {
    const idx = draftIndex();
    const key = id + "|" + role;
    if (idx.blind[key]) return idx.blind[key];
    const rec = {
      power: champPower(id, role),
      pop: champPop(id, role),
      safety: champSafety(id, role),
    };
    idx.blind[key] = rec;
    return rec;
  }

  function pickCounter(id, role, enemies) {
    let sum = 0;
    for (let i = 0; i < enemies.length; i += 1) {
      const them = enemies[i];
      if (!them || !them.id) continue;
      const rec = matchupRec(id, them.id);
      if (!rec) continue;
      sum += rec.delta * matchupPopWeight(id, them.id, rec.games) * positionWeight(id, role);
    }
    return sum;
  }

  function pickPairing(id, allies) {
    let sum = 0;
    for (let i = 0; i < allies.length; i += 1) {
      const them = allies[i];
      if (!them || !them.id || them.id === id) continue;
      const entry = synergyRec(id, them.id);
      if (!entry || typeof entry.delta !== "number") continue;
      const games = entry.games || 0;
      sum += entry.delta * (games / (games + PAIR_PRIOR_GAMES));
    }
    return sum;
  }

  function pickUnique(id, role, allies) {
    const info = draftIndex().roleRates[id];
    const rates = (info && info.rates) || {};
    const filled = { top: 0, jng: 0, mid: 0, adc: 0, sup: 0 };
    for (let i = 0; i < allies.length; i += 1) {
      const key = String((allies[i] && allies[i].role) || "").toLowerCase();
      if (key && filled[key] != null && key !== role) filled[key] += 1;
    }
    let overlap = 0;
    for (let i = 0; i < ROLE_KEYS.length; i += 1) {
      const key = ROLE_KEYS[i];
      overlap += (rates[key] || 0) * (filled[key] || 0);
    }
    return -UNIQUE_ROLE_SCALE * overlap;
  }

  function champPrimaryRole(id) {
    const info = draftIndex().roleRates[id];
    return (info && info.primary) || "";
  }

  function banMasteryOf(id, enemies) {
    let best = null;
    for (let i = 0; i < (enemies || []).length; i += 1) {
      const row = enemies[i];
      if (!row || !row.name) continue;
      const score = playerChampScore(row.name, id);
      if (score == null || !isFinite(score)) continue;
      if (best == null || score > best) best = score;
    }
    return best == null ? 0 : best * BAN_MASTERY_SCALE;
  }

  function scoreBans(bans, us, them) {
    let threat = 0;
    let deny = 0;
    let mastery = 0;
    let n = 0;
    for (let i = 0; i < (bans || []).length; i += 1) {
      const id = bans[i];
      if (!id) continue;
      threat += pickCounter(id, champPrimaryRole(id), us);
      deny += pickPairing(id, them);
      mastery += banMasteryOf(id, them);
      n += 1;
    }
    if (!n) return { ban: 0, threat: 0, deny: 0, mastery: 0 };
    return {
      ban: (threat + deny + mastery) / n,
      threat: threat / n,
      deny: deny / n,
      mastery: mastery / n,
    };
  }

  function draftQuality(us, them, bans, theirBans) {
    us = us || [];
    them = them || [];
    if (us.length < 3 || them.length < 3) return null;
    draftIndex();
    let wr = 0;
    let pop = 0;
    let safety = 0;
    let counter = 0;
    let pairing = 0;
    let n = 0;
    for (let i = 0; i < us.length; i += 1) {
      const row = us[i];
      if (!row || !row.id) continue;
      const role = String(row.role || "").toLowerCase();
      if (!role) continue;
      const blind = champBlind(row.id, role);
      wr += blind.power;
      pop += blind.pop;
      safety += blind.safety;
      counter += pickCounter(row.id, role, them);
      pairing += pickPairing(row.id, us);
      n += 1;
    }
    if (!n) return null;
    wr /= n;
    pop /= n;
    safety /= n;
    counter /= n;
    pairing /= n;
    const bansRec = scoreBans(bans, us, them);
    const forcedRec = scoreBans(theirBans, them, us);
    const w = DRAFT_WEIGHTS;
    return {
      score:
        w.wr * wr +
        w.pop * pop +
        w.safety * safety +
        w.counter * counter +
        w.pairing * pairing +
        w.ban * bansRec.ban +
        w.forced * forcedRec.ban,
      wr: wr,
      pop: pop,
      safety: safety,
      counter: counter,
      pairing: pairing,
      ban: bansRec.ban,
      banThreat: bansRec.threat,
      banDeny: bansRec.deny,
      banMastery: bansRec.mastery,
      forced: forcedRec.ban,
      forcedThreat: forcedRec.threat,
      forcedDeny: forcedRec.deny,
      forcedMastery: forcedRec.mastery,
      weights: w,
    };
  }

  function matchPredict(blue, red) {
    const draft = lineupExpect(blue, red);
    const blueScore = rosterScore(blue);
    const redScore = rosterScore(red);
    const teamElo =
      blueScore != null && redScore != null ? (blueScore - redScore) * TEAM_SCORE_ELO : 0;
    const comfortElo = champLineupElo(blue, red);
    const elo = (draft.elo || 0) + teamElo + comfortElo + BLUE_SIDE_ELO;
    const p = expectedFromElo(elo);
    return {
      blue: p * 100,
      red: (1 - p) * 100,
      elo: elo,
      draft: draft.elo,
      team: teamElo,
      comfort: comfortElo,
      side: BLUE_SIDE_ELO,
      counter: draft.counter,
      pairing: draft.pairing,
      blueScore: blueScore,
      redScore: redScore,
    };
  }

  root.RIFT_PREDICT = {
    eloFromDelta: eloFromDelta,
    expectedFromElo: expectedFromElo,
    lineupExpect: lineupExpect,
    rosterScore: rosterScore,
    playerScore: playerScore,
    champResidual: champResidual,
    draftQuality: draftQuality,
    matchPredict: matchPredict,
  };
})(window);
