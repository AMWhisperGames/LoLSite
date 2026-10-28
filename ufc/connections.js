"use strict";

(function () {
  const data = window.UFC_MODEL || { rankings: [] };
  const fighters = Array.isArray(data.rankings) ? data.rankings : [];
  const TOP_POOL = 40;
  const MAX_PATH_HOPS = 6;
  const MAX_GRAPH_NODES = 48;

  const els = {
    summary: document.getElementById("ufc-summary"),
    tabNetwork: document.getElementById("tab-network"),
    tabGame: document.getElementById("tab-game"),
    panelNetwork: document.getElementById("panel-network"),
    panelGame: document.getElementById("panel-game"),
    netA: document.getElementById("net-a"),
    netB: document.getElementById("net-b"),
    netAMenu: document.getElementById("net-a-menu"),
    netBMenu: document.getElementById("net-b-menu"),
    netSwap: document.getElementById("net-swap"),
    netStatus: document.getElementById("net-status"),
    canvas: document.getElementById("net-canvas"),
    tooltip: document.getElementById("net-tooltip"),
    pathBox: document.getElementById("net-path"),
    pathList: document.getElementById("net-path-list"),
    pathNote: document.getElementById("net-path-note"),
    gameStartName: document.getElementById("game-start-name"),
    gameStartMeta: document.getElementById("game-start-meta"),
    gameEndName: document.getElementById("game-end-name"),
    gameEndMeta: document.getElementById("game-end-meta"),
    gameStatus: document.getElementById("game-status"),
    gameChain: document.getElementById("game-chain"),
    gameInput: document.getElementById("game-input"),
    gameMenu: document.getElementById("game-menu"),
    gameAdd: document.getElementById("game-add"),
    gameUndo: document.getElementById("game-undo"),
    gameNew: document.getElementById("game-new"),
    gameHint: document.getElementById("game-hint"),
    gameReveal: document.getElementById("game-reveal"),
    gameOptimal: document.getElementById("game-optimal"),
    stage: document.querySelector(".conn-stage"),
  };

  function fold(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  const byFold = new Map();
  const byId = new Map();
  for (const row of fighters) {
    const key = fold(row.name);
    byFold.set(key, row);
    byId.set(row.fighter_id, row);
  }

  // Undirected fight graph: id -> Map(neighborId -> {date, result})
  const graph = new Map();
  const stubs = new Map(); // fold -> stub for unranked opponents

  function ensureNode(id, name, row) {
    if (!graph.has(id)) graph.set(id, new Map());
    if (row) byId.set(id, row);
    else if (!byId.has(id)) {
      byId.set(id, {
        fighter_id: id,
        name: name,
        rating: null,
        division: "",
        wins: 0,
        losses: 0,
        stub: true,
      });
    }
  }

  function resolveOpponent(name) {
    const key = fold(name);
    if (!key) return null;
    const hit = byFold.get(key);
    if (hit) return hit;
    if (stubs.has(key)) return stubs.get(key);
    const stub = {
      fighter_id: "stub:" + key,
      name: name,
      rating: null,
      division: "",
      wins: 0,
      losses: 0,
      stub: true,
    };
    stubs.set(key, stub);
    byFold.set(key, stub);
    return stub;
  }

  for (const row of fighters) {
    ensureNode(row.fighter_id, row.name, row);
    const hist = row.history || [];
    for (let i = 0; i < hist.length; i += 1) {
      const bout = hist[i];
      if (!bout || !bout.opponent) continue;
      const opp = resolveOpponent(bout.opponent);
      if (!opp || opp.fighter_id === row.fighter_id) continue;
      ensureNode(opp.fighter_id, opp.name, opp.stub ? null : opp);
      graph.get(row.fighter_id).set(opp.fighter_id, {
        date: bout.date || "",
        result: bout.result || "",
      });
      if (!graph.get(opp.fighter_id).has(row.fighter_id)) {
        graph.get(opp.fighter_id).set(row.fighter_id, {
          date: bout.date || "",
          result: bout.result === "W" ? "L" : bout.result === "L" ? "W" : bout.result || "",
        });
      }
    }
  }

  function byName(name) {
    return byFold.get(fold(name)) || null;
  }

  function searchFighters(query, limit, preferIds) {
    const needle = fold(query).replace(/\s+/g, "");
    const prefer = preferIds || null;
    const scored = [];
    byFold.forEach(function (row, key) {
      if (row.stub) return;
      const compact = key.replace(/\s+/g, "");
      if (needle && compact.indexOf(needle) === -1) return;
      if (!needle && prefer && !prefer.has(row.fighter_id)) return;
      const starts = needle && compact.indexOf(needle) === 0 ? 0 : 1;
      const linked = prefer && prefer.has(row.fighter_id);
      scored.push({
        row: row,
        linked: !!linked,
        rank: (linked ? -100000 : 0) + (starts ? 1000 : 0) + (row.rank || 9999),
      });
    });
    scored.sort(function (a, b) {
      return a.rank - b.rank || a.row.name.localeCompare(b.row.name);
    });
    return scored.slice(0, limit || 8).map(function (x) {
      return x.row;
    });
  }

  function neighbors(id) {
    const map = graph.get(id);
    return map ? Array.from(map.keys()) : [];
  }

  function bfsPath(startId, endId) {
    if (!startId || !endId || startId === endId) return null;
    if (!graph.has(startId) || !graph.has(endId)) return null;
    const prev = new Map();
    const q = [startId];
    prev.set(startId, null);
    let qi = 0;
    while (qi < q.length) {
      const cur = q[qi++];
      if (cur === endId) break;
      const nbrs = neighbors(cur);
      for (let i = 0; i < nbrs.length; i += 1) {
        const n = nbrs[i];
        if (prev.has(n)) continue;
        prev.set(n, cur);
        q.push(n);
        if (n === endId) {
          qi = q.length;
          break;
        }
      }
    }
    if (!prev.has(endId)) return null;
    const path = [];
    let walk = endId;
    while (walk) {
      path.push(walk);
      walk = prev.get(walk);
    }
    path.reverse();
    return path;
  }

  function fightEdge(aId, bId) {
    const map = graph.get(aId);
    return map ? map.get(bId) || null : null;
  }

  function hops(path) {
    return path && path.length ? path.length - 1 : null;
  }

  // --- Autocomplete ---
  function bindCombo(input, menu, onPick, preferFn) {
    let open = false;
    function preferSet() {
      return typeof preferFn === "function" ? preferFn() : null;
    }
    function hide() {
      menu.hidden = true;
      menu.textContent = "";
      open = false;
    }
    function show(hits) {
      menu.textContent = "";
      if (!hits.length) {
        hide();
        return;
      }
      const prefer = preferSet();
      for (let i = 0; i < hits.length; i += 1) {
        const row = hits[i];
        const btn = document.createElement("button");
        btn.type = "button";
        const linked = prefer && prefer.has(row.fighter_id);
        btn.textContent =
          row.name +
          (row.division ? " · " + row.division : "") +
          (row.rank ? " · #" + row.rank : "") +
          (linked ? " · fought last" : "");
        btn.addEventListener("mousedown", function (evt) {
          evt.preventDefault();
          input.value = row.name;
          hide();
          onPick(row);
        });
        menu.appendChild(btn);
      }
      menu.hidden = false;
      open = true;
    }
    input.addEventListener("input", function () {
      show(searchFighters(input.value, 8, preferSet()));
    });
    input.addEventListener("focus", function () {
      show(searchFighters(input.value, 8, preferSet()));
    });
    input.addEventListener("keydown", function (evt) {
      if (evt.key === "Escape") hide();
      if (evt.key === "Enter") {
        const hits = searchFighters(input.value, 1, preferSet());
        if (hits[0]) {
          evt.preventDefault();
          input.value = hits[0].name;
          hide();
          onPick(hits[0]);
        }
      }
    });
    input.addEventListener("blur", function () {
      setTimeout(hide, 120);
    });
    return { hide: hide, isOpen: function () { return open; } };
  }

  // --- Network force graph ---
  let nodes = [];
  let edges = [];
  let nodeById = {};
  let simRunning = false;
  let raf = 0;
  let dpr = 1;
  let view = { w: 0, h: 0 };
  let hoverId = "";
  let drag = null;

  function resize() {
    if (!els.canvas || !els.stage) return;
    const rect = els.stage.getBoundingClientRect();
    view.w = Math.max(320, rect.width);
    view.h = Math.max(360, rect.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    els.canvas.width = Math.floor(view.w * dpr);
    els.canvas.height = Math.floor(view.h * dpr);
    els.canvas.style.width = view.w + "px";
    els.canvas.style.height = view.h + "px";
  }

  function radiusOf(row) {
    if (!row || row.rating == null) return 14;
    const t = Math.max(0, Math.min(1, (row.rating - 1450) / 350));
    return 14 + t * 18;
  }

  function buildNetwork(a, b, path) {
    const keep = new Set(path);
    // Add a ring of neighbors around path nodes for context (capped).
    for (let i = 0; i < path.length; i += 1) {
      const nbrs = neighbors(path[i]);
      for (let j = 0; j < nbrs.length && keep.size < MAX_GRAPH_NODES; j += 1) {
        if (i === 0 || i === path.length - 1 || j < 3) keep.add(nbrs[j]);
      }
    }
    nodes = [];
    nodeById = {};
    const ids = Array.from(keep);
    const cx = view.w / 2;
    const cy = view.h / 2;
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i];
      const row = byId.get(id);
      const onPath = path.indexOf(id) >= 0;
      const angle = (i / ids.length) * Math.PI * 2;
      const dist = onPath ? 40 + path.indexOf(id) * 28 : 120 + (i % 5) * 18;
      const node = {
        id: id,
        row: row,
        r: radiusOf(row),
        onPath: onPath,
        isEnd: id === a.fighter_id || id === b.fighter_id,
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        vx: 0,
        vy: 0,
      };
      nodes.push(node);
      nodeById[id] = node;
    }
    edges = [];
    const seen = new Set();
    for (let i = 0; i < ids.length; i += 1) {
      const us = ids[i];
      const nbrs = neighbors(us);
      for (let j = 0; j < nbrs.length; j += 1) {
        const them = nbrs[j];
        if (!nodeById[them]) continue;
        const key = us < them ? us + "|" + them : them + "|" + us;
        if (seen.has(key)) continue;
        seen.add(key);
        const pathEdge =
          path.indexOf(us) >= 0 &&
          path.indexOf(them) >= 0 &&
          Math.abs(path.indexOf(us) - path.indexOf(them)) === 1;
        edges.push({
          source: us,
          target: them,
          path: pathEdge,
          meta: fightEdge(us, them),
        });
      }
    }
  }

  function tick() {
    const n = nodes.length;
    if (!n) return;
    // Repulsion
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist2 = dx * dx + dy * dy || 1;
        const dist = Math.sqrt(dist2);
        const force = 900 / dist2;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }
    // Springs
    for (let i = 0; i < edges.length; i += 1) {
      const e = edges[i];
      const a = nodeById[e.source];
      const b = nodeById[e.target];
      if (!a || !b) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const ideal = e.path ? 90 : 130;
      const f = (dist - ideal) * (e.path ? 0.04 : 0.015);
      const fx = (dx / dist) * f;
      const fy = (dy / dist) * f;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
    // Center pull
    const cx = view.w / 2;
    const cy = view.h / 2;
    for (let i = 0; i < n; i += 1) {
      const node = nodes[i];
      if (drag && drag.id === node.id) continue;
      node.vx += (cx - node.x) * 0.008;
      node.vy += (cy - node.y) * 0.008;
      node.vx *= 0.82;
      node.vy *= 0.82;
      node.x += node.vx;
      node.y += node.vy;
      const pad = node.r + 8;
      node.x = Math.max(pad, Math.min(view.w - pad, node.x));
      node.y = Math.max(pad, Math.min(view.h - pad, node.y));
    }
  }

  function draw() {
    const ctx = els.canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);
    for (let i = 0; i < edges.length; i += 1) {
      const e = edges[i];
      const a = nodeById[e.source];
      const b = nodeById[e.target];
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = e.path ? "rgba(212, 175, 106, 0.85)" : "rgba(120, 130, 145, 0.28)";
      ctx.lineWidth = e.path ? 2.4 : 1;
      ctx.stroke();
    }
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      const row = node.row || {};
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
      if (node.isEnd) ctx.fillStyle = "rgba(212, 175, 106, 0.95)";
      else if (node.onPath) ctx.fillStyle = "rgba(91, 141, 239, 0.9)";
      else ctx.fillStyle = "rgba(45, 52, 64, 0.95)";
      ctx.fill();
      ctx.strokeStyle =
        hoverId === node.id ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.12)";
      ctx.lineWidth = hoverId === node.id ? 2 : 1;
      ctx.stroke();
      ctx.fillStyle = node.isEnd || node.onPath ? "#0b0d10" : "#e8edf4";
      ctx.font = "600 11px Manrope, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = (row.name || "").split(" ").slice(-1)[0] || "?";
      ctx.fillText(label, node.x, node.y);
    }
  }

  function loop() {
    if (!simRunning) return;
    tick();
    draw();
    raf = requestAnimationFrame(loop);
  }

  function startSim() {
    if (simRunning) return;
    simRunning = true;
    raf = requestAnimationFrame(loop);
  }

  function pointerPos(evt) {
    const rect = els.canvas.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  }

  function hitNode(p) {
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const n = nodes[i];
      const dx = p.x - n.x;
      const dy = p.y - n.y;
      if (dx * dx + dy * dy <= n.r * n.r) return n;
    }
    return null;
  }

  function showTooltip(node, x, y) {
    if (!node || !els.tooltip) {
      if (els.tooltip) els.tooltip.hidden = true;
      return;
    }
    const row = node.row || {};
    els.tooltip.hidden = false;
    els.tooltip.innerHTML =
      "<strong>" +
      (row.name || "") +
      "</strong><span>" +
      (row.stub
        ? "Unranked opponent"
        : (row.division || "—") +
          (row.rank ? " · #" + row.rank : "") +
          (row.rating != null ? " · " + row.rating.toFixed(0) : "") +
          (row.wins != null ? " · " + row.wins + "-" + row.losses : "")) +
      "</span>";
    els.tooltip.style.left = Math.min(view.w - 180, x + 12) + "px";
    els.tooltip.style.top = Math.min(view.h - 60, y + 12) + "px";
  }

  function wireCanvas() {
    if (!els.canvas) return;
    els.canvas.addEventListener("pointerdown", function (evt) {
      const p = pointerPos(evt);
      const node = hitNode(p);
      if (!node) return;
      drag = { id: node.id, ox: p.x - node.x, oy: p.y - node.y };
      els.canvas.setPointerCapture(evt.pointerId);
    });
    els.canvas.addEventListener("pointermove", function (evt) {
      const p = pointerPos(evt);
      if (drag) {
        const node = nodeById[drag.id];
        if (node) {
          node.x = p.x - drag.ox;
          node.y = p.y - drag.oy;
          node.vx = 0;
          node.vy = 0;
        }
      }
      const hit = hitNode(p);
      hoverId = hit ? hit.id : "";
      showTooltip(hit, p.x, p.y);
    });
    els.canvas.addEventListener("pointerup", function () {
      drag = null;
    });
    els.canvas.addEventListener("pointerleave", function () {
      hoverId = "";
      if (els.tooltip) els.tooltip.hidden = true;
    });
  }

  function renderPath(a, b, path) {
    if (!els.pathBox) return;
    if (!path) {
      els.pathBox.hidden = true;
      return;
    }
    els.pathBox.hidden = false;
    els.pathList.textContent = "";
    for (let i = 0; i < path.length; i += 1) {
      const row = byId.get(path[i]);
      const li = document.createElement("li");
      li.innerHTML =
        "<strong>" +
        (row ? row.name : path[i]) +
        "</strong>" +
        (row && row.division ? "<em>" + row.division + "</em>" : "");
      if (i < path.length - 1) {
        const edge = fightEdge(path[i], path[i + 1]);
        const span = document.createElement("span");
        span.className = "conn-hop";
        span.textContent = edge && edge.date ? "fought · " + edge.date : "fought";
        li.appendChild(span);
      }
      els.pathList.appendChild(li);
    }
    const n = hops(path);
    els.pathNote.textContent =
      n === 0
        ? "Same fighter."
        : n === 1
          ? "Direct fight — one hop."
          : n + " hops · " + (path.length - 2) + " fighter" + (path.length - 2 === 1 ? "" : "s") + " in between.";
  }

  function renderNetwork() {
    const a = byName(els.netA.value);
    const b = byName(els.netB.value);
    if (!a || !b) {
      els.netStatus.textContent = "Pick two fighters to map their fight network.";
      nodes = [];
      edges = [];
      draw();
      renderPath(null, null, null);
      return;
    }
    if (a.fighter_id === b.fighter_id) {
      els.netStatus.textContent = "Choose two different fighters.";
      nodes = [];
      edges = [];
      draw();
      renderPath(null, null, null);
      return;
    }
    const path = bfsPath(a.fighter_id, b.fighter_id);
    if (!path) {
      els.netStatus.textContent =
        "No fight path found between " + a.name + " and " + b.name + " in the rated data.";
      nodes = [];
      edges = [];
      draw();
      renderPath(null, null, null);
      return;
    }
    const n = hops(path);
    els.netStatus.textContent =
      a.name + " → " + b.name + " · " + n + " hop" + (n === 1 ? "" : "s");
    buildNetwork(a, b, path);
    renderPath(a, b, path);
    startSim();
  }

  // --- Game ---
  let puzzle = null; // { start, end, optimal }
  let chain = []; // fighter ids from start toward end (includes start, not end until solved)

  function topPool() {
    return fighters
      .filter(function (f) {
        return !f.stub && (f.rank || 999) <= TOP_POOL;
      })
      .slice()
      .sort(function (a, b) {
        return (a.rank || 999) - (b.rank || 999);
      });
  }

  function newPuzzle() {
    const pool = topPool();
    let best = null;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const i = Math.floor(Math.random() * pool.length);
      let j = Math.floor(Math.random() * pool.length);
      if (j === i) j = (j + 1) % pool.length;
      const a = pool[i];
      const b = pool[j];
      if (fightEdge(a.fighter_id, b.fighter_id)) continue; // skip direct
      const path = bfsPath(a.fighter_id, b.fighter_id);
      const h = hops(path);
      if (h == null || h < 2 || h > MAX_PATH_HOPS) continue;
      best = { start: a, end: b, optimal: path };
      if (h >= 2 && h <= 4) break;
    }
    if (!best && pool.length >= 2) {
      // Fallback: any connected pair with hops >= 2
      for (let i = 0; i < pool.length; i += 1) {
        for (let j = i + 1; j < pool.length; j += 1) {
          const path = bfsPath(pool[i].fighter_id, pool[j].fighter_id);
          const h = hops(path);
          if (h != null && h >= 2) {
            best = { start: pool[i], end: pool[j], optimal: path };
            break;
          }
        }
        if (best) break;
      }
    }
    puzzle = best;
    chain = best ? [best.start.fighter_id] : [];
    els.gameInput.value = "";
    renderGame();
  }

  function chainComplete() {
    if (!puzzle || !chain.length) return false;
    return chain[chain.length - 1] === puzzle.end.fighter_id;
  }

  function renderGame() {
    if (!puzzle) {
      els.gameStartName.textContent = "—";
      els.gameEndName.textContent = "—";
      els.gameStartMeta.textContent = "";
      els.gameEndMeta.textContent = "";
      els.gameStatus.textContent = "Could not find a puzzle in the top pool.";
      els.gameChain.textContent = "";
      els.gameOptimal.textContent = "";
      return;
    }
    els.gameStartName.textContent = puzzle.start.name;
    els.gameEndName.textContent = puzzle.end.name;
    els.gameStartMeta.textContent =
      (puzzle.start.division || "") +
      (puzzle.start.rank ? " · #" + puzzle.start.rank : "");
    els.gameEndMeta.textContent =
      (puzzle.end.division || "") + (puzzle.end.rank ? " · #" + puzzle.end.rank : "");

    els.gameChain.textContent = "";
    for (let i = 0; i < chain.length; i += 1) {
      const row = byId.get(chain[i]);
      const li = document.createElement("li");
      li.className = "conn-chain-node" + (i === 0 ? " is-start" : "");
      li.innerHTML =
        "<strong>" +
        (row ? row.name : chain[i]) +
        "</strong>" +
        (row && row.division ? "<em>" + row.division + "</em>" : "");
      if (i < chain.length - 1) {
        const edge = fightEdge(chain[i], chain[i + 1]);
        const hop = document.createElement("span");
        hop.className = "conn-hop";
        hop.textContent = edge && edge.date ? edge.date : "fought";
        li.appendChild(hop);
      }
      els.gameChain.appendChild(li);
    }
    if (!chainComplete()) {
      const ghost = document.createElement("li");
      ghost.className = "conn-chain-node is-goal";
      ghost.innerHTML =
        "<strong>" + puzzle.end.name + "</strong><em>goal</em>";
      els.gameChain.appendChild(ghost);
    }

    const optH = hops(puzzle.optimal);
    if (chainComplete()) {
      const userH = chain.length - 1;
      els.gameStatus.textContent =
        "Connected in " +
        userH +
        " hop" +
        (userH === 1 ? "" : "s") +
        (optH != null ? " (shortest known: " + optH + ")" : "") +
        ".";
      els.gameStatus.className = "ufc-status is-win";
    } else {
      const last = byId.get(chain[chain.length - 1]);
      els.gameStatus.textContent =
        "Add someone who fought " +
        (last ? last.name : "the last fighter") +
        ". Shortest known path: " +
        optH +
        " hops.";
      els.gameStatus.className = "ufc-status";
    }
    els.gameOptimal.textContent = "";
  }

  function tryAddFighter(row) {
    if (!puzzle || !row || chainComplete()) return;
    const last = chain[chain.length - 1];
    if (row.fighter_id === last) {
      els.gameStatus.textContent = "Pick a different fighter.";
      return;
    }
    if (chain.indexOf(row.fighter_id) >= 0) {
      els.gameStatus.textContent = "Already in your chain.";
      return;
    }
    if (!fightEdge(last, row.fighter_id)) {
      const lastRow = byId.get(last);
      els.gameStatus.textContent =
        row.name +
        " never fought " +
        (lastRow ? lastRow.name : "the previous fighter") +
        " in this data.";
      els.gameStatus.className = "ufc-status is-bad";
      return;
    }
    chain.push(row.fighter_id);
    els.gameInput.value = "";
    renderGame();
  }

  function showHint() {
    if (!puzzle || chainComplete()) return;
    const opt = puzzle.optimal;
    const last = chain[chain.length - 1];
    const idx = opt.indexOf(last);
    if (idx >= 0 && idx < opt.length - 1) {
      const next = byId.get(opt[idx + 1]);
      els.gameStatus.textContent = next
        ? "Hint: try someone linked like " + next.name.split(" ").slice(-1)[0] + "…"
        : "Hint unavailable.";
      return;
    }
    // Off optimal path — suggest any neighbor that gets closer
    const goal = puzzle.end.fighter_id;
    const nbrs = neighbors(last);
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < nbrs.length; i += 1) {
      if (chain.indexOf(nbrs[i]) >= 0) continue;
      const p = bfsPath(nbrs[i], goal);
      const h = hops(p);
      if (h != null && h < bestDist) {
        bestDist = h;
        best = byId.get(nbrs[i]);
      }
    }
    els.gameStatus.textContent = best
      ? "Hint: " + best.name + " moves you closer."
      : "Hint: no improving neighbor from here — undo and try another branch.";
  }

  function revealPath() {
    if (!puzzle || !puzzle.optimal) return;
    chain = puzzle.optimal.slice();
    renderGame();
  }

  // --- Tabs ---
  function showTab(which) {
    const net = which === "network";
    els.tabNetwork.classList.toggle("active", net);
    els.tabGame.classList.toggle("active", !net);
    els.tabNetwork.setAttribute("aria-selected", net ? "true" : "false");
    els.tabGame.setAttribute("aria-selected", net ? "false" : "true");
    els.panelNetwork.hidden = !net;
    els.panelGame.hidden = net;
    if (net) {
      resize();
      renderNetwork();
      startSim();
    }
  }

  // Boot
  els.summary.textContent = data.asOf
    ? fighters.length + " fighters · through " + data.asOf
    : fighters.length + " fighters";

  bindCombo(els.netA, els.netAMenu, function () {
    renderNetwork();
  });
  bindCombo(els.netB, els.netBMenu, function () {
    renderNetwork();
  });
  els.netA.addEventListener("change", renderNetwork);
  els.netB.addEventListener("change", renderNetwork);
  els.netSwap.addEventListener("click", function () {
    const t = els.netA.value;
    els.netA.value = els.netB.value;
    els.netB.value = t;
    renderNetwork();
  });

  function gamePreferIds() {
    if (!chain.length) return null;
    const last = chain[chain.length - 1];
    const set = new Set(neighbors(last));
    // Drop fighters already used in the chain.
    for (let i = 0; i < chain.length; i += 1) set.delete(chain[i]);
    return set;
  }

  bindCombo(
    els.gameInput,
    els.gameMenu,
    function (row) {
      tryAddFighter(row);
    },
    gamePreferIds
  );
  els.gameAdd.addEventListener("click", function () {
    const row =
      byName(els.gameInput.value) || searchFighters(els.gameInput.value, 1, gamePreferIds())[0];
    if (row) tryAddFighter(row);
  });
  els.gameUndo.addEventListener("click", function () {
    if (chain.length > 1) {
      chain.pop();
      renderGame();
    }
  });
  els.gameNew.addEventListener("click", newPuzzle);
  els.gameHint.addEventListener("click", showHint);
  els.gameReveal.addEventListener("click", revealPath);

  els.tabNetwork.addEventListener("click", function () {
    showTab("network");
  });
  els.tabGame.addEventListener("click", function () {
    showTab("game");
  });

  wireCanvas();
  window.addEventListener("resize", function () {
    resize();
    draw();
  });

  // Defaults
  const islam = byName("Islam Makhachev");
  const jones = byName("Jon Jones");
  els.netA.value = islam ? islam.name : fighters[0] ? fighters[0].name : "";
  els.netB.value = jones ? jones.name : fighters[1] ? fighters[1].name : "";
  resize();
  renderNetwork();
  startSim();
  newPuzzle();
  showTab("network");
})();
