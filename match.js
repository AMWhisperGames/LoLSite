const DDRAGON = "https://ddragon.leagueoflegends.com";
const ROLE_KEYS = ["TOP", "JNG", "MID", "ADC", "SUP"];

const els = {
  boot: document.getElementById("boot"),
  bootStatus: document.getElementById("boot-status"),
  app: document.getElementById("app"),
  splash: document.getElementById("splash"),
  title: document.getElementById("match-title"),
  back: document.getElementById("back-link"),
  result: document.getElementById("match-result"),
  meta: document.getElementById("match-meta"),
  length: document.getElementById("match-length"),
  blueTeam: document.getElementById("blue-team"),
  redTeam: document.getElementById("red-team"),
  blueName: document.getElementById("blue-name"),
  redName: document.getElementById("red-name"),
  blueStyle: document.getElementById("blue-style"),
  redStyle: document.getElementById("red-style"),
  blueBans: document.getElementById("blue-bans"),
  redBans: document.getElementById("red-bans"),
  bluePicks: document.getElementById("blue-picks"),
  redPicks: document.getElementById("red-picks"),
  stats: document.getElementById("match-stats"),
  player: document.getElementById("match-player"),
  mvp: document.getElementById("match-mvp"),
  styleNote: document.getElementById("match-style"),
  mid: document.querySelector(".match-mid"),
};

const params = new URLSearchParams(location.search);
const gameId = params.get("g") || "";
const focus = params.get("champ") || "";

let patch = "";
let champMap = new Map();
let currentGame = null;
let hoverTimer = 0;
let hoverKey = "";
let mvpPlayer = null;

// v1 MVP heuristic — winner-only, role-weighted. Tune these over time.
const MVP_WEIGHTS = {
  kda: 1.35,
  kp: 1.15,
  dmg: 1.2,
  gold: 0.55,
  vision: 0.4,
  lead: 0.18,
  roles: {
    TOP: { dmg: 1, gold: 1.05, vision: 0.45, kp: 1 },
    JNG: { dmg: 0.85, gold: 0.9, vision: 0.75, kp: 1.1 },
    MID: { dmg: 1.15, gold: 1, vision: 0.4, kp: 1 },
    ADC: { dmg: 1.25, gold: 1.1, vision: 0.3, kp: 1 },
    SUP: { dmg: 0.4, gold: 0.45, vision: 1.45, kp: 1.3 },
  },
};

const PERF_ROLE = 0.6;
const PERF_CHAMP = 0.4;
const PERF_MIN_CHAMP = 8;
const PERF_CLAMP = 3.2;
const PERF_KEYS = ["gd15", "dpm", "dpmVs", "deaths", "cspm", "kp", "vis", "kapm", "dmgShare", "goldShare"];
const PERF_WEIGHTS = {
  TOP: { gd15: 0.55, dpm: 0.85, dpmVs: 0.3, deaths: -1.2, cspm: 0.15, kp: 0.8, vis: 0.15, kapm: 0.7, dmgShare: 0.55, goldShare: 0.45 },
  JNG: { gd15: 0.2, dpm: 0.7, dpmVs: 0.15, deaths: -0.95, cspm: 0, kp: 1.35, vis: 0.95, kapm: 0.9, dmgShare: 0.35, goldShare: 0.25 },
  MID: { gd15: 0.4, dpm: 1.15, dpmVs: 0.35, deaths: -1.05, cspm: 0.12, kp: 0.95, vis: 0.15, kapm: 0.85, dmgShare: 0.7, goldShare: 0.4 },
  ADC: { gd15: 0.25, dpm: 1.25, dpmVs: 0.3, deaths: -1.0, cspm: 0.15, kp: 1.05, vis: 0.1, kapm: 0.9, dmgShare: 0.8, goldShare: 0.45 },
  SUP: { gd15: 0.1, dpm: 0.15, dpmVs: 0.05, deaths: -0.9, cspm: 0, kp: 1.45, vis: 1.35, kapm: 1.05, dmgShare: 0.1, goldShare: 0.15 },
};

let perfMemo = null;

function champName(id) {
  return (champMap.get(id) && champMap.get(id).name) || id || "";
}

function portrait(id) {
  return DDRAGON + "/cdn/" + patch + "/img/champion/" + id + ".png";
}

function loadingArt(id) {
  return DDRAGON + "/cdn/img/champion/loading/" + id + "_0.jpg";
}

function splashArt(id) {
  return DDRAGON + "/cdn/img/champion/splash/" + id + "_0.jpg";
}

function fmtKda(row) {
  if (!row) return "";
  return row[0] + " / " + row[1] + " / " + row[2];
}

function fmtRate(value) {
  if (value == null || !isFinite(value)) return "—";
  return value.toFixed(1);
}

function fmtPct(value) {
  if (value == null || !isFinite(value)) return "—";
  return (value * 100).toFixed(1) + "%";
}

function minutesOf(game) {
  return (game.gl || 0) / 60;
}

function teamVision(x, side) {
  const start = side === "blue" ? 0 : 5;
  const rows = x.pv || [];
  let n = 0;
  for (let i = 0; i < 5; i += 1) n += rows[start + i] || 0;
  return n;
}

function playersOf(game) {
  const x = game.x || {};
  const minutes = minutesOf(game);
  const sides = [
    {
      key: "blue",
      champs: game.b,
      names: game.bp,
      kdas: game.bk,
      win: game.w === 1,
      team: game.bt,
      off: 0,
      kills: sumKda(game.bk, 0),
      dmg: (x.d && x.d[0]) || 0,
      gold: (x.g && x.g[0]) || 0,
      vis: teamVision(x, "blue"),
    },
    {
      key: "red",
      champs: game.r,
      names: game.rp,
      kdas: game.rk,
      win: game.w === 0,
      team: game.rt,
      off: 5,
      kills: sumKda(game.rk, 0),
      dmg: (x.d && x.d[1]) || 0,
      gold: (x.g && x.g[1]) || 0,
      vis: teamVision(x, "red"),
    },
  ];
  const out = [];
  for (let s = 0; s < sides.length; s += 1) {
    const side = sides[s];
    for (let i = 0; i < 5; i += 1) {
      const kda = side.kdas[i] || [0, 0, 0];
      const cs = (x.pc && x.pc[side.off + i]) || 0;
      const gold = (x.pg && x.pg[side.off + i]) || 0;
      const dmg = (x.pd && x.pd[side.off + i]) || 0;
      const vis = (x.pv && x.pv[side.off + i]) || 0;
      const laneDiff = x.g15 ? x.g15[i] || 0 : 0;
      const lane20 = x.g20 ? x.g20[i] || 0 : 0;
      out.push({
        key: side.key + "-" + i,
        side: side.key,
        index: i,
        id: side.champs[i],
        champ: champName(side.champs[i]),
        name: side.names[i] || "",
        team: side.team,
        role: ROLE_KEYS[i],
        win: side.win,
        k: kda[0] || 0,
        d: kda[1] || 0,
        a: kda[2] || 0,
        cs: cs,
        gold: gold,
        dmg: dmg,
        vis: vis,
        gd15: x.g15 ? (side.key === "blue" ? laneDiff : -laneDiff) : null,
        gd20: x.g20 ? (side.key === "blue" ? lane20 : -lane20) : null,
        cspm: minutes ? cs / minutes : 0,
        dpm: minutes ? dmg / minutes : 0,
        gpm: minutes ? gold / minutes : 0,
        vspm: minutes ? vis / minutes : 0,
        deathsPm: minutes ? (kda[1] || 0) / minutes : 0,
        kapm: minutes ? ((kda[0] || 0) + (kda[2] || 0)) / minutes : 0,
        dpmVs: 0,
        kp: side.kills ? (kda[0] + kda[2]) / side.kills : 0,
        dmgShare: side.dmg ? dmg / side.dmg : 0,
        goldShare: side.gold ? gold / side.gold : 0,
        visShare: side.vis ? vis / side.vis : 0,
      });
    }
  }
  for (let i = 0; i < 5; i += 1) {
    const blue = out[i];
    const red = out[i + 5];
    if (!blue || !red) continue;
    blue.dpmVs = (blue.dpm || 0) - (red.dpm || 0);
    red.dpmVs = (red.dpm || 0) - (blue.dpm || 0);
  }
  return out;
}

function perfFeats(player) {
  return {
    gd15: player.gd15,
    dpm: player.dpm,
    dpmVs: player.dpmVs,
    deaths: player.deathsPm,
    cspm: player.cspm,
    kp: player.kp,
    vis: player.vspm,
    kapm: player.kapm,
    dmgShare: player.dmgShare,
    goldShare: player.goldShare,
  };
}

function addPerfBag(bag, key, feats) {
  const rec = bag[key] || (bag[key] = { n: 0, sums: {}, sq: {} });
  rec.n += 1;
  for (let i = 0; i < PERF_KEYS.length; i += 1) {
    const name = PERF_KEYS[i];
    const value = feats[name];
    if (value == null || !isFinite(value)) continue;
    rec.sums[name] = (rec.sums[name] || 0) + value;
    rec.sq[name] = (rec.sq[name] || 0) + value * value;
  }
}

function perfStats(rec) {
  if (!rec || rec.n < 4) return null;
  const out = { n: rec.n };
  for (let i = 0; i < PERF_KEYS.length; i += 1) {
    const name = PERF_KEYS[i];
    const n = rec.sums[name] == null ? 0 : rec.n;
    if (!n) continue;
    const mean = rec.sums[name] / rec.n;
    const std = Math.sqrt(Math.max(0, rec.sq[name] / rec.n - mean * mean)) || 1;
    out[name] = { mean: mean, std: std };
  }
  return out;
}

function gameFeats(game, side, index) {
  const minutes = (game.gl || 0) / 60;
  if (minutes < 8) return null;
  const x = game.x || {};
  const off = side === "blue" ? 0 : 5;
  const opp = side === "blue" ? 5 : 0;
  const kdas = side === "blue" ? game.bk : game.rk;
  const kda = (kdas && kdas[index]) || [0, 0, 0];
  let teamK = 0;
  let teamDmg = 0;
  let teamGold = 0;
  for (let i = 0; i < 5; i += 1) {
    teamK += (kdas[i] && kdas[i][0]) || 0;
    teamDmg += (x.pd && x.pd[off + i]) || 0;
    teamGold += (x.pg && x.pg[off + i]) || 0;
  }
  const dmg = (x.pd && x.pd[off + index]) || 0;
  const oppDmg = (x.pd && x.pd[opp + index]) || 0;
  const cs = (x.pc && x.pc[off + index]) || 0;
  const vis = (x.pv && x.pv[off + index]) || 0;
  const gold = (x.pg && x.pg[off + index]) || 0;
  const lane = x.g15 ? x.g15[index] || 0 : null;
  return {
    gd15: lane == null ? null : side === "blue" ? lane : -lane,
    dpm: dmg / minutes,
    dpmVs: (dmg - oppDmg) / minutes,
    deaths: (kda[1] || 0) / minutes,
    cspm: cs / minutes,
    kp: teamK ? (kda[0] + kda[2]) / teamK : 0,
    vis: vis / minutes,
    kapm: ((kda[0] || 0) + (kda[2] || 0)) / minutes,
    dmgShare: teamDmg ? dmg / teamDmg : 0,
    goldShare: teamGold ? gold / teamGold : 0,
  };
}

function perfBaselines() {
  if (perfMemo) return perfMemo;
  const roleBags = {};
  const champBags = {};
  const games = (window.RIFT_PRO_GAMES && window.RIFT_PRO_GAMES.games) || [];
  for (let g = 0; g < games.length; g += 1) {
    const game = games[g];
    for (let s = 0; s < 2; s += 1) {
      const side = s === 0 ? "blue" : "red";
      const champs = s === 0 ? game.b : game.r;
      for (let i = 0; i < 5; i += 1) {
        const feats = gameFeats(game, side, i);
        if (!feats) continue;
        const role = ROLE_KEYS[i];
        addPerfBag(roleBags, role, feats);
        if (champs && champs[i]) addPerfBag(champBags, champs[i] + "|" + role, feats);
      }
    }
  }
  const role = {};
  const champ = {};
  const roleKeys = Object.keys(roleBags);
  for (let i = 0; i < roleKeys.length; i += 1) role[roleKeys[i]] = perfStats(roleBags[roleKeys[i]]);
  const champKeys = Object.keys(champBags);
  for (let i = 0; i < champKeys.length; i += 1) {
    const rec = champBags[champKeys[i]];
    if (rec.n < PERF_MIN_CHAMP) continue;
    champ[champKeys[i]] = perfStats(rec);
  }
  perfMemo = { role: role, champ: champ };
  return perfMemo;
}

function weightedPerf(feats, weights, baseline) {
  if (!feats || !weights || !baseline) return null;
  let num = 0;
  let den = 0;
  for (let i = 0; i < PERF_KEYS.length; i += 1) {
    const key = PERF_KEYS[i];
    const w = weights[key];
    const value = feats[key];
    const stat = baseline[key];
    if (!w || value == null || !isFinite(value) || !stat) continue;
    let z = (value - stat.mean) / stat.std;
    if (z > PERF_CLAMP) z = PERF_CLAMP;
    if (z < -PERF_CLAMP) z = -PERF_CLAMP;
    num += w * z;
    den += Math.abs(w);
  }
  if (!den) return null;
  return num / den;
}

function attachPerformance(players) {
  const base = perfBaselines();
  for (let i = 0; i < players.length; i += 1) {
    const player = players[i];
    const feats = perfFeats(player);
    const weights = PERF_WEIGHTS[player.role] || PERF_WEIGHTS.MID;
    const roleZ = weightedPerf(feats, weights, base.role[player.role]);
    const champZ = weightedPerf(feats, weights, base.champ[player.id + "|" + player.role]);
    let score = null;
    if (roleZ != null && champZ != null) score = PERF_ROLE * roleZ + PERF_CHAMP * champZ;
    else if (roleZ != null) score = roleZ;
    else if (champZ != null) score = champZ;
    player.perf = score;
    player.perfRole = roleZ;
    player.perfChamp = champZ;
  }
}

function mvpScore(player) {
  const role = MVP_WEIGHTS.roles[player.role] || {};
  const kda = (player.k + player.a) / Math.max(player.d, 1);
  const lead = player.gd15 > 0 ? Math.min(player.gd15 / 2500, 1) : 0;
  return (
    MVP_WEIGHTS.kda * Math.min(kda / 7, 1.5) +
    MVP_WEIGHTS.kp * player.kp * (role.kp || 1) +
    MVP_WEIGHTS.dmg * player.dmgShare * (role.dmg || 1) +
    MVP_WEIGHTS.gold * player.goldShare * (role.gold || 1) +
    MVP_WEIGHTS.vision * player.visShare * (role.vision || 1) +
    MVP_WEIGHTS.lead * lead
  );
}

function pickMvp(players) {
  let best = null;
  let bestScore = -1;
  for (let i = 0; i < players.length; i += 1) {
    const player = players[i];
    if (!player.win) continue;
    const score = mvpScore(player);
    player.mvpScore = score;
    if (score > bestScore) {
      best = player;
      bestScore = score;
    }
  }
  return best;
}

function tile(label, value, tone) {
  const box = node("div", "match-stat-tile");
  box.append(node("span", "lbl", label), node("span", "val" + (tone ? " " + tone : ""), value));
  return box;
}

function diffTone(value) {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "";
}

function renderPlayerPanel(player) {
  const root = els.player;
  root.innerHTML = "";
  if (!player) return;
  const head = node("div", "match-player-head");
  const title = document.createElement("a");
  title.className = "player-link";
  title.href = player.name ? "player.html?player=" + encodeURIComponent(player.name) : "#";
  title.textContent = (player.name ? player.name + " · " : "") + player.champ;
  head.append(title);
  head.append(node("span", "", player.team + " · " + player.role + (player.win ? " · Win" : " · Loss")));
  root.append(head);
  const kdaLine = node("div", "match-player-kda", player.k + " / " + player.d + " / " + player.a);
  root.append(kdaLine);
  const grid = node("div", "match-stat-grid");
  const perfTile = tile(
    "Performance",
    player.perf == null ? "—" : fmtPerf(player.perf),
    player.perf == null || Math.abs(player.perf) < 0.05 ? "" : diffTone(player.perf)
  );
  if (player.perf != null) perfTile.title = perfTitle(player);
  grid.append(perfTile);
  grid.append(tile("Gold", fmtK(player.gold)));
  grid.append(tile("GPM", fmtRate(player.gpm)));
  grid.append(tile("GD@15", player.gd15 == null ? "—" : fmtDiff(player.gd15), diffTone(player.gd15)));
  grid.append(tile("GD@20", player.gd20 == null ? "—" : fmtDiff(player.gd20), diffTone(player.gd20)));
  grid.append(tile("CS", String(player.cs || 0)));
  grid.append(tile("CSPM", fmtRate(player.cspm)));
  grid.append(tile("Damage", fmtK(player.dmg)));
  grid.append(tile("DPM", fmtRate(player.dpm)));
  grid.append(tile("Dmg share", fmtPct(player.dmgShare)));
  grid.append(tile("KP", fmtPct(player.kp)));
  grid.append(tile("Vision", String(player.vis || 0)));
  grid.append(tile("VSPM", fmtRate(player.vspm)));
  root.append(grid);
}

function setHover(player) {
  clearTimeout(hoverTimer);
  hoverKey = player ? player.key : "";
  const picks = document.querySelectorAll(".team .pick");
  for (let i = 0; i < picks.length; i += 1) {
    picks[i].classList.toggle("is-hover", player && picks[i].dataset.player === player.key);
  }
  if (player) {
    els.stats.hidden = true;
    els.player.hidden = false;
    if (els.mid) els.mid.classList.add("is-player");
    renderPlayerPanel(player);
  } else {
    els.stats.hidden = false;
    els.player.hidden = true;
    if (els.mid) els.mid.classList.remove("is-player");
  }
}

function clearHover() {
  hoverTimer = setTimeout(function () {
    setHover(null);
  }, 90);
}

function fmtLength(seconds) {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m + ":" + String(s).padStart(2, "0");
}

function fmtK(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

function fmtDiff(value) {
  const n = Number(value) || 0;
  if (!n) return "0";
  return (n > 0 ? "+" : "−") + fmtK(Math.abs(n));
}

function sumKda(rows, idx) {
  let n = 0;
  const list = rows || [];
  for (let i = 0; i < list.length; i += 1) n += (list[i] && list[i][idx]) || 0;
  return n;
}

function fmtDelta(value) {
  const abs = Math.abs(value).toFixed(1);
  if (value > 0) return "+" + abs;
  if (value < 0) return "−" + abs;
  return "0.0";
}

function fmtPerf(value) {
  if (value == null || !isFinite(value)) return "—";
  if (Math.abs(value) < 0.05) return "0.0";
  return fmtDelta(value);
}

function perfTone(value) {
  if (value == null || !isFinite(value) || Math.abs(value) < 0.05) return "";
  return value > 0 ? "wr-up" : "wr-down";
}

function perfTitle(player) {
  if (!player) return "";
  const bits = [];
  if (player.perfRole != null) bits.push("vs typical " + player.role + " " + fmtPerf(player.perfRole));
  if (player.perfChamp != null) bits.push("vs typical " + player.champ + " " + player.role + " " + fmtPerf(player.perfChamp));
  return bits.join("\n");
}

function perfCell(player) {
  const td = node("td", "num");
  if (!player || player.perf == null) {
    td.textContent = "—";
    return td;
  }
  const tone = perfTone(player.perf);
  if (tone) td.className += " " + tone;
  td.textContent = fmtPerf(player.perf);
  td.title = perfTitle(player);
  return td;
}

function toneClass(value) {
  if (value > 0.05) return "up";
  if (value < -0.05) return "down";
  return "";
}

function lineupOf(game, side) {
  const champs = side === "blue" ? game.b : game.r;
  const names = side === "blue" ? game.bp : game.rp;
  const rows = [];
  for (let i = 0; i < 5; i += 1) {
    if (!champs[i]) continue;
    rows.push({
      id: champs[i],
      name: names[i] || "",
      role: ROLE_KEYS[i],
    });
  }
  return rows;
}

function renderExpect(game) {
  const predict = window.RIFT_PREDICT;
  if (!predict || !predict.matchPredict) return;
  const rec = predict.matchPredict(lineupOf(game, "blue"), lineupOf(game, "red"));
  const bar = node("div", "expect-bar match-expect");
  const blue = node("div", "expect-side expect-blue");
  blue.append(node("span", "", game.bt || "Blue"), node("strong", "", rec.blue.toFixed(1) + "%"));
  const meter = node("div", "expect-meter");
  const fill = node("div", "expect-meter-fill");
  fill.style.width = rec.blue.toFixed(1) + "%";
  meter.append(fill, node("span", "expect-meter-mid"));
  meter.title =
    (game.bt || "Blue") +
    " " +
    rec.blue.toFixed(1) +
    "% · Elo " +
    fmtDelta(rec.elo) +
    " · draft " +
    fmtDelta(rec.draft) +
    " · teams " +
    fmtDelta(rec.team) +
    " · comfort " +
    fmtDelta(rec.comfort) +
    " · style " +
    fmtDelta(rec.style || 0);
  const red = node("div", "expect-side expect-red");
  red.append(node("strong", "", rec.red.toFixed(1) + "%"), node("span", "", game.rt || "Red"));
  const sub = node("p", "expect-sub");
  sub.innerHTML =
    "Elo <span class=\"" +
    toneClass(rec.elo) +
    "\">" +
    fmtDelta(rec.elo) +
    "</span> · draft <span class=\"" +
    toneClass(rec.draft) +
    "\">" +
    fmtDelta(rec.draft) +
    "</span> · teams <span class=\"" +
    toneClass(rec.team) +
    "\">" +
    fmtDelta(rec.team) +
    "</span> · comfort <span class=\"" +
    toneClass(rec.comfort) +
    "\">" +
    fmtDelta(rec.comfort) +
    "</span> · style <span class=\"" +
    toneClass(rec.style || 0) +
    "\">" +
    fmtDelta(rec.style || 0) +
    "</span>";
  bar.append(blue, meter, red, sub);
  els.stats.append(bar);
}

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null && text !== "") el.textContent = text;
  return el;
}

function ahead(left, right) {
  if (left > right) return true;
  if (left < right) return false;
  return null;
}

function pairRow(label, left, right, leftWin) {
  const row = node("div", "match-pair");
  const a = node("span", "val" + (leftWin ? " hot" : ""), left);
  const b = node("span", "lbl", label);
  const c = node("span", "val" + (leftWin === false ? " hot" : ""), right);
  row.append(a, b, c);
  return row;
}

function firstName(flag, blue, red) {
  if (flag === 1) return blue;
  if (flag === 0) return red;
  return "—";
}

function renderStats(game, roster) {
  const root = els.stats;
  if (!root) return;
  root.innerHTML = "";
  const x = game.x || {};
  const blueK = sumKda(game.bk, 0);
  const redK = sumKda(game.rk, 0);
  const blueD = sumKda(game.bk, 1);
  const redD = sumKda(game.rk, 1);
  const blueGold = (x.g && x.g[0]) || 0;
  const redGold = (x.g && x.g[1]) || 0;
  const gd15 = (x.g15 || []).reduce(function (n, v) {
    return n + (v || 0);
  }, 0);
  const gd20 = (x.g20 || []).reduce(function (n, v) {
    return n + (v || 0);
  }, 0);

  const score = node("div", "match-scoreline");
  const left = node("div", "score-side blue");
  left.append(node("strong", "", game.bt), node("span", "kills", String(blueK)));
  const mid = node("div", "score-clock", fmtLength(game.gl) || "vs");
  const right = node("div", "score-side red");
  right.append(node("span", "kills", String(redK)), node("strong", "", game.rt));
  score.append(left, mid, right);
  root.append(score);

  if (blueGold || redGold) {
    const gold = node("div", "match-gold");
    const total = blueGold + redGold || 1;
    const fill = node("div", "gold-fill");
    fill.style.width = ((blueGold / total) * 100).toFixed(1) + "%";
    const track = node("div", "gold-track");
    track.append(fill);
    gold.append(
      node("span", "val blue", fmtK(blueGold)),
      track,
      node("span", "val red", fmtK(redGold))
    );
    root.append(gold);
  }

  const pairs = node("div", "match-pairs");
  pairs.append(pairRow("Kills", String(blueK), String(redK), ahead(blueK, redK)));
  pairs.append(pairRow("Deaths", String(blueD), String(redD), ahead(redD, blueD)));
  if (x.d) pairs.append(pairRow("Damage", fmtK(x.d[0]), fmtK(x.d[1]), ahead(x.d[0], x.d[1])));
  if (x.cs) pairs.append(pairRow("CS", String(x.cs[0]), String(x.cs[1]), ahead(x.cs[0], x.cs[1])));
  if (x.dr) pairs.append(pairRow("Dragons", String(x.dr[0]), String(x.dr[1]), ahead(x.dr[0], x.dr[1])));
  if (x.el && (x.el[0] || x.el[1])) pairs.append(pairRow("Elders", String(x.el[0]), String(x.el[1]), ahead(x.el[0], x.el[1])));
  if (x.ba) pairs.append(pairRow("Barons", String(x.ba[0]), String(x.ba[1]), ahead(x.ba[0], x.ba[1])));
  if (x.at && (x.at[0] || x.at[1])) pairs.append(pairRow("Atakhan", String(x.at[0]), String(x.at[1]), ahead(x.at[0], x.at[1])));
  if (x.he && (x.he[0] || x.he[1])) pairs.append(pairRow("Heralds", String(x.he[0]), String(x.he[1]), ahead(x.he[0], x.he[1])));
  if (x.gr && (x.gr[0] || x.gr[1])) pairs.append(pairRow("Grubs", String(x.gr[0]), String(x.gr[1]), ahead(x.gr[0], x.gr[1])));
  if (x.tw) pairs.append(pairRow("Towers", String(x.tw[0]), String(x.tw[1]), ahead(x.tw[0], x.tw[1])));
  if (x.ih) pairs.append(pairRow("Inhibitors", String(x.ih[0]), String(x.ih[1]), ahead(x.ih[0], x.ih[1])));
  root.append(pairs);

  const firsts = node("div", "match-firsts");
  const firstItems = [
    ["First blood", x.fb],
    ["First dragon", x.fd],
    ["First herald", x.fh],
    ["First baron", x.fba],
    ["First tower", x.ft],
    ["First pick", x.fp],
  ];
  let firstCount = 0;
  for (let i = 0; i < firstItems.length; i += 1) {
    if (firstItems[i][1] !== 0 && firstItems[i][1] !== 1) continue;
    firstCount += 1;
    const pill = node("span", "first-pill " + (firstItems[i][1] === 1 ? "blue" : "red"));
    pill.textContent = firstItems[i][0] + " · " + firstName(firstItems[i][1], game.bt, game.rt);
    firsts.append(pill);
  }
  if (firstCount) root.append(firsts);

  if (gd15 || gd20) {
    const diffs = node("div", "match-diffs");
    if (gd15) diffs.append(node("span", gd15 > 0 ? "wr-up" : "wr-down", "@15 " + fmtDiff(gd15)));
    if (gd20) diffs.append(node("span", gd20 > 0 ? "wr-up" : "wr-down", "@20 " + fmtDiff(gd20)));
    root.append(diffs);
  }

  const table = node("table", "match-lanes");
  const thead = document.createElement("thead");
  const head = document.createElement("tr");
  ["Role", "Blue", "KDA", "Perf", "Dmg", "CS", "GD@15", "Red", "KDA", "Perf", "Dmg", "CS"].forEach(function (label) {
    head.append(node("th", "", label));
  });
  thead.append(head);
  table.append(thead);
  const tbody = document.createElement("tbody");
  for (let i = 0; i < 5; i += 1) {
    const tr = document.createElement("tr");
    const laneDiff = (x.g15 && x.g15[i]) || 0;
    const bDmg = x.pd ? x.pd[i] : 0;
    const rDmg = x.pd ? x.pd[i + 5] : 0;
    const bCs = x.pc ? x.pc[i] : 0;
    const rCs = x.pc ? x.pc[i + 5] : 0;
    tr.append(node("td", "pro-role", ROLE_KEYS[i]));
    tr.append(node("td", "", (game.bp[i] || "") + " · " + champName(game.b[i])));
    tr.append(node("td", "num", fmtKda(game.bk[i])));
    tr.append(perfCell(roster && roster[i]));
    tr.append(node("td", "num", bDmg ? fmtK(bDmg) : "—"));
    tr.append(node("td", "num", bCs || "—"));
    const gd = node("td", "num " + (laneDiff > 0 ? "wr-up" : laneDiff < 0 ? "wr-down" : ""));
    gd.textContent = x.g15 ? fmtDiff(laneDiff) : "—";
    tr.append(gd);
    tr.append(node("td", "", (game.rp[i] || "") + " · " + champName(game.r[i])));
    tr.append(node("td", "num", fmtKda(game.rk[i])));
    tr.append(perfCell(roster && roster[i + 5]));
    tr.append(node("td", "num", rDmg ? fmtK(rDmg) : "—"));
    tr.append(node("td", "num", rCs || "—"));
    tbody.append(tr);
  }
  table.append(tbody);
  root.append(table);
  renderExpect(game);
}

function findGame(id) {
  const rows = (window.RIFT_PRO_GAMES && window.RIFT_PRO_GAMES.games) || [];
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].g === id) return rows[i];
  }
  return null;
}

function renderBans(root, ids) {
  root.innerHTML = "";
  for (let i = 0; i < 5; i += 1) {
    const slot = document.createElement("div");
    slot.className = "ban";
    const id = ids && ids[i];
    if (id) {
      slot.classList.add("filled");
      const img = document.createElement("img");
      img.src = portrait(id);
      img.alt = champName(id);
      slot.append(img);
      slot.title = champName(id);
    }
    root.append(slot);
  }
}

function renderPicks(root, game, side, roster) {
  root.innerHTML = "";
  for (let i = 0; i < 5; i += 1) {
    const player = roster[i];
    const slot = document.createElement("article");
    slot.className = "pick filled";
    slot.tabIndex = 0;
    slot.dataset.player = player.key;
    if (mvpPlayer && player.key === mvpPlayer.key) slot.classList.add("mvp");
    if (focus && player.id === focus) slot.classList.add("hl");
    const art = document.createElement("img");
    art.className = "pick-art";
    art.src = loadingArt(player.id);
    art.alt = player.champ;
    const meta = document.createElement("div");
    meta.className = "pick-meta";
    const name = document.createElement("a");
    name.className = "pick-name";
    name.href = player.name ? "player.html?player=" + encodeURIComponent(player.name) : "#";
    name.textContent = (player.name ? player.name + " · " : "") + player.champ;
    const kda = document.createElement("span");
    kda.className = "match-kda";
    kda.textContent = player.k + " / " + player.d + " / " + player.a;
    const perf = document.createElement("span");
    const tone = perfTone(player.perf);
    perf.className = "match-perf" + (tone ? " " + tone : "");
    perf.textContent = player.perf == null ? "—" : fmtPerf(player.perf);
    perf.title = perfTitle(player) || "Performance vs typical role / champion";
    const scores = document.createElement("div");
    scores.className = "pick-scores";
    scores.append(kda, perf);
    const role = document.createElement("span");
    role.className = "role-btn";
    role.textContent = player.role;
    meta.append(name, scores, role);
    slot.append(art, meta);
    slot.addEventListener("mouseenter", function () {
      setHover(player);
    });
    slot.addEventListener("mouseleave", clearHover);
    slot.addEventListener("focus", function () {
      setHover(player);
    });
    slot.addEventListener("blur", clearHover);
    root.append(slot);
  }
}

function teamHref(name) {
  return name ? "team.html?team=" + encodeURIComponent(name) : "";
}

function setTeamLink(el, name) {
  if (!el) return;
  el.textContent = name || "—";
  if (name) el.href = teamHref(name);
  else el.removeAttribute("href");
}

function setStyleChip(el, style) {
  if (!el) return;
  if (!style || !window.CompStyles) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = CompStyles.chipHtml(style);
}

function renderStyles(game) {
  if (!window.CompStyles) {
    setStyleChip(els.blueStyle, null);
    setStyleChip(els.redStyle, null);
    if (els.styleNote) els.styleNote.hidden = true;
    return;
  }
  const blueStyle = CompStyles.classify(game.b || []);
  const redStyle = CompStyles.classify(game.r || []);
  setStyleChip(els.blueStyle, blueStyle);
  setStyleChip(els.redStyle, redStyle);
  if (!els.styleNote) return;
  const note = CompStyles.matchup(blueStyle, redStyle);
  if (!note) {
    els.styleNote.hidden = true;
    els.styleNote.textContent = "";
    return;
  }
  els.styleNote.hidden = false;
  els.styleNote.innerHTML =
    '<a class="match-style-link" href="matches.html">' +
    note.headline +
    "</a><span class=\"muted\"> · " +
    note.detail +
    "</span>";
}

function render(game) {
  currentGame = game;
  const roster = playersOf(game);
  attachPerformance(roster);
  const blue = roster.slice(0, 5);
  const red = roster.slice(5, 10);
  mvpPlayer = pickMvp(roster);
  els.title.textContent = game.bt + " vs " + game.rt;
  document.title = game.bt + " vs " + game.rt + " — Match preview";
  setTeamLink(els.blueName, game.bt);
  setTeamLink(els.redName, game.rt);
  renderStyles(game);
  const blueWin = game.w === 1;
  els.blueTeam.classList.toggle("winner", blueWin);
  els.redTeam.classList.toggle("winner", !blueWin);
  els.result.textContent = blueWin ? game.bt + " win" : game.rt + " win";
  els.result.className = "result " + (blueWin ? "blue" : "red");
  els.meta.textContent = [game.l, game.d, game.p ? "Patch " + game.p : ""].filter(Boolean).join(" · ");
  els.length.hidden = true;
  if (els.mvp) {
    els.mvp.textContent = mvpPlayer
      ? "MVP · " + (mvpPlayer.name ? mvpPlayer.name + " · " : "") + mvpPlayer.champ
      : "";
  }
  renderStats(game, roster);
  renderBans(els.blueBans, game.bb);
  renderBans(els.redBans, game.rb);
  renderPicks(els.bluePicks, game, "blue", blue);
  renderPicks(els.redPicks, game, "red", red);
  const splashId = (mvpPlayer && mvpPlayer.id) || (focus && (game.b.indexOf(focus) !== -1 || game.r.indexOf(focus) !== -1) ? focus : game.b[2] || game.b[0]);
  if (splashId) {
    els.splash.style.backgroundImage = 'url("' + splashArt(splashId) + '")';
    els.splash.classList.add("on");
  }
  const back = params.get("from") || "matches.html";
  els.back.href = back;
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
    const game = findGame(gameId);
    if (!game) throw new Error("Match not found");
    if (els.player) {
      els.player.addEventListener("mouseenter", function () {
        clearTimeout(hoverTimer);
      });
      els.player.addEventListener("mouseleave", clearHover);
    }
    render(game);
    showApp();
  } catch (error) {
    if (els.bootStatus) els.bootStatus.textContent = error.message;
  }
}

boot();
