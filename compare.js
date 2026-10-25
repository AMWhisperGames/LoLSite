// Compare page: side-by-side player or team comparison.
// Shares state and stat helpers with player.js (leagues, patches, windowKey,
// filteredGames, appearance, ratings) the same way team.js does.

const CMP_MAX = 4;
const CMP_COLORS = ["#7eb8da", "#e0a060", "#7ec8a0", "#d08090"];
const CMP_RADAR_RINGS = 4;
const CMP_PEER_MIN = 4;

const cmpEls = {
  boot: document.getElementById("boot"),
  bootStatus: document.getElementById("boot-status"),
  app: document.getElementById("app"),
  range: document.getElementById("compare-range"),
  mode: document.getElementById("compare-mode"),
  search: document.getElementById("compare-search"),
  menu: document.getElementById("compare-menu"),
  picks: document.getElementById("compare-picks"),
  leagues: document.getElementById("compare-leagues"),
  windows: document.getElementById("compare-windows"),
  patches: document.getElementById("compare-patches"),
  hint: document.getElementById("compare-hint"),
  radarWrap: document.getElementById("compare-radar-wrap"),
  radarTitle: document.getElementById("compare-radar-title"),
  radar: document.getElementById("compare-radar"),
  legend: document.getElementById("compare-legend"),
  minis: document.getElementById("compare-minis"),
  boardTitle: document.getElementById("compare-board-title"),
  head: document.getElementById("compare-head"),
  body: document.getElementById("compare-body"),
  h2h: document.getElementById("compare-h2h"),
  radarNote: document.getElementById("compare-radar-note"),
  pools: document.getElementById("compare-pools"),
};

function cmpColor(i) {
  return CMP_COLORS[i % CMP_COLORS.length];
}

function cmpParseNames(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map(function (name) {
      return name.trim();
    })
    .filter(Boolean)
    .slice(0, CMP_MAX);
}

let cmpMode = params.get("mode") === "teams" ? "teams" : "players";
let cmpPlayerPicks = cmpParseNames(params.get("players"));
let cmpTeamPicks = cmpParseNames(params.get("teams"));
let cmpAgg = null; // aggregate map for the active mode, rebuilt each render
let cmpGameCount = 0;

function cmpEl(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function cmpPicks() {
  return cmpMode === "teams" ? cmpTeamPicks : cmpPlayerPicks;
}

function cmpSetPicks(list) {
  if (cmpMode === "teams") cmpTeamPicks = list;
  else cmpPlayerPicks = list;
}

function cmpSyncUrl() {
  const url = new URL(location.href);
  url.searchParams.set("mode", cmpMode);
  if (cmpPlayerPicks.length) url.searchParams.set("players", cmpPlayerPicks.join(","));
  else url.searchParams.delete("players");
  if (cmpTeamPicks.length) url.searchParams.set("teams", cmpTeamPicks.join(","));
  else url.searchParams.delete("teams");
  url.searchParams.set("league", formatSel(leagues));
  url.searchParams.set("window", RIFT_WINDOW.param());
  url.searchParams.set("patch", formatSel(patches));
  history.replaceState({}, "", url);
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function cmpAvg(rec, sumKey, nKey) {
  return rec[nKey] ? rec[sumKey] / rec[nKey] : null;
}

function cmpPlayerStats() {
  const games = filteredGames();
  cmpGameCount = games.length;
  const map = {};
  for (let g = 0; g < games.length; g += 1) {
    const game = games[g];
    for (let r = 0; r < 5; r += 1) {
      const sides = [appearance(game, "b", r), appearance(game, "r", r)];
      for (let s = 0; s < 2; s += 1) {
        const row = sides[s];
        const key = playerKey(row.name);
        if (!key) continue;
        const rec =
          map[key] ||
          (map[key] = {
            key: key,
            name: row.name,
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
            xd: 0,
            xdN: 0,
            cd: 0,
            cdN: 0,
            gs: 0,
            gsN: 0,
            teams: {},
            roles: {},
            champs: {},
          });
        rec.name = row.name;
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
        if (row.xd15 != null) {
          rec.xd += row.xd15;
          rec.xdN += 1;
        }
        if (row.cd15 != null) {
          rec.cd += row.cd15;
          rec.cdN += 1;
        }
        if (row.goldShare != null) {
          rec.gs += row.goldShare;
          rec.gsN += 1;
        }
        rec.teams[row.team] = (rec.teams[row.team] || 0) + 1;
        rec.roles[row.role] = (rec.roles[row.role] || 0) + 1;
        if (row.champ) {
          const ch =
            rec.champs[row.champ] ||
            (rec.champs[row.champ] = { id: row.champ, g: 0, w: 0, k: 0, d: 0, a: 0 });
          ch.g += 1;
          ch.w += row.win ? 1 : 0;
          ch.k += row.kda[0];
          ch.d += row.kda[1];
          ch.a += row.kda[2];
        }
      }
    }
  }
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i += 1) {
    const rec = map[keys[i]];
    rec.winRate = rec.games ? rec.wins / rec.games : null;
    rec.kdaRatio = (rec.k + rec.a) / Math.max(1, rec.d);
    rec.kpg = rec.games ? rec.k / rec.games : null;
    rec.dpg = rec.games ? rec.d / rec.games : null;
    rec.apg = rec.games ? rec.a / rec.games : null;
    rec.dpmAvg = rec.games ? rec.dpm / rec.games : null;
    rec.cspmAvg = rec.games ? rec.cspm / rec.games : null;
    rec.vpmAvg = rec.games ? rec.vpm / rec.games : null;
    rec.kpAvg = rec.games ? rec.kp / rec.games : null;
    rec.gd15 = cmpAvg(rec, "gd", "gdN");
    rec.xd15 = cmpAvg(rec, "xd", "xdN");
    rec.cd15 = cmpAvg(rec, "cd", "cdN");
    rec.goldShareAvg = cmpAvg(rec, "gs", "gsN");
    rec.mainTeam = mostCommon(rec.teams);
    rec.mainRole = mostCommon(rec.roles);
    rec.poolSize = Object.keys(rec.champs).length;
    rec.score = ratingScore(rec.name, rec.mainRole);
    rec.mastery = ratingRel(rec.name, rec.mainRole);
    rec.trueScore = ratingVsTeam(rec.name, rec.mainRole, rec.mainTeam);
    rec.topChamps = cmpTopChamps(rec.champs, 6);
  }
  return map;
}

function cmpTopChamps(champs, n) {
  const list = Object.keys(champs).map(function (id) {
    return champs[id];
  });
  list.sort(function (a, b) {
    return b.g - a.g || b.w - a.w || champName(a.id).localeCompare(champName(b.id));
  });
  return list.slice(0, n);
}

function cmpFirstHit(x, key, blue) {
  const val = x && x[key];
  if (val !== 0 && val !== 1) return null;
  return blue ? val === 1 : val === 0;
}

function cmpPairShare(pair, blue) {
  if (!pair || pair.length < 2) return null;
  const mine = Number(pair[blue ? 0 : 1]) || 0;
  const theirs = Number(pair[blue ? 1 : 0]) || 0;
  if (mine + theirs <= 0) return null;
  return mine / (mine + theirs);
}

function cmpSideLineup(game, blue) {
  const champs = blue ? game.b : game.r;
  const names = blue ? game.bp : game.rp;
  const rows = [];
  for (let i = 0; i < 5; i += 1) {
    if (!champs || !champs[i]) continue;
    rows.push({ id: champs[i], name: (names && names[i]) || "", role: ROLE_KEYS[i] });
  }
  return rows;
}

function cmpEmptyRoleBags() {
  const bags = [];
  for (let i = 0; i < 5; i += 1) bags.push({ s: 0, n: 0 });
  return bags;
}

function cmpTeamStats() {
  const games = filteredGames();
  cmpGameCount = games.length;
  const teamAvgs = teamAvgMap();
  const predict = window.RIFT_PREDICT;
  const map = {};
  for (let g = 0; g < games.length; g += 1) {
    const game = games[g];
    const x = game.x || {};
    let gd15 = null;
    if (x.g15 && x.g15.length) {
      gd15 = 0;
      for (let i = 0; i < Math.min(5, x.g15.length); i += 1) gd15 += x.g15[i] || 0;
    }
    const specs = [
      {
        name: game.bt,
        win: game.w === 1,
        kdas: game.bk || [],
        picks: game.b || [],
        names: game.bp || [],
        bans: game.bb || [],
        blue: true,
        lead: gd15,
      },
      {
        name: game.rt,
        win: game.w === 0,
        kdas: game.rk || [],
        picks: game.r || [],
        names: game.rp || [],
        bans: game.rb || [],
        blue: false,
        lead: gd15 == null ? null : -gd15,
      },
    ];
    for (let s = 0; s < 2; s += 1) {
      const spec = specs[s];
      if (!spec.name) continue;
      const opp = specs[1 - s];
      const rec =
        map[spec.name] ||
        (map[spec.name] = {
          key: spec.name,
          name: spec.name,
          games: 0,
          wins: 0,
          blueG: 0,
          blueW: 0,
          redG: 0,
          redW: 0,
          kills: 0,
          deaths: 0,
          dur: 0,
          gd: 0,
          gdN: 0,
          fight: 0,
          fightN: 0,
          obj: 0,
          objN: 0,
          draft: 0,
          draftN: 0,
          roleBags: cmpEmptyRoleBags(),
          leagues: {},
          players: {},
          champs: {},
        });
      rec.games += 1;
      rec.wins += spec.win ? 1 : 0;
      if (spec.blue) {
        rec.blueG += 1;
        rec.blueW += spec.win ? 1 : 0;
      } else {
        rec.redG += 1;
        rec.redW += spec.win ? 1 : 0;
      }

      let teamK = 0;
      let oppK = 0;
      for (let r = 0; r < 5; r += 1) {
        const k = (spec.kdas[r] && spec.kdas[r][0]) || 0;
        const ok = (opp.kdas[r] && opp.kdas[r][0]) || 0;
        teamK += k;
        oppK += ok;
        rec.kills += k;
        rec.deaths += ok;
        const champ = spec.picks[r];
        if (champ) {
          const ch = rec.champs[champ] || (rec.champs[champ] = { id: champ, g: 0, w: 0 });
          ch.g += 1;
          ch.w += spec.win ? 1 : 0;
        }
        const pname = spec.names[r];
        if (pname) {
          rec.players[playerKey(pname)] = pname;
          const rating = ratingVsBase(pname, ROLE_KEYS[r]);
          if (rating != null && isFinite(rating)) {
            rec.roleBags[r].s += rating;
            rec.roleBags[r].n += 1;
          }
        }
      }

      // Teamfight: blend of kill share and damage share.
      const dmg = x.d ? Number(x.d[spec.blue ? 0 : 1]) || 0 : 0;
      const oppDmg = x.d ? Number(x.d[spec.blue ? 1 : 0]) || 0 : 0;
      const killShare = teamK + oppK > 0 ? teamK / (teamK + oppK) : null;
      const dmgShare = dmg + oppDmg > 0 ? dmg / (dmg + oppDmg) : null;
      if (killShare != null || dmgShare != null) {
        const parts = [];
        if (killShare != null) parts.push(killShare);
        if (dmgShare != null) parts.push(dmgShare);
        let fight = 0;
        for (let p = 0; p < parts.length; p += 1) fight += parts[p];
        rec.fight += fight / parts.length;
        rec.fightN += 1;
      }

      // Objectives: first-obj hits + objective takes.
      const firstKeys = ["fb", "ft", "fd", "fh", "fba"];
      const shareKeys = ["dr", "ba", "tw", "he", "gr", "el", "at"];
      const objParts = [];
      for (let f = 0; f < firstKeys.length; f += 1) {
        const hit = cmpFirstHit(x, firstKeys[f], spec.blue);
        if (hit != null) objParts.push(hit ? 1 : 0);
      }
      for (let o = 0; o < shareKeys.length; o += 1) {
        const share = cmpPairShare(x[shareKeys[o]], spec.blue);
        if (share != null) objParts.push(share);
      }
      if (objParts.length) {
        let obj = 0;
        for (let p = 0; p < objParts.length; p += 1) obj += objParts[p];
        rec.obj += obj / objParts.length;
        rec.objN += 1;
      }

      if (predict && predict.draftQuality) {
        const dq = predict.draftQuality(
          cmpSideLineup(game, spec.blue),
          cmpSideLineup(game, !spec.blue),
          spec.bans,
          opp.bans
        );
        if (dq && dq.score != null && isFinite(dq.score)) {
          rec.draft += dq.score;
          rec.draftN += 1;
        }
      }

      rec.dur += game.gl || 0;
      if (spec.lead != null) {
        rec.gd += spec.lead;
        rec.gdN += 1;
      }
      if (game.l) rec.leagues[game.l] = (rec.leagues[game.l] || 0) + 1;
    }
  }

  let draftMean = 0;
  let draftMeanN = 0;
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i += 1) {
    const rec = map[keys[i]];
    rec.winRate = rec.games ? rec.wins / rec.games : null;
    rec.blueWr = rec.blueG ? rec.blueW / rec.blueG : null;
    rec.redWr = rec.redG ? rec.redW / rec.redG : null;
    rec.kpg = rec.games ? rec.kills / rec.games : null;
    rec.dpg = rec.games ? rec.deaths / rec.games : null;
    rec.avgDur = rec.games ? rec.dur / rec.games : null;
    rec.gd15 = cmpAvg(rec, "gd", "gdN");
    rec.laning = rec.gd15;
    rec.teamfight = cmpAvg(rec, "fight", "fightN");
    rec.objectives = cmpAvg(rec, "obj", "objN");
    rec.draftRaw = cmpAvg(rec, "draft", "draftN");
    rec.pool = Object.keys(rec.champs).length;
    rec.league = mostCommon(rec.leagues);
    rec.rosterSize = Object.keys(rec.players).length;
    rec.rosterRating = teamAvgs[rec.name] != null ? teamAvgs[rec.name] : null;
    rec.topChamps = cmpTopChamps(rec.champs, 6);
    rec.role = [];
    for (let r = 0; r < 5; r += 1) {
      const bag = rec.roleBags[r];
      rec.role[r] = bag.n ? bag.s / bag.n : null;
    }
    rec.top = rec.role[0];
    rec.jng = rec.role[1];
    rec.mid = rec.role[2];
    rec.bot = rec.role[3];
    rec.sup = rec.role[4];
    if (rec.draftRaw != null) {
      draftMean += rec.draftRaw;
      draftMeanN += 1;
    }
  }
  draftMean = draftMeanN ? draftMean / draftMeanN : 0;
  for (let i = 0; i < keys.length; i += 1) {
    const rec = map[keys[i]];
    rec.drafting = rec.draftRaw == null ? null : rec.draftRaw - draftMean;
  }
  return map;
}

function cmpHeadToHead() {
  const picks = cmpPicks();
  if (picks.length !== 2) return null;
  const games = filteredGames();
  if (cmpMode === "teams") {
    let n = 0;
    let aWins = 0;
    for (let i = 0; i < games.length; i += 1) {
      const game = games[i];
      const pair = [game.bt, game.rt];
      if (pair.indexOf(picks[0]) === -1 || pair.indexOf(picks[1]) === -1) continue;
      n += 1;
      const aBlue = game.bt === picks[0];
      if ((aBlue && game.w === 1) || (!aBlue && game.w === 0)) aWins += 1;
    }
    return n ? { n: n, aWins: aWins } : null;
  }
  const a = playerKey(picks[0]);
  const b = playerKey(picks[1]);
  let n = 0;
  let aWins = 0;
  let laneN = 0;
  let laneAWins = 0;
  for (let i = 0; i < games.length; i += 1) {
    const game = games[i];
    const bIdx = (game.bp || []).findIndex(function (name) {
      return playerKey(name) === a;
    });
    const rIdx = (game.rp || []).findIndex(function (name) {
      return playerKey(name) === a;
    });
    let aSide = null;
    let aIdx = -1;
    if (bIdx >= 0) {
      aSide = "b";
      aIdx = bIdx;
    } else if (rIdx >= 0) {
      aSide = "r";
      aIdx = rIdx;
    }
    if (!aSide) continue;
    const oppNames = aSide === "b" ? game.rp || [] : game.bp || [];
    const bIdxOpp = oppNames.findIndex(function (name) {
      return playerKey(name) === b;
    });
    if (bIdxOpp < 0) continue;
    n += 1;
    const aWon = aSide === "b" ? game.w === 1 : game.w === 0;
    if (aWon) aWins += 1;
    if (bIdxOpp === aIdx) {
      laneN += 1;
      if (aWon) laneAWins += 1;
    }
  }
  return n ? { n: n, aWins: aWins, laneN: laneN, laneAWins: laneAWins } : null;
}

// ---------------------------------------------------------------------------
// Metric rows
// ---------------------------------------------------------------------------

function cmpRoleLabel(roleKey) {
  return roleKey ? roleKey.toUpperCase() : "—";
}

function cmpDur(seconds) {
  if (seconds == null || !isFinite(seconds)) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m + ":" + (s < 10 ? "0" : "") + s;
}

function cmpPlayerRows() {
  return [
    { label: "Team", text: function (s) { return s.mainTeam || "—"; } },
    { label: "Main role", text: function (s) { return cmpRoleLabel(s.mainRole); } },
    { label: "Games", num: true, best: "high", val: function (s) { return s.games; }, fmt: function (v) { return v.toLocaleString(); } },
    { label: "Record", text: function (s) { return s.wins + "–" + (s.games - s.wins); } },
    { label: "Win rate", num: true, best: "high", val: function (s) { return s.winRate; }, fmt: fmtPct },
    { label: "True score", num: true, best: "high", val: function (s) { return s.trueScore; }, fmt: fmtScore },
    { label: "Score", num: true, best: "high", val: function (s) { return s.score; }, fmt: fmtScore },
    { label: "Mastery", num: true, best: "high", val: function (s) { return s.mastery; }, fmt: fmtScore },
    { label: "KDA", num: true, best: "high", val: function (s) { return s.kdaRatio; }, fmt: fmtRate },
    { label: "Kills / game", num: true, best: "high", val: function (s) { return s.kpg; }, fmt: fmtAvg },
    { label: "Deaths / game", num: true, best: "low", val: function (s) { return s.dpg; }, fmt: fmtAvg },
    { label: "Assists / game", num: true, best: "high", val: function (s) { return s.apg; }, fmt: fmtAvg },
    { label: "CS / min", num: true, best: "high", val: function (s) { return s.cspmAvg; }, fmt: fmtRate },
    { label: "Damage / min", num: true, best: "high", val: function (s) { return s.dpmAvg; }, fmt: fmtAvg },
    { label: "Vision / min", num: true, best: "high", val: function (s) { return s.vpmAvg; }, fmt: fmtRate },
    { label: "Kill participation", num: true, best: "high", val: function (s) { return s.kpAvg; }, fmt: fmtPct },
    { label: "Gold diff @15", num: true, best: "high", val: function (s) { return s.gd15; }, fmt: fmtDiff },
    { label: "XP diff @15", num: true, best: "high", val: function (s) { return s.xd15; }, fmt: fmtDiff },
    { label: "CS diff @15", num: true, best: "high", val: function (s) { return s.cd15; }, fmt: function (v) { return fmtDiff(v); } },
    { label: "Gold share", num: true, best: "high", val: function (s) { return s.goldShareAvg; }, fmt: fmtPct },
    { label: "Champion pool", num: true, best: "high", val: function (s) { return s.poolSize; }, fmt: function (v) { return String(v); } },
    {
      label: "Most played",
      text: function (s) {
        if (!s.topChamps.length) return "—";
        const c = s.topChamps[0];
        return champName(c.id) + " · " + c.g + "g · " + fmtPct(c.g ? c.w / c.g : null);
      },
    },
  ];
}

function cmpTeamRows() {
  return [
    { label: "League", text: function (s) { return s.league || "—"; } },
    { label: "Games", num: true, best: "high", val: function (s) { return s.games; }, fmt: function (v) { return v.toLocaleString(); } },
    { label: "Record", text: function (s) { return s.wins + "–" + (s.games - s.wins); } },
    { label: "Win rate", num: true, best: "high", val: function (s) { return s.winRate; }, fmt: fmtPct },
    { label: "TOP", num: true, best: "high", val: function (s) { return s.top; }, fmt: fmtScore },
    { label: "JNG", num: true, best: "high", val: function (s) { return s.jng; }, fmt: fmtScore },
    { label: "MID", num: true, best: "high", val: function (s) { return s.mid; }, fmt: fmtScore },
    { label: "BOT", num: true, best: "high", val: function (s) { return s.bot; }, fmt: fmtScore },
    { label: "SUP", num: true, best: "high", val: function (s) { return s.sup; }, fmt: fmtScore },
    { label: "Teamfight", num: true, best: "high", val: function (s) { return s.teamfight; }, fmt: fmtPct },
    { label: "Laning", num: true, best: "high", val: function (s) { return s.laning; }, fmt: fmtDiff },
    { label: "Objectives", num: true, best: "high", val: function (s) { return s.objectives; }, fmt: fmtPct },
    { label: "Pool", num: true, best: "high", val: function (s) { return s.pool; }, fmt: function (v) { return String(v); } },
    { label: "Drafting", num: true, best: "high", val: function (s) { return s.drafting; }, fmt: fmtScore },
  ];
}

// ---------------------------------------------------------------------------
// Radar axes + SVG
// ---------------------------------------------------------------------------

function cmpPlayerAxes() {
  return [
    { key: "wr", label: "Win rate", val: function (s) { return s.winRate; }, high: true },
    { key: "true", label: "True score", val: function (s) { return s.trueScore; }, high: true },
    { key: "kda", label: "KDA", val: function (s) { return s.kdaRatio; }, high: true },
    { key: "dpm", label: "Damage", val: function (s) { return s.dpmAvg; }, high: true },
    { key: "cspm", label: "CS/min", val: function (s) { return s.cspmAvg; }, high: true },
    { key: "kp", label: "KP", val: function (s) { return s.kpAvg; }, high: true },
    { key: "gd15", label: "GD@15", val: function (s) { return s.gd15; }, high: true },
    { key: "vpm", label: "Vision", val: function (s) { return s.vpmAvg; }, high: true },
  ];
}

function cmpTeamAxes() {
  return [
    { key: "top", label: "TOP", val: function (s) { return s.top; }, high: true },
    { key: "jng", label: "JNG", val: function (s) { return s.jng; }, high: true },
    { key: "mid", label: "MID", val: function (s) { return s.mid; }, high: true },
    { key: "bot", label: "BOT", val: function (s) { return s.bot; }, high: true },
    { key: "sup", label: "SUP", val: function (s) { return s.sup; }, high: true },
    { key: "fight", label: "Teamfight", val: function (s) { return s.teamfight; }, high: true },
    { key: "lane", label: "Laning", val: function (s) { return s.laning; }, high: true },
    { key: "obj", label: "Objectives", val: function (s) { return s.objectives; }, high: true },
    { key: "pool", label: "Pool", val: function (s) { return s.pool; }, high: true },
    { key: "draft", label: "Drafting", val: function (s) { return s.drafting; }, high: true },
  ];
}

function cmpAxes() {
  return cmpMode === "teams" ? cmpTeamAxes() : cmpPlayerAxes();
}

function cmpPeerList(rec) {
  if (!cmpAgg) return [];
  const all = Object.keys(cmpAgg).map(function (key) {
    return cmpAgg[key];
  });
  if (cmpMode === "teams") {
    return all.filter(function (peer) {
      return peer.games >= CMP_PEER_MIN;
    });
  }
  const role = rec && rec.mainRole;
  const peers = all.filter(function (peer) {
    return peer.games >= CMP_PEER_MIN && (!role || peer.mainRole === role);
  });
  if (peers.length >= 8) return peers;
  return all.filter(function (peer) {
    return peer.games >= CMP_PEER_MIN;
  });
}

function cmpPercentile(value, peers, axis) {
  if (value == null || !isFinite(value) || !peers.length) return 0;
  let below = 0;
  let known = 0;
  for (let i = 0; i < peers.length; i += 1) {
    const v = axis.val(peers[i]);
    if (v == null || !isFinite(v)) continue;
    known += 1;
    if (axis.high ? v < value : v > value) below += 1;
    else if (v === value) below += 0.5;
  }
  if (!known) return 0;
  return Math.max(0, Math.min(1, below / known));
}

function cmpRadarScores(rec) {
  const axes = cmpAxes();
  const peers = cmpPeerList(rec);
  return axes.map(function (axis) {
    return cmpPercentile(axis.val(rec), peers, axis);
  });
}

function cmpSvgEl(name, attrs) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  if (attrs) {
    const keys = Object.keys(attrs);
    for (let i = 0; i < keys.length; i += 1) node.setAttribute(keys[i], attrs[keys[i]]);
  }
  return node;
}

function cmpPolar(cx, cy, r, angle) {
  return {
    x: cx + r * Math.sin(angle),
    y: cy - r * Math.cos(angle),
  };
}

function cmpRadarPolygon(scores, cx, cy, radius) {
  const n = scores.length;
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const p = cmpPolar(cx, cy, radius * Math.max(0, Math.min(1, scores[i] || 0)), (Math.PI * 2 * i) / n);
    pts.push(p.x.toFixed(1) + "," + p.y.toFixed(1));
  }
  return pts.join(" ");
}

function cmpDrawRadar(svg, series, opts) {
  opts = opts || {};
  const width = opts.width || 560;
  const height = opts.height || 460;
  const cx = width / 2;
  const cy = height / 2 + (opts.cyShift || 6);
  const radius = opts.radius || Math.min(width, height) * 0.34;
  const axes = cmpAxes();
  const n = axes.length;
  const showLabels = opts.labels !== false;
  const showLegendGap = opts.mini ? 0 : 0;

  svg.setAttribute("viewBox", "0 0 " + width + " " + height);
  svg.innerHTML = "";

  const g = cmpSvgEl("g", { class: "cmp-radar-root" });
  svg.append(g);

  for (let ring = 1; ring <= CMP_RADAR_RINGS; ring += 1) {
    const r = (radius * ring) / CMP_RADAR_RINGS;
    const pts = [];
    for (let i = 0; i < n; i += 1) {
      const p = cmpPolar(cx, cy, r, (Math.PI * 2 * i) / n);
      pts.push(p.x.toFixed(1) + "," + p.y.toFixed(1));
    }
    g.append(
      cmpSvgEl("polygon", {
        class: "cmp-radar-ring",
        points: pts.join(" "),
      })
    );
  }

  for (let i = 0; i < n; i += 1) {
    const angle = (Math.PI * 2 * i) / n;
    const tip = cmpPolar(cx, cy, radius, angle);
    g.append(
      cmpSvgEl("line", {
        class: "cmp-radar-spoke",
        x1: cx,
        y1: cy,
        x2: tip.x.toFixed(1),
        y2: tip.y.toFixed(1),
      })
    );
    if (showLabels) {
      const labelR = radius + (opts.mini ? 14 : 28);
      const lp = cmpPolar(cx, cy, labelR, angle);
      const text = cmpSvgEl("text", {
        class: "cmp-radar-label",
        x: lp.x.toFixed(1),
        y: lp.y.toFixed(1),
        "text-anchor": Math.abs(Math.sin(angle)) < 0.2 ? "middle" : Math.sin(angle) > 0 ? "start" : "end",
        "dominant-baseline": Math.cos(angle) > 0.55 ? "auto" : Math.cos(angle) < -0.55 ? "hanging" : "middle",
      });
      text.textContent = axes[i].label;
      g.append(text);
    }
  }

  // Draw fills first so strokes sit on top.
  for (let s = 0; s < series.length; s += 1) {
    const item = series[s];
    if (!item || !item.scores) continue;
    g.append(
      cmpSvgEl("polygon", {
        class: "cmp-radar-fill",
        points: cmpRadarPolygon(item.scores, cx, cy, radius),
        fill: item.color,
        stroke: "none",
        "fill-opacity": series.length === 1 ? "0.28" : "0.16",
      })
    );
  }
  for (let s = 0; s < series.length; s += 1) {
    const item = series[s];
    if (!item || !item.scores) continue;
    g.append(
      cmpSvgEl("polygon", {
        class: "cmp-radar-stroke",
        points: cmpRadarPolygon(item.scores, cx, cy, radius),
        fill: "none",
        stroke: item.color,
        "stroke-width": opts.mini ? "1.5" : "2.2",
        "stroke-linejoin": "round",
      })
    );
    if (!opts.mini) {
      for (let i = 0; i < item.scores.length; i += 1) {
        const p = cmpPolar(cx, cy, radius * Math.max(0, Math.min(1, item.scores[i] || 0)), (Math.PI * 2 * i) / n);
        g.append(
          cmpSvgEl("circle", {
            class: "cmp-radar-dot",
            cx: p.x.toFixed(1),
            cy: p.y.toFixed(1),
            r: 3.2,
            fill: item.color,
            stroke: "#101114",
            "stroke-width": "1.2",
          })
        );
      }
    }
  }
  void showLegendGap;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function cmpResolve(name) {
  if (!cmpAgg) return null;
  if (cmpMode === "teams") return cmpAgg[name] || null;
  return cmpAgg[playerKey(name)] || null;
}

function cmpDisplayName(name) {
  const rec = cmpResolve(name);
  return rec ? rec.name : name;
}

function cmpRenderChips() {
  chipRow(cmpEls.mode, ["Players", "Teams"], cmpMode === "teams" ? "Teams" : "Players", function (name) {
    cmpMode = name === "Teams" ? "teams" : "players";
    cmpSyncUrl();
    cmpRender();
  });
  const leagueOpts = LEAGUES.slice(1);
  chipRowMulti(cmpEls.leagues, LEAGUES, leagues, function (name) {
    leagues = toggleSel(leagues, name, leagueOpts);
    cmpSyncUrl();
    cmpRender();
  });
  RIFT_WINDOW.mount(cmpEls.windows, function () {
    windowKey = RIFT_WINDOW.key;
    cmpSyncUrl();
    cmpRender();
  });
  const available = listPatches(windowGames());
  patches = patches.filter(function (name) {
    return available.indexOf(name) !== -1;
  });
  chipRowMulti(cmpEls.patches, ["All"].concat(available), patches, function (name) {
    patches = toggleSel(patches, name, available);
    cmpSyncUrl();
    cmpRender();
  });
}

function cmpRenderPicks() {
  const picks = cmpPicks();
  cmpEls.picks.innerHTML = "";
  setHidden(cmpEls.picks, !picks.length);
  for (let i = 0; i < picks.length; i += 1) {
    const name = picks[i];
    const button = cmpEl("button", "cmp-pick");
    button.type = "button";
    const swatch = cmpEl("span", "cmp-swatch");
    swatch.style.background = cmpColor(i);
    button.append(swatch);
    button.append(document.createTextNode(cmpDisplayName(name)));
    const x = cmpEl("span", "cmp-x", "×");
    x.setAttribute("aria-hidden", "true");
    button.append(x);
    button.title = "Remove " + cmpDisplayName(name);
    (function (pickName) {
      button.addEventListener("click", function () {
        cmpRemove(pickName);
      });
    })(name);
    cmpEls.picks.append(button);
  }
  cmpEls.search.placeholder =
    cmpMode === "teams" ? "Add a team…" : "Add a player…";
  const kind = cmpMode === "teams" ? "teams" : "players";
  if (picks.length >= CMP_MAX) {
    cmpEls.hint.textContent = "Comparing " + picks.length + " " + kind + " (max " + CMP_MAX + "). Radar axes are peer percentiles in this filter.";
  } else if (picks.length === 1) {
    cmpEls.hint.textContent = "Add at least one more " + (cmpMode === "teams" ? "team" : "player") + " to overlay shapes. Radar shows peer percentiles.";
  } else if (!picks.length) {
    cmpEls.hint.textContent = "Search above to add up to " + CMP_MAX + " " + kind + ". Overlay radar shapes compare peer percentiles.";
  } else {
    cmpEls.hint.textContent = "Radar overlays peer percentiles in this filter. The table below has raw numbers.";
  }
}

function cmpSeries() {
  const picks = cmpPicks();
  const out = [];
  for (let i = 0; i < picks.length; i += 1) {
    const rec = cmpResolve(picks[i]);
    if (!rec || !rec.games) continue;
    out.push({
      name: rec.name,
      color: cmpColor(i),
      scores: cmpRadarScores(rec),
      rec: rec,
      index: i,
    });
  }
  return out;
}

function cmpRenderRadar() {
  const picks = cmpPicks();
  const series = cmpSeries();
  setHidden(cmpEls.radarWrap, !picks.length);
  if (!picks.length) {
    if (cmpEls.radar) cmpEls.radar.innerHTML = "";
    if (cmpEls.legend) cmpEls.legend.innerHTML = "";
    if (cmpEls.minis) cmpEls.minis.innerHTML = "";
    return;
  }
  cmpEls.radarTitle.textContent = cmpMode === "teams" ? "Team radar" : "Player radar";
  if (cmpEls.radarNote) {
    cmpEls.radarNote.textContent =
      cmpMode === "teams"
        ? "Roles use roster True scores. Teamfight = kill/damage share, laning = GD@15, objectives = firsts + takes, drafting = draft quality. Outer ring = top of the field."
        : "Axes are percentiles vs peers in the current filter (same main role). Outer ring = top of the field.";
  }
  cmpDrawRadar(cmpEls.radar, series, { width: 560, height: 460, radius: 148 });

  cmpEls.legend.innerHTML = "";
  for (let i = 0; i < series.length; i += 1) {
    const item = series[i];
    const chip = cmpEl("a", "cmp-legend-item");
    chip.href =
      cmpMode === "teams"
        ? "team.html?team=" + encodeURIComponent(item.name)
        : "player.html?player=" + encodeURIComponent(item.name);
    const swatch = cmpEl("span", "cmp-swatch");
    swatch.style.background = item.color;
    chip.append(swatch);
    chip.append(cmpEl("strong", "", item.name));
    const sub =
      cmpMode === "teams"
        ? (item.rec.league || "") + " · " + fmtPct(item.rec.winRate)
        : cmpRoleLabel(item.rec.mainRole) + " · " + (item.rec.mainTeam || "");
    chip.append(cmpEl("span", "cmp-legend-sub", sub));
    cmpEls.legend.append(chip);
  }

  cmpEls.minis.innerHTML = "";
  const stage = document.querySelector(".compare-radar-stage");
  if (stage) stage.classList.toggle("is-solo", series.length <= 1);
  if (series.length > 1) {
    for (let i = 0; i < series.length; i += 1) {
      const item = series[i];
      const card = cmpEl("div", "cmp-mini-card");
      const head = cmpEl("div", "cmp-mini-head");
      const swatch = cmpEl("span", "cmp-swatch");
      swatch.style.background = item.color;
      head.append(swatch);
      head.append(cmpEl("strong", "", item.name));
      card.append(head);
      const svg = cmpSvgEl("svg", {
        class: "cmp-mini-radar",
        viewBox: "0 0 180 180",
        role: "img",
        "aria-label": item.name + " radar",
      });
      cmpDrawRadar(svg, [item], { width: 180, height: 180, radius: 58, labels: false, mini: true });
      card.append(svg);
      cmpEls.minis.append(card);
    }
  }

  const h2h = cmpHeadToHead();
  if (h2h) {
    const a = cmpDisplayName(picks[0]);
    const b = cmpDisplayName(picks[1]);
    let text =
      "Head-to-head: " + a + " " + h2h.aWins + "–" + (h2h.n - h2h.aWins) + " " + b +
      " across " + h2h.n + " meeting" + (h2h.n === 1 ? "" : "s") + " in this filter.";
    if (cmpMode === "players" && h2h.laneN) {
      text += " Same-lane matchups: " + a + " " + h2h.laneAWins + "–" + (h2h.laneN - h2h.laneAWins) + " in " + h2h.laneN + ".";
    }
    cmpEls.h2h.textContent = text;
    setHidden(cmpEls.h2h, false);
  } else {
    cmpEls.h2h.textContent = "";
    setHidden(cmpEls.h2h, true);
  }
}

function cmpRenderTable() {
  const picks = cmpPicks();
  const board = document.querySelector(".compare-board");
  if (board) board.hidden = !picks.length;
  cmpEls.boardTitle.textContent = "Stat table";
  cmpEls.head.innerHTML = "";
  cmpEls.body.innerHTML = "";
  const headRow = document.createElement("tr");
  headRow.append(cmpEl("th", "", "Metric"));
  for (let i = 0; i < picks.length; i += 1) {
    const name = picks[i];
    const rec = cmpResolve(name);
    const th = cmpEl("th", "cmp-entity");
    const link = cmpEl("a", "cmp-name", cmpDisplayName(name));
    link.href =
      cmpMode === "teams"
        ? "team.html?team=" + encodeURIComponent(cmpDisplayName(name))
        : "player.html?player=" + encodeURIComponent(cmpDisplayName(name));
    link.style.borderBottomColor = cmpColor(i);
    th.append(link);
    const sub = cmpEl(
      "span",
      "cmp-sub",
      rec
        ? cmpMode === "teams"
          ? (rec.league || "") + (rec.games ? " · " + rec.games + " games" : "")
          : (rec.mainTeam || "") + (rec.mainRole ? " · " + cmpRoleLabel(rec.mainRole) : "")
        : "No games in filter"
    );
    th.append(sub);
    const remove = cmpEl("button", "cmp-remove", "×");
    remove.type = "button";
    remove.title = "Remove " + cmpDisplayName(name);
    (function (pickName) {
      remove.addEventListener("click", function () {
        cmpRemove(pickName);
      });
    })(name);
    th.append(remove);
    headRow.append(th);
  }
  cmpEls.head.append(headRow);

  const rows = cmpMode === "teams" ? cmpTeamRows() : cmpPlayerRows();
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    const tr = document.createElement("tr");
    tr.append(cmpEl("td", "cmp-metric", row.label));
    const values = picks.map(function (name) {
      const rec = cmpResolve(name);
      if (!rec || !rec.games) return null;
      return row.val ? row.val(rec) : null;
    });
    let bestIdx = {};
    if (row.best && picks.length > 1) {
      let bestVal = null;
      for (let i = 0; i < values.length; i += 1) {
        const v = values[i];
        if (v == null || !isFinite(v)) continue;
        if (bestVal == null || (row.best === "high" ? v > bestVal : v < bestVal)) bestVal = v;
      }
      if (bestVal != null) {
        for (let i = 0; i < values.length; i += 1) {
          if (values[i] === bestVal) bestIdx[i] = true;
        }
        if (Object.keys(bestIdx).length === values.filter(function (v) { return v != null && isFinite(v); }).length) bestIdx = {};
      }
    }
    for (let i = 0; i < picks.length; i += 1) {
      const rec = cmpResolve(picks[i]);
      let text;
      if (!rec || !rec.games) text = "—";
      else if (row.text) text = row.text(rec);
      else text = row.fmt(values[i]);
      const td = cmpEl("td", (row.num ? "num" : "") + (bestIdx[i] ? " cmp-best" : ""), text);
      tr.append(td);
    }
    cmpEls.body.append(tr);
  }
}

function cmpRenderPools() {
  cmpEls.pools.innerHTML = "";
  const picks = cmpPicks();
  for (let i = 0; i < picks.length; i += 1) {
    const rec = cmpResolve(picks[i]);
    if (!rec || !rec.topChamps || !rec.topChamps.length) continue;
    const card = cmpEl("section", "cmp-pool-card");
    const title = cmpEl("h4", "cmp-pool-title");
    const swatch = cmpEl("span", "cmp-swatch");
    swatch.style.background = cmpColor(i);
    title.append(swatch);
    title.append(document.createTextNode(cmpDisplayName(picks[i]) + (cmpMode === "teams" ? " — most picked" : " — champion pool")));
    card.append(title);
    const list = cmpEl("div", "cmp-pool-list");
    for (let c = 0; c < rec.topChamps.length; c += 1) {
      const ch = rec.topChamps[c];
      const rowEl = cmpEl("div", "cmp-pool-row");
      const img = document.createElement("img");
      img.src = portrait(ch.id);
      img.alt = "";
      img.loading = "lazy";
      rowEl.append(img);
      rowEl.append(cmpEl("span", "cmp-pool-name", champName(ch.id)));
      rowEl.append(cmpEl("span", "cmp-pool-games", ch.g + (cmpMode === "teams" ? " picks" : "g")));
      if (cmpMode === "teams") {
        rowEl.append(cmpEl("span", "cmp-pool-wr", fmtPct(ch.g ? ch.w / ch.g : null) + " WR"));
      } else {
        rowEl.append(cmpEl("span", "cmp-pool-wr", fmtPct(ch.g ? ch.w / ch.g : null) + " WR"));
        rowEl.append(
          cmpEl("span", "cmp-pool-kda", fmtRate((ch.k + ch.a) / Math.max(1, ch.d)) + " KDA")
        );
      }
      list.append(rowEl);
    }
    card.append(list);
    cmpEls.pools.append(card);
  }
}

function cmpRender() {
  cmpRenderChips();
  cmpAgg = cmpMode === "teams" ? cmpTeamStats() : cmpPlayerStats();
  cmpCanonicalizePicks();
  cmpRenderPicks();
  cmpRenderRadar();
  cmpRenderTable();
  cmpRenderPools();
  cmpRange();
}

function cmpRange() {
  cmpEls.range.textContent =
    cmpGameCount.toLocaleString() + " games" + (bundle.to ? " · through " + bundle.to : "");
}

// Picks from the URL may use different casing; snap them to display names.
function cmpCanonicalizePicks() {
  const picks = cmpPicks();
  let changed = false;
  const next = picks.map(function (name) {
    const rec = cmpResolve(name);
    if (rec && rec.name !== name) {
      changed = true;
      return rec.name;
    }
    return name;
  });
  if (changed) {
    cmpSetPicks(next);
    cmpSyncUrl();
  }
}

function cmpAdd(name) {
  const picks = cmpPicks();
  if (picks.length >= CMP_MAX) return;
  const exists = picks.some(function (pick) {
    return cmpMode === "teams" ? pick === name : playerKey(pick) === playerKey(name);
  });
  if (exists) return;
  picks.push(name);
  cmpSetPicks(picks);
  cmpSyncUrl();
  cmpRender();
}

function cmpRemove(name) {
  const picks = cmpPicks().filter(function (pick) {
    return cmpMode === "teams" ? pick !== name : playerKey(pick) !== playerKey(name);
  });
  cmpSetPicks(picks);
  cmpSyncUrl();
  cmpRender();
}

// ---------------------------------------------------------------------------
// Search suggestions
// ---------------------------------------------------------------------------

function cmpSuggestions(query) {
  if (!cmpAgg) return [];
  const q = query.trim().toLowerCase();
  const picks = cmpPicks();
  const taken = {};
  for (let i = 0; i < picks.length; i += 1) {
    taken[cmpMode === "teams" ? picks[i] : playerKey(picks[i])] = true;
  }
  const recs = Object.keys(cmpAgg).map(function (key) {
    return cmpAgg[key];
  });
  recs.sort(function (a, b) {
    return b.games - a.games;
  });
  const out = [];
  for (let i = 0; i < recs.length && out.length < 8; i += 1) {
    const rec = recs[i];
    if (taken[cmpMode === "teams" ? rec.name : rec.key]) continue;
    if (q) {
      const hay = (rec.name + " " + (rec.mainTeam || "") + " " + (rec.league || "")).toLowerCase();
      if (hay.indexOf(q) === -1) continue;
    }
    out.push(rec);
  }
  return out;
}

function cmpRenderMenu() {
  const hits = cmpSuggestions(cmpEls.search.value);
  cmpEls.menu.innerHTML = "";
  if (!hits.length) {
    setHidden(cmpEls.menu, true);
    return;
  }
  for (let i = 0; i < hits.length; i += 1) {
    const rec = hits[i];
    const button = cmpEl("button", "", rec.name);
    button.type = "button";
    const meta = cmpEl(
      "span",
      "cmp-menu-meta",
      cmpMode === "teams"
        ? (rec.league || "") + " · " + rec.games + "g · " + fmtPct(rec.winRate)
        : cmpRoleLabel(rec.mainRole) + " · " + (rec.mainTeam || "") + " · " + rec.games + "g"
    );
    button.append(meta);
    (function (pickName) {
      button.addEventListener("mousedown", function (event) {
        event.preventDefault();
        cmpEls.search.value = "";
        cmpAdd(pickName);
        setHidden(cmpEls.menu, true);
        cmpEls.search.focus();
      });
    })(rec.name);
    cmpEls.menu.append(button);
  }
  setHidden(cmpEls.menu, false);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function cmpDefaults() {
  // Fill both modes up front so switching tabs never lands on an empty board.
  if (!params.get("players")) {
    const map = cmpPlayerStats();
    const recs = Object.keys(map)
      .map(function (key) {
        return map[key];
      })
      .filter(function (rec) {
        return rec.games >= 8 && rec.score != null;
      })
      .sort(function (a, b) {
        return b.score - a.score;
      });
    cmpPlayerPicks = recs.slice(0, 2).map(function (rec) {
      return rec.name;
    });
  }
  if (!params.get("teams")) {
    const map = cmpTeamStats();
    const recs = Object.keys(map)
      .map(function (key) {
        return map[key];
      })
      .sort(function (a, b) {
        return b.games - a.games;
      });
    cmpTeamPicks = recs.slice(0, 2).map(function (rec) {
      return rec.name;
    });
  }
  cmpSyncUrl();
}

function cmpInitData() {
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

function cmpShowApp() {
  if (cmpEls.boot) {
    cmpEls.boot.classList.add("is-hidden");
    setHidden(cmpEls.boot, true);
    cmpEls.boot.remove();
  }
  setHidden(cmpEls.app, false);
}

function cmpBoot() {
  try {
    cmpInitData();
    cmpDefaults();
    cmpEls.search.addEventListener("input", cmpRenderMenu);
    cmpEls.search.addEventListener("focus", cmpRenderMenu);
    cmpEls.search.addEventListener("blur", function () {
      setTimeout(function () {
        setHidden(cmpEls.menu, true);
      }, 120);
    });
    cmpEls.search.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        cmpEls.search.value = "";
        setHidden(cmpEls.menu, true);
        return;
      }
      if (event.key !== "Enter") return;
      const hits = cmpSuggestions(cmpEls.search.value);
      if (!hits.length) return;
      event.preventDefault();
      cmpEls.search.value = "";
      cmpAdd(hits[0].name);
      setHidden(cmpEls.menu, true);
    });
    cmpRender();
    cmpShowApp();
  } catch (error) {
    if (cmpEls.bootStatus) cmpEls.bootStatus.textContent = error.message;
  }
}

if (document.getElementById("compare-search")) cmpBoot();
