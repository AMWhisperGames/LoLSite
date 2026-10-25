const DDRAGON = "https://ddragon.leagueoflegends.com";
const LEAGUES = ["All", "LPL", "LCK", "LEC", "LCS", "Worlds", "MSI"];
const RECENT_DAYS = 60;
const ROLE_KEYS = ["TOP", "JNG", "MID", "ADC", "SUP"];
const ROLE_ALIASES = {
  top: "TOP",
  toplane: "TOP",
  jng: "JNG",
  jg: "JNG",
  jungle: "JNG",
  jungler: "JNG",
  mid: "MID",
  middle: "MID",
  adc: "ADC",
  bot: "ADC",
  botlane: "ADC",
  bottom: "ADC",
  sup: "SUP",
  supp: "SUP",
  support: "SUP",
};

const els = {
  boot: document.getElementById("boot"),
  bootStatus: document.getElementById("boot-status"),
  app: document.getElementById("app"),
  title: document.getElementById("matches-title"),
  range: document.getElementById("matches-range"),
  teams: document.getElementById("matches-teams"),
  teamMenu: document.getElementById("matches-team-menu"),
  champs: document.getElementById("matches-champs"),
  champMenu: document.getElementById("matches-champ-menu"),
  champRoles: document.getElementById("matches-champ-roles"),
  players: document.getElementById("matches-players"),
  playerMenu: document.getElementById("matches-player-menu"),
  picks: document.getElementById("matches-picks"),
  leagues: document.getElementById("matches-leagues"),
  windows: document.getElementById("matches-windows"),
  patches: document.getElementById("matches-patches"),
  acc: document.getElementById("matches-acc"),
  body: document.getElementById("matches-body"),
};

let bundle = { games: [] };
let league = "All";
let windowKey = "recent";
let gamePatch = "All";
let teamFilters = [];
let lastTeam = "";
let champFilters = [];
let champRole = "";
let playerFilters = [];
let patch = "";
let champMap = new Map();
let seriesMeta = {};
const predictCache = {};

function seriesKey(game) {
  const teams = [game.bt || "", game.rt || ""].sort();
  return (game.d || "") + "|" + (game.l || "") + "|" + teams.join("|");
}

function parseGameNo(id) {
  const match = String(id || "").match(/_game_(\d+)$/i);
  return match ? Number(match[1]) : 0;
}

function buildSeriesMeta(games) {
  const groups = {};
  const meta = {};
  for (let i = 0; i < games.length; i += 1) {
    const game = games[i];
    const key = seriesKey(game);
    (groups[key] || (groups[key] = [])).push({ game: game, idx: i });
  }
  const keys = Object.keys(groups);
  for (let g = 0; g < keys.length; g += 1) {
    const list = groups[keys[g]];
    list.sort(function (a, b) {
      const na = parseGameNo(a.game.g);
      const nb = parseGameNo(b.game.g);
      if (na && nb && na !== nb) return na - nb;
      const idCmp = String(a.game.g || "").localeCompare(String(b.game.g || ""), undefined, {
        numeric: true,
      });
      if (idCmp) return idCmp;
      return a.idx - b.idx;
    });
    let rank = list[0].idx;
    for (let i = 1; i < list.length; i += 1) if (list[i].idx < rank) rank = list[i].idx;
    for (let i = 0; i < list.length; i += 1) {
      meta[list[i].game.g] = {
        n: parseGameNo(list[i].game.g) || i + 1,
        of: list.length,
        key: keys[g],
        rank: rank,
      };
    }
  }
  return meta;
}

function sortMatches(rows) {
  return rows.slice().sort(function (a, b) {
    const da = a.d || "";
    const db = b.d || "";
    if (da !== db) return db.localeCompare(da);
    const ma = seriesMeta[a.g] || {};
    const mb = seriesMeta[b.g] || {};
    const ra = ma.rank != null ? ma.rank : 0;
    const rb = mb.rank != null ? mb.rank : 0;
    if (ra !== rb) return ra - rb;
    const na = ma.n || 0;
    const nb = mb.n || 0;
    if (na !== nb) return na - nb;
    return String(a.g || "").localeCompare(String(b.g || ""), undefined, { numeric: true });
  });
}

function portrait(id) {
  return DDRAGON + "/cdn/" + patch + "/img/champion/" + id + ".png";
}

function champName(id) {
  return (champMap.get(id) && champMap.get(id).name) || id || "";
}

function champSlug(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function playerKey(name) {
  return (name || "").trim().toLowerCase();
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

function parseRole(raw) {
  return ROLE_ALIASES[String(raw || "").toLowerCase().replace(/[^a-z]/g, "")] || "";
}

function parseChampQuery(raw) {
  const parts = String(raw || "").trim().split(/\s+/).filter(Boolean);
  let role = "";
  const words = [];
  for (let i = 0; i < parts.length; i += 1) {
    const hit = parseRole(parts[i]);
    if (hit) role = hit;
    else words.push(parts[i]);
  }
  return { q: words.join(" "), role: role };
}

function parseChampSpecs(raw) {
  if (!raw) return [];
  return raw.split(",").map(function (part) {
    const bits = part.split("::");
    const id = (bits[0] || "").trim();
    if (!champMap.has(id)) return null;
    return { id: id, role: bits[1] || "", team: bits[2] || "" };
  }).filter(Boolean);
}

function parseList(raw) {
  if (!raw) return [];
  return raw.split(",").map(function (part) {
    return part.trim();
  }).filter(Boolean);
}

function windowMatches() {
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

function sideOfTeam(game, name) {
  if (game.bt === name) return "b";
  if (game.rt === name) return "r";
  return "";
}

function sideChamps(game, side) {
  return side === "b" ? game.b || [] : game.r || [];
}

function sidePlayers(game, side) {
  return side === "b" ? game.bp || [] : game.rp || [];
}

function allPlayers(game) {
  return (game.bp || []).concat(game.rp || []);
}

function champOnSide(game, side, spec) {
  const champs = sideChamps(game, side);
  if (!spec.role) return champs.indexOf(spec.id) !== -1;
  const idx = ROLE_KEYS.indexOf(spec.role);
  return idx >= 0 && champs[idx] === spec.id;
}

function gameHasChamp(game, spec) {
  if (spec.team) {
    const side = sideOfTeam(game, spec.team);
    return !!(side && champOnSide(game, side, spec));
  }
  return champOnSide(game, "b", spec) || champOnSide(game, "r", spec);
}

function gameHasPlayer(game, name) {
  const want = playerKey(name);
  const names = allPlayers(game);
  for (let i = 0; i < names.length; i += 1) {
    if (playerKey(names[i]) === want) return true;
  }
  return false;
}

function listTeams() {
  const seen = {};
  const rows = windowMatches();
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].bt) seen[rows[i].bt] = true;
    if (rows[i].rt) seen[rows[i].rt] = true;
  }
  return Object.keys(seen).sort(function (a, b) {
    return a.localeCompare(b);
  });
}

function listPlayers() {
  const seen = {};
  const rows = windowMatches();
  for (let i = 0; i < rows.length; i += 1) {
    const names = allPlayers(rows[i]);
    for (let n = 0; n < names.length; n += 1) {
      if (names[n]) seen[names[n]] = true;
    }
  }
  return Object.keys(seen).sort(function (a, b) {
    return a.localeCompare(b);
  });
}

function searchNames(all, q, selected, limit) {
  const needle = q.trim().toLowerCase();
  const out = [];
  for (let i = 0; i < all.length; i += 1) {
    const name = all[i];
    if (selected.indexOf(name) !== -1) continue;
    if (needle && name.toLowerCase().indexOf(needle) === -1) continue;
    out.push(name);
    if (out.length >= (limit || 12)) break;
  }
  return out;
}

function searchChamps(raw) {
  const parsed = parseChampQuery(raw);
  const slug = champSlug(parsed.q);
  const out = [];
  champMap.forEach(function (champ, id) {
    if (!slug) return;
    if (champSlug(id).indexOf(slug) === -1 && champSlug(champ.name).indexOf(slug) === -1) return;
    out.push(id);
  });
  out.sort(function (a, b) {
    const an = champSlug(champName(a));
    const bn = champSlug(champName(b));
    const as = an.indexOf(slug) === 0 ? 0 : 1;
    const bs = bn.indexOf(slug) === 0 ? 0 : 1;
    if (as !== bs) return as - bs;
    return champName(a).localeCompare(champName(b));
  });
  return { ids: out.slice(0, 8), role: parsed.role };
}

function toggleTeam(name) {
  if (!name) return;
  const next = [];
  let found = false;
  for (let i = 0; i < teamFilters.length; i += 1) {
    if (teamFilters[i] === name) found = true;
    else next.push(teamFilters[i]);
  }
  if (!found) {
    if (next.length >= 2) next[1] = name;
    else next.push(name);
    lastTeam = name;
  } else {
    champFilters = champFilters.map(function (spec) {
      if (spec.team !== name) return spec;
      return { id: spec.id, role: spec.role, team: next[next.length - 1] || "" };
    });
    if (lastTeam === name) lastTeam = next[next.length - 1] || "";
  }
  teamFilters = next;
}

function champIndex(id, team) {
  for (let i = 0; i < champFilters.length; i += 1) {
    if (champFilters[i].id === id && (champFilters[i].team || "") === (team || "")) return i;
  }
  return -1;
}

function toggleChamp(id, team, role) {
  if (!id || !champMap.has(id)) return;
  const assigned = team || "";
  const idx = champIndex(id, assigned);
  if (idx !== -1) {
    champFilters.splice(idx, 1);
    return;
  }
  champFilters.push({ id: id, role: role || "", team: assigned });
}

function cycleChampRole(index) {
  const spec = champFilters[index];
  if (!spec) return;
  const cur = ROLE_KEYS.indexOf(spec.role);
  spec.role = cur === ROLE_KEYS.length - 1 ? "" : ROLE_KEYS[cur + 1] || ROLE_KEYS[0];
}

function cycleChampTeam(index) {
  const spec = champFilters[index];
  if (!spec || !teamFilters.length) return;
  const cur = teamFilters.indexOf(spec.team);
  spec.team = cur === teamFilters.length - 1 ? "" : teamFilters[cur + 1] || teamFilters[0];
}

function togglePlayer(name) {
  if (!name) return;
  const key = playerKey(name);
  const next = [];
  let found = false;
  for (let i = 0; i < playerFilters.length; i += 1) {
    if (playerKey(playerFilters[i]) === key) found = true;
    else next.push(playerFilters[i]);
  }
  if (!found) next.push(name);
  playerFilters = next;
}

function listMatches() {
  const rows = windowMatches();
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const game = rows[i];
    if (gamePatch !== "All" && game.p !== gamePatch) continue;
    if (teamFilters.length === 1 && !sideOfTeam(game, teamFilters[0])) continue;
    if (teamFilters.length === 2) {
      const a = sideOfTeam(game, teamFilters[0]);
      const b = sideOfTeam(game, teamFilters[1]);
      if (!a || !b || a === b) continue;
    }
    let champsOk = true;
    for (let c = 0; c < champFilters.length; c += 1) {
      if (!gameHasChamp(game, champFilters[c])) {
        champsOk = false;
        break;
      }
    }
    if (!champsOk) continue;
    let playersOk = true;
    for (let p = 0; p < playerFilters.length; p += 1) {
      if (!gameHasPlayer(game, playerFilters[p])) {
        playersOk = false;
        break;
      }
    }
    if (!playersOk) continue;
    out.push(game);
  }
  return sortMatches(out);
}

function lineupOf(game, side) {
  const champs = side === "blue" ? game.b : game.r;
  const names = side === "blue" ? game.bp : game.rp;
  const rows = [];
  for (let i = 0; i < 5; i += 1) {
    if (!champs || !champs[i]) continue;
    rows.push({ id: champs[i], name: (names && names[i]) || "", role: ROLE_KEYS[i] });
  }
  return rows;
}

function predictGame(game) {
  const predict = window.RIFT_PREDICT;
  if (!predict || !predict.matchPredict || !game || !game.g) return null;
  if (predictCache[game.g]) return predictCache[game.g];
  const rec = predict.matchPredict(lineupOf(game, "blue"), lineupOf(game, "red"));
  predictCache[game.g] = rec;
  return rec;
}

function predictedWinner(game, rec) {
  if (!rec || rec.blue === rec.red) return "";
  return rec.blue > rec.red ? "blue" : "red";
}

function renderAcc(rows) {
  if (!els.acc) return;
  let hits = 0;
  let n = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const rec = predictGame(rows[i]);
    const pick = predictedWinner(rows[i], rec);
    if (!pick) continue;
    n += 1;
    if (pick === (rows[i].w === 1 ? "blue" : "red")) hits += 1;
  }
  if (!n) {
    els.acc.hidden = true;
    els.acc.innerHTML = "";
    return;
  }
  const pct = (hits / n) * 100;
  els.acc.hidden = false;
  els.acc.innerHTML = "<b>" + pct.toFixed(1) + "%</b><span>pred acc</span>";
  els.acc.title = hits.toLocaleString() + " / " + n.toLocaleString() + " predicted correctly";
  els.acc.className = "matches-acc " + (pct >= 50 ? "wr-up" : "wr-down");
}

function champActive(id, team) {
  return champIndex(id, team) !== -1 || champIndex(id, "") !== -1;
}

function champCell(ids, team, win, style) {
  const td = document.createElement("td");
  const wrap = document.createElement("div");
  wrap.className = "match-side" + (win ? " win" : "");
  const head = document.createElement("div");
  head.className = "match-side-head";
  const name = document.createElement("a");
  name.className = "match-side-name";
  name.textContent = team || "—";
  if (team) {
    name.href = "team.html?team=" + encodeURIComponent(team);
    name.title = "Open " + team;
    name.addEventListener("click", function (event) {
      event.stopPropagation();
    });
  }
  head.append(name);
  if (style && window.CompStyles) {
    const chip = document.createElement("span");
    chip.className = "match-side-style";
    chip.innerHTML = CompStyles.chipHtml(style, { compact: true });
    head.append(chip);
  }
  const icons = document.createElement("div");
  icons.className = "match-icons";
  for (let i = 0; i < 5; i += 1) {
    const id = ids && ids[i];
    if (!id) continue;
    const img = document.createElement("img");
    img.src = portrait(id);
    img.alt = champName(id);
    img.title = champName(id) + (team ? " · " + team : "") + " · " + ROLE_KEYS[i];
    if (champActive(id, team)) img.className = "active";
    img.addEventListener("click", function (event) {
      event.stopPropagation();
      if (team && teamFilters.indexOf(team) === -1 && teamFilters.length < 2) toggleTeam(team);
      toggleChamp(id);
      render();
    });
    icons.append(img);
  }
  wrap.append(head, icons);
  td.append(wrap);
  return td;
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

function bindCombo(input, menu, renderMenu, onEnter) {
  if (!input || !menu) return;
  input.addEventListener("input", renderMenu);
  input.addEventListener("focus", renderMenu);
  input.addEventListener("blur", function () {
    setTimeout(function () {
      hideMenu(menu);
    }, 120);
  });
  input.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      input.value = "";
      hideMenu(menu);
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    onEnter();
  });
}

function renderTeamMenu() {
  fillMenu(
    els.teamMenu,
    searchNames(listTeams(), els.teams.value, teamFilters, 12),
    function (button, name) {
      button.textContent = name;
    },
    function (name) {
      toggleTeam(name);
      els.teams.value = "";
      hideMenu(els.teamMenu);
      render();
    }
  );
}

function renderChampMenu() {
  const hits = searchChamps(els.champs.value);
  fillMenu(
    els.champMenu,
    hits.ids,
    function (button, id) {
      const img = document.createElement("img");
      img.src = portrait(id);
      img.alt = "";
      const label = champName(id) + (hits.role ? " · " + hits.role : "");
      button.append(img, document.createTextNode(label));
    },
    function (id) {
      toggleChamp(id, "", hits.role || champRole);
      els.champs.value = "";
      hideMenu(els.champMenu);
      render();
    }
  );
}

function renderPlayerMenu() {
  fillMenu(
    els.playerMenu,
    searchNames(listPlayers(), els.players.value, playerFilters, 12),
    function (button, name) {
      button.textContent = name;
    },
    function (name) {
      togglePlayer(name);
      els.players.value = "";
      hideMenu(els.playerMenu);
      render();
    }
  );
}

function shortTeam(name) {
  if (!name) return "";
  const parts = name.split(/\s+/);
  if (name.length <= 14) return name;
  return parts.map(function (part) {
    return part[0];
  }).join("").toUpperCase() || name;
}

function renderPicks() {
  if (!els.picks) return;
  els.picks.innerHTML = "";
  const has = teamFilters.length || champFilters.length || playerFilters.length;
  els.picks.hidden = !has;
  for (let i = 0; i < teamFilters.length; i += 1) {
    if (i === 1) {
      const vs = document.createElement("span");
      vs.className = "chip-vs";
      vs.textContent = "vs";
      els.picks.append(vs);
    }
    const name = teamFilters[i];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "active";
    button.textContent = name;
    button.addEventListener("click", function () {
      toggleTeam(name);
      render();
    });
    els.picks.append(button);
  }
  for (let i = 0; i < champFilters.length; i += 1) {
    const spec = champFilters[i];
    const idx = i;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "active";
    const img = document.createElement("img");
    img.src = portrait(spec.id);
    img.alt = "";
    button.append(img, document.createTextNode(champName(spec.id)));
    if (spec.team || teamFilters.length) {
      const teamBtn = document.createElement("span");
      teamBtn.className = "chip-team";
      teamBtn.textContent = spec.team ? shortTeam(spec.team) : "any";
      teamBtn.title = spec.team || "Any team";
      teamBtn.addEventListener("click", function (event) {
        event.stopPropagation();
        cycleChampTeam(idx);
        render();
      });
      button.append(teamBtn);
    }
    const roleBtn = document.createElement("span");
    roleBtn.className = "chip-role";
    roleBtn.textContent = spec.role || "any";
    roleBtn.title = "Cycle role";
    roleBtn.addEventListener("click", function (event) {
      event.stopPropagation();
      cycleChampRole(idx);
      render();
    });
    button.append(roleBtn);
    button.addEventListener("click", function () {
      champFilters.splice(idx, 1);
      render();
    });
    els.picks.append(button);
  }
  for (let i = 0; i < playerFilters.length; i += 1) {
    const name = playerFilters[i];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "active";
    button.textContent = name;
    button.addEventListener("click", function () {
      togglePlayer(name);
      render();
    });
    els.picks.append(button);
  }
}

function render() {
  els.title.textContent = league === "All" ? (bundle.leagues || LEAGUES.slice(1)).join(" · ") : league;
  chipRow(els.leagues, LEAGUES, league, function (name) {
    league = name;
    render();
  });
  RIFT_WINDOW.mount(els.windows, function () {
    windowKey = RIFT_WINDOW.key;
    render();
  });
  const patches = listPatches(windowMatches());
  if (gamePatch !== "All" && patches.indexOf(gamePatch) === -1) gamePatch = "All";
  chipRow(els.patches, ["All"].concat(patches), gamePatch, function (name) {
    gamePatch = name;
    render();
  });
  chipRow(els.champRoles, ["Any role"].concat(ROLE_KEYS), champRole || "Any role", function (name) {
    champRole = name === "Any role" ? "" : name;
    if (els.champs && els.champs.value) renderChampMenu();
  });
  renderPicks();
  const rows = listMatches();
  els.range.textContent = rows.length.toLocaleString() + " matches";
  renderAcc(rows);
  els.body.innerHTML = "";
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 7;
    td.className = "pick-empty";
    td.textContent = "No matches match that filter.";
    tr.append(td);
    els.body.append(tr);
    return;
  }
  for (let i = 0; i < rows.length; i += 1) {
    const game = rows[i];
    const tr = document.createElement("tr");
    tr.addEventListener("click", function () {
      location.href = "match.html?g=" + encodeURIComponent(game.g);
    });
    const meta = seriesMeta[game.g] || {};
    const prev = i > 0 ? seriesMeta[rows[i - 1].g] || {} : {};
    if (i === 0 || meta.key !== prev.key) tr.classList.add("series-start");
    const date = document.createElement("td");
    date.textContent = game.d || "—";
    const leagueCell = document.createElement("td");
    leagueCell.textContent = game.l || "—";
    const gameNo = document.createElement("td");
    gameNo.className = "game-no";
    gameNo.textContent = meta.n ? String(meta.n) : "—";
    if (meta.of > 1) gameNo.title = "Game " + meta.n + " of " + meta.of;
    const patchCell = document.createElement("td");
    patchCell.textContent = game.p || "—";
    const winner = document.createElement("td");
    winner.className = game.w === 1 ? "side-blue" : "side-red";
    winner.textContent = (game.w === 1 ? game.bt : game.rt) || "—";
    const rec = predictGame(game);
    const pick = predictedWinner(game, rec);
    const styleRec = rec && rec.styleRec;
    if (rec && pick) {
      let tip =
        "Predicted " +
        (pick === "blue" ? game.bt : game.rt) +
        " " +
        Math.max(rec.blue, rec.red).toFixed(1) +
        "%";
      if (styleRec && styleRec.note) tip += " · " + styleRec.note.headline;
      if (rec.style) tip += " · style " + (rec.style > 0 ? "+" : "") + rec.style.toFixed(1);
      winner.title = tip;
    }
    tr.append(
      date,
      leagueCell,
      gameNo,
      patchCell,
      champCell(game.b, game.bt, game.w === 1, styleRec && styleRec.blue),
      champCell(game.r, game.rt, game.w === 0, styleRec && styleRec.red),
      winner
    );
    els.body.append(tr);
  }
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
    bundle = window.RIFT_PRO_GAMES || bundle;
    if (!bundle.games || !bundle.games.length) throw new Error("Missing pro game logs");
    seriesMeta = buildSeriesMeta(bundle.games);
    const params = new URLSearchParams(location.search);
    if (params.get("league")) league = params.get("league");
    if (params.get("window")) {
      RIFT_WINDOW.init(params.get("window"));
      windowKey = RIFT_WINDOW.key;
    }
    if (params.get("patch")) gamePatch = params.get("patch");
    teamFilters = parseList(params.get("team")).slice(0, 2);
    lastTeam = teamFilters[teamFilters.length - 1] || "";
    champFilters = parseChampSpecs(params.get("champ"));
    playerFilters = parseList(params.get("player"));
    bindCombo(els.teams, els.teamMenu, renderTeamMenu, function () {
      const hits = searchNames(listTeams(), els.teams.value, teamFilters, 1);
      if (!hits.length) return;
      toggleTeam(hits[0]);
      els.teams.value = "";
      hideMenu(els.teamMenu);
      render();
    });
    bindCombo(els.champs, els.champMenu, renderChampMenu, function () {
      const hits = searchChamps(els.champs.value);
      if (!hits.ids.length) return;
      toggleChamp(hits.ids[0], "", hits.role);
      els.champs.value = "";
      hideMenu(els.champMenu);
      render();
    });
    bindCombo(els.players, els.playerMenu, renderPlayerMenu, function () {
      const hits = searchNames(listPlayers(), els.players.value, playerFilters, 1);
      if (!hits.length) return;
      togglePlayer(hits[0]);
      els.players.value = "";
      hideMenu(els.playerMenu);
      render();
    });
    render();
    showApp();
    if (els.teams) els.teams.focus();
  } catch (error) {
    if (els.bootStatus) els.bootStatus.textContent = error.message;
  }
}

boot();
