const DDRAGON = "https://ddragon.leagueoflegends.com";
const ROLES = ["All", "TOP", "JNG", "MID", "ADC", "SUP"];
const ROLE_KEYS = ["top", "jng", "mid", "adc", "sup"];
const LEAGUES = ["All", "LPL", "LCK", "LEC", "LCS", "Worlds", "MSI"];
const RECENT_DAYS = 60;

const els = {
  boot: document.getElementById("boot"),
  bootStatus: document.getElementById("boot-status"),
  app: document.getElementById("app"),
  title: document.getElementById("games-title"),
  back: document.getElementById("back-pro"),
  leagues: document.getElementById("games-leagues"),
  roles: document.getElementById("games-roles"),
  windows: document.getElementById("games-windows"),
  body: document.getElementById("games-body"),
};

const params = new URLSearchParams(location.search);
let patch = "";
let champMap = new Map();
let bundle = { games: [] };
let champ = params.get("champ") || "";
let league = params.get("league") || "All";
let team = params.get("team") || "";
let role = params.get("role") || "All";
RIFT_WINDOW.init(params.get("window"));
let windowKey = RIFT_WINDOW.key;
let gamePatch = params.get("patch") || "All";

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

function kda(row) {
  return row[0] + "/" + row[1] + "/" + row[2];
}

function listGames() {
  const cutoff = cutoffDate();
  const want = role === "All" ? -1 : ROLE_KEYS.indexOf(role.toLowerCase());
  const out = [];
  const rows = bundle.games || [];
  for (let i = 0; i < rows.length; i += 1) {
    const game = rows[i];
    if (league !== "All" && game.l !== league) continue;
    if (cutoff && game.d < cutoff) continue;
    if (gamePatch !== "All" && game.p !== gamePatch) continue;
    if (team && game.bt !== team && game.rt !== team) continue;
    for (let r = 0; r < 5; r += 1) {
      if (want >= 0 && r !== want) continue;
      let side = "";
      if (game.b[r] === champ) side = "b";
      else if (game.r[r] === champ) side = "r";
      if (!side) continue;
      if (team && (side === "b" ? game.bt : game.rt) !== team) continue;
      const win = side === "b" ? game.w === 1 : game.w === 0;
      const vs = side === "b" ? game.r[r] : game.b[r];
      const names = side === "b" ? game.bp : game.rp;
      const kdas = side === "b" ? game.bk : game.rk;
      out.push({
        id: game.g,
        date: game.d,
        league: game.l,
        patch: game.p,
        role: ROLE_KEYS[r],
        player: names[r],
        team: side === "b" ? game.bt : game.rt,
        opp: side === "b" ? game.rt : game.bt,
        vs: vs,
        kda: kdas[r],
        win: win,
      });
    }
  }
  return out;
}

function render() {
  if (!champ) {
    els.title.textContent = "Pick a champion from Pro";
    els.body.innerHTML = "";
    return;
  }
  els.title.textContent = champName(champ);
  document.title = champName(champ) + " — Recent games";
  els.back.href =
    "pro.html?champ=" +
    encodeURIComponent(champ) +
    "&league=" +
    encodeURIComponent(league) +
    "&window=" +
    encodeURIComponent(RIFT_WINDOW.param()) +
    "&patch=" +
    encodeURIComponent(gamePatch) +
    (team ? "&team=" + encodeURIComponent(team) : "");

  chipRow(els.leagues, LEAGUES, league, function (name) {
    league = name;
    render();
  });
  chipRow(els.roles, ROLES, role, function (name) {
    role = name;
    render();
  });
  RIFT_WINDOW.mount(els.windows, function () {
    windowKey = RIFT_WINDOW.key;
    render();
  });

  const rows = listGames();
  els.body.innerHTML = "";
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.className = "pick-empty";
    td.textContent = "No games match that filter.";
    tr.append(td);
    els.body.append(tr);
    return;
  }
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const tr = document.createElement("tr");
    tr.addEventListener("click", function () {
      location.href =
        "match.html?g=" +
        encodeURIComponent(row.id) +
        "&champ=" +
        encodeURIComponent(champ) +
        "&from=" +
        encodeURIComponent(
          "games.html?champ=" +
            encodeURIComponent(champ) +
            "&league=" +
            encodeURIComponent(league) +
            "&window=" +
            encodeURIComponent(RIFT_WINDOW.param())
        );
    });
    const cells = [
      row.date,
      row.league,
      row.role.toUpperCase(),
      row.team + " vs " + row.opp,
    ];
    for (let c = 0; c < 3; c += 1) {
      const td = document.createElement("td");
      td.textContent = cells[c];
      tr.append(td);
    }
    const playerCell = document.createElement("td");
    if (row.player) {
      const link = document.createElement("a");
      link.className = "player-link";
      link.href = "player.html?player=" + encodeURIComponent(row.player);
      link.textContent = row.player;
      link.addEventListener("click", function (event) {
        event.stopPropagation();
      });
      playerCell.append(link);
    } else playerCell.textContent = "—";
    tr.append(playerCell);
    const teams = document.createElement("td");
    teams.textContent = cells[3];
    tr.append(teams);
    const vs = document.createElement("td");
    const wrap = document.createElement("div");
    wrap.className = "pro-champ";
    const img = document.createElement("img");
    img.src = portrait(row.vs);
    img.alt = champName(row.vs);
    const name = document.createElement("span");
    name.textContent = champName(row.vs);
    wrap.append(img, name);
    vs.append(wrap);
    tr.append(vs);

    const kdaCell = document.createElement("td");
    kdaCell.textContent = kda(row.kda);
    tr.append(kdaCell);

    const result = document.createElement("td");
    result.className = "num " + (row.win ? "wr-up" : "wr-down");
    result.textContent = row.win ? "Win" : "Loss";
    tr.append(result);
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
    render();
    showApp();
  } catch (error) {
    if (els.bootStatus) els.bootStatus.textContent = error.message;
  }
}

boot();
