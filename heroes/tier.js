const STORE = "hots-tier-list";
const ROLES = [
  { label: "All", role: "" },
  { label: "Tank", role: "Tank" },
  { label: "Bruiser", role: "Bruiser" },
  { label: "Healer", role: "Healer" },
  { label: "Ranged", role: "Ranged Assassin" },
  { label: "Melee", role: "Melee Assassin" },
  { label: "Support", role: "Support" },
];
const DEFAULT_COLORS = ["#ef5b6e", "#e08a4a", "#d4c05a", "#5aaa6a", "#5aa8ff", "#8b6bb8", "#c5d0d8"];
const DEFAULT_TIERS = [
  { id: "s", name: "S", color: "#ef5b6e" },
  { id: "a", name: "A", color: "#e08a4a" },
  { id: "b", name: "B", color: "#d4c05a" },
  { id: "c", name: "C", color: "#5aaa6a" },
  { id: "d", name: "D", color: "#5aa8ff" },
  { id: "f", name: "F", color: "#8b6bb8" },
];

const els = {
  boot: document.getElementById("boot"),
  bootStatus: document.getElementById("boot-status"),
  app: document.getElementById("app"),
  title: document.getElementById("tier-title"),
  rows: document.getElementById("tier-rows"),
  search: document.getElementById("tier-search"),
  roles: document.getElementById("tier-roles"),
  grid: document.getElementById("tier-grid"),
  share: document.getElementById("tier-share"),
  add: document.getElementById("tier-add"),
  reset: document.getElementById("tier-reset"),
  modal: document.getElementById("tier-modal"),
  modalBackdrop: document.getElementById("tier-modal-backdrop"),
  modalHeading: document.getElementById("tier-modal-heading"),
  modalName: document.getElementById("tier-modal-name"),
  modalColor: document.getElementById("tier-modal-color"),
  modalAbove: document.getElementById("tier-modal-above"),
  modalBelow: document.getElementById("tier-modal-below"),
  modalDelete: document.getElementById("tier-modal-delete"),
  modalDone: document.getElementById("tier-modal-done"),
};

let heroes = [];
let heroMap = new Map();
let search = "";
let role = "";
let drag = null;
let nextId = 1;
let editIndex = -1;
let state = blankState();
let shareLabel = "Copy image";
const portraits = new Map();

function blankState() {
  return {
    title: "My tier list",
    tiers: DEFAULT_TIERS.map(function (tier) {
      return { id: tier.id, name: tier.name, color: tier.color, champs: [] };
    }),
  };
}

function fold(value) {
  return String(value || "").toLowerCase().replace(/['.\s]/g, "");
}

function placedSet() {
  const seen = {};
  for (let i = 0; i < state.tiers.length; i += 1) {
    const champs = state.tiers[i].champs || [];
    for (let j = 0; j < champs.length; j += 1) seen[champs[j]] = true;
  }
  return seen;
}

function findChamp(name) {
  for (let i = 0; i < state.tiers.length; i += 1) {
    const idx = state.tiers[i].champs.indexOf(name);
    if (idx !== -1) return { tier: i, index: idx };
  }
  return null;
}

function removeChamp(name) {
  const hit = findChamp(name);
  if (!hit) return;
  state.tiers[hit.tier].champs.splice(hit.index, 1);
}

function insertChamp(name, tierIndex, at) {
  if (!name || !heroMap.has(name)) return;
  const hit = findChamp(name);
  let index = at == null ? (state.tiers[tierIndex] && state.tiers[tierIndex].champs.length) || 0 : at;
  if (hit && hit.tier === tierIndex && hit.index < index) index -= 1;
  removeChamp(name);
  const row = state.tiers[tierIndex];
  if (!row) return;
  const list = row.champs;
  if (index < 0) index = 0;
  if (index > list.length) index = list.length;
  list.splice(index, 0, name);
}

function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify(state));
  } catch (error) {}
}

function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data || !data.tiers || !data.tiers.length) return;
    state.title = data.title || state.title;
    state.tiers = data.tiers.map(function (tier, i) {
      nextId = Math.max(nextId, i + 2);
      return {
        id: String(tier.id || "t" + (i + 1)),
        name: String(tier.name || "T").slice(0, 12),
        color: String(tier.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]),
        champs: (tier.champs || []).filter(function (name) {
          return heroMap.has(name);
        }),
      };
    });
  } catch (error) {}
}

function visiblePool() {
  const taken = placedSet();
  const q = fold(search);
  return heroes.filter(function (hero) {
    if (taken[hero.name]) return false;
    if (role && hero.role !== role) return false;
    if (!q) return true;
    return fold(hero.name + hero.role).indexOf(q) !== -1;
  });
}

function beginDrag(event, payload) {
  drag = payload;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", payload.name || "hero");
}

function endDrag() {
  drag = null;
  document.querySelectorAll(".drop-hover").forEach(function (node) {
    node.classList.remove("drop-hover");
  });
}

function bindDrop(node, onDrop, capture) {
  node.addEventListener(
    "dragover",
    function (event) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      node.classList.add("drop-hover");
    },
    capture
  );
  node.addEventListener("dragleave", function (event) {
    if (!node.contains(event.relatedTarget)) node.classList.remove("drop-hover");
  });
  node.addEventListener(
    "drop",
    function (event) {
      event.preventDefault();
      event.stopPropagation();
      node.classList.remove("drop-hover");
      if (!drag) return;
      onDrop(drag);
      drag = null;
      save();
      render();
    },
    capture
  );
}

function localPortrait(name) {
  const folded = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let key = folded.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (key === "lcio") key = "lucio";
  return "portraits/" + key + ".png";
}

function cachePortrait(url) {
  if (!url || portraits.has(url)) return portraits.get(url) || Promise.resolve(null);
  const pending = new Promise(function (resolve) {
    const img = new Image();
    img.onload = function () { resolve(img); };
    img.onerror = function () { resolve(null); };
    img.src = url;
  });
  portraits.set(url, pending);
  return pending;
}

function champNode(name, fromTier, fromIndex) {
  const hero = heroMap.get(name);
  const wrap = document.createElement("div");
  wrap.className = "champ";
  wrap.draggable = true;
  wrap.title = name + " — drag to move, double-click to unrank";
  wrap.setAttribute("role", "img");
  if (hero) {
    const img = document.createElement("img");
    img.src = localPortrait(name);
    img.alt = name;
    img.draggable = false;
    img.addEventListener("error", function () {
      const fallback = document.createElement("span");
      fallback.className = "fallback";
      fallback.textContent = name.slice(0, 1);
      img.replaceWith(fallback);
    });
    wrap.append(img);
    cachePortrait(localPortrait(name));
  } else {
    const fallback = document.createElement("span");
    fallback.className = "fallback";
    fallback.textContent = name.slice(0, 1);
    wrap.append(fallback);
  }
  const label = document.createElement("span");
  label.className = "label";
  label.textContent = name;
  wrap.append(label);
  wrap.addEventListener("dragstart", function (event) {
    beginDrag(event, { name: name, tier: fromTier, index: fromIndex });
  });
  wrap.addEventListener("dragend", endDrag);
  wrap.addEventListener("dblclick", function () {
    removeChamp(name);
    save();
    render();
  });
  return wrap;
}

function renderRows() {
  els.rows.innerHTML = "";
  for (let i = 0; i < state.tiers.length; i += 1) {
    const tier = state.tiers[i];
    const row = document.createElement("div");
    row.className = "tier-row";
    const label = document.createElement("button");
    label.type = "button";
    label.className = "tier-label";
    label.style.background = tier.color;
    label.title = "Edit " + tier.name + " tier";
    const name = document.createElement("span");
    name.className = "tier-name";
    name.textContent = tier.name || " ";
    name.style.color = contrastText(tier.color);
    label.append(name);
    label.addEventListener("click", function () {
      openEditor(i);
    });

    const tray = document.createElement("div");
    tray.className = "tier-tray";
    for (let j = 0; j < tier.champs.length; j += 1) {
      const node = champNode(tier.champs[j], i, j);
      bindDrop(node, function (payload) {
        insertChamp(payload.name, i, j);
      });
      tray.append(node);
    }
    bindDrop(tray, function (payload) {
      insertChamp(payload.name, i, tier.champs.length);
    });

    row.append(label, tray);
    els.rows.append(row);
  }
}

function makeTier() {
  const n = state.tiers.length;
  const tier = {
    id: "t" + nextId,
    name: "T" + (n + 1),
    color: DEFAULT_COLORS[n % DEFAULT_COLORS.length],
    champs: [],
  };
  nextId += 1;
  return tier;
}

function openEditor(index) {
  const tier = state.tiers[index];
  if (!tier || !els.modal) return;
  editIndex = index;
  els.modalHeading.textContent = tier.name || "Tier";
  els.modalName.value = tier.name;
  els.modalColor.value = toHex(tier.color);
  els.modalDelete.disabled = state.tiers.length <= 1;
  els.modal.hidden = false;
  document.body.classList.add("tier-modal-open");
  els.modalName.focus();
  els.modalName.select();
}

function closeEditor() {
  editIndex = -1;
  if (els.modal) els.modal.hidden = true;
  document.body.classList.remove("tier-modal-open");
}

function currentEditTier() {
  return editIndex >= 0 ? state.tiers[editIndex] : null;
}

function labelNameAt(index) {
  const row = els.rows && els.rows.children[index];
  return row ? row.querySelector(".tier-name") : null;
}

function toHex(color) {
  const value = String(color || "#888888");
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  return "#888888";
}

function contrastText(color) {
  const hex = toHex(color).slice(1);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#101114" : "#f4f6f8";
}

function renderRoles() {
  els.roles.innerHTML = "";
  for (let i = 0; i < ROLES.length; i += 1) {
    const item = ROLES[i];
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item.label;
    if (item.role === role) button.className = "active";
    button.addEventListener("click", function () {
      role = item.role;
      render();
    });
    els.roles.append(button);
  }
}

function renderGrid() {
  const visible = visiblePool();
  els.grid.innerHTML = "";
  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "pick-empty";
    empty.textContent = "No heroes match that filter.";
    els.grid.append(empty);
    return;
  }
  for (let i = 0; i < visible.length; i += 1) {
    els.grid.append(champNode(visible[i].name, -1, -1));
  }
}

function render() {
  if (els.title && document.activeElement !== els.title) els.title.value = state.title;
  renderRows();
  renderRoles();
  renderGrid();
}

function addTier(at) {
  const index = at == null ? state.tiers.length : at;
  state.tiers.splice(index, 0, makeTier());
  save();
  render();
}

function resetList() {
  if (!confirm("Reset tiers and unrank every hero?")) return;
  closeEditor();
  state = blankState();
  nextId = 7;
  save();
  render();
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawLetter(ctx, letter, x, y, size) {
  ctx.fillStyle = "#141a22";
  roundRect(ctx, x, y, size, size, 6);
  ctx.fill();
  ctx.fillStyle = "#d5dde6";
  ctx.font = "700 " + Math.round(size * 0.42) + "px Sora, Manrope, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(letter, x + size / 2, y + size / 2 + 1);
}

async function tierImageBlob() {
  await document.fonts.ready;
  const width = 1080;
  const pad = 36;
  const labelW = 96;
  const icon = 68;
  const gap = 10;
  const rowPad = 12;
  const perLine = Math.max(1, Math.floor((width - pad * 2 - labelW - rowPad * 2 + gap) / (icon + gap)));
  const needed = [];
  state.tiers.forEach(function (tier) {
    tier.champs.forEach(function (name) {
      needed.push(cachePortrait(localPortrait(name)));
    });
  });
  await Promise.all(needed);
  const heights = state.tiers.map(function (tier) {
    const lines = Math.max(1, Math.ceil(tier.champs.length / perLine));
    return rowPad * 2 + lines * icon + Math.max(0, lines - 1) * gap;
  });
  const header = 96;
  const footer = 42;
  const height = header + heights.reduce(function (sum, value) { return sum + value; }, 0) + Math.max(0, state.tiers.length - 1) * 8 + footer;
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#08090b";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#eef3f6";
  ctx.font = "700 32px Sora, Manrope, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(state.title || "My tier list", width / 2, 40);
  ctx.fillStyle = "#8b959e";
  ctx.font = "600 14px Manrope, sans-serif";
  ctx.fillText("Heroes of the Storm", width / 2, 70);

  let y = header;
  for (let i = 0; i < state.tiers.length; i += 1) {
    const tier = state.tiers[i];
    const rowH = heights[i];
    ctx.fillStyle = "#121418";
    roundRect(ctx, pad, y, width - pad * 2, rowH, 10);
    ctx.fill();
    ctx.fillStyle = toHex(tier.color);
    roundRect(ctx, pad, y, labelW, rowH, 10);
    ctx.fill();
    ctx.fillStyle = "#121418";
    ctx.fillRect(pad + labelW - 12, y, 12, rowH);
    ctx.fillStyle = contrastText(tier.color);
    ctx.font = "700 26px Sora, Manrope, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(tier.name || " ", pad + (labelW - 6) / 2, y + rowH / 2);
    for (let j = 0; j < tier.champs.length; j += 1) {
      const col = j % perLine;
      const line = Math.floor(j / perLine);
      const x = pad + labelW + rowPad + col * (icon + gap);
      const iy = y + rowPad + line * (icon + gap);
      const img = await portraits.get(localPortrait(tier.champs[j]));
      if (img) {
        ctx.save();
        roundRect(ctx, x, iy, icon, icon, 6);
        ctx.clip();
        ctx.drawImage(img, x, iy, icon, icon);
        ctx.restore();
      } else {
        drawLetter(ctx, (tier.champs[j] || "?").slice(0, 1), x, iy, icon);
      }
    }
    y += rowH + 8;
  }
  ctx.fillStyle = "#8b959e";
  ctx.font = "600 13px Manrope, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText("Whisper Draft", width - pad, height - 22);
  return new Promise(function (resolve, reject) {
    canvas.toBlob(function (blob) {
      if (blob) resolve(blob);
      else reject(new Error("Could not build the image"));
    }, "image/png");
  });
}

function downloadBlob(blob) {
  const link = document.createElement("a");
  const slug = fold(state.title) || "tier-list";
  link.href = URL.createObjectURL(blob);
  link.download = slug + ".png";
  link.click();
  setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
}

async function shareImage() {
  if (!els.share) return;
  els.share.disabled = true;
  els.share.textContent = "Making image…";
  try {
    const blob = await tierImageBlob();
    let mode = "downloaded";
    if (navigator.clipboard && window.ClipboardItem) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        mode = "copied";
      } catch (error) {}
    }
    if (mode !== "copied") downloadBlob(blob);
    els.share.textContent = mode === "copied" ? "Copied" : "Downloaded";
  } catch (error) {
    els.share.textContent = "Couldn't make image";
  }
  setTimeout(function () {
    els.share.disabled = false;
    els.share.textContent = shareLabel;
  }, 1600);
}

function showApp() {
  els.boot.classList.add("is-hidden");
  els.boot.hidden = true;
  els.app.hidden = false;
  els.boot.remove();
}

function boot() {
  try {
    const data = window.HOTS_DATA;
    if (!data || !data.roster) throw new Error("Missing hero data");
    heroes = data.roster.slice().sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });
    heroMap = new Map(heroes.map(function (hero) { return [hero.name, hero]; }));
    load();
    if (els.title) {
      els.title.value = state.title;
      els.title.addEventListener("input", function () {
        state.title = els.title.value.slice(0, 40);
        save();
      });
    }
    els.search.addEventListener("input", function () {
      search = els.search.value;
      renderGrid();
    });
    els.add.addEventListener("click", function () { addTier(); });
    els.reset.addEventListener("click", resetList);
    els.share.addEventListener("click", shareImage);
    els.modalName.addEventListener("input", function () {
      const tier = currentEditTier();
      if (!tier) return;
      tier.name = els.modalName.value.slice(0, 12);
      els.modalHeading.textContent = tier.name || "Tier";
      const name = labelNameAt(editIndex);
      if (name) name.textContent = tier.name || " ";
      save();
    });
    els.modalColor.addEventListener("input", function () {
      const tier = currentEditTier();
      if (!tier) return;
      tier.color = els.modalColor.value;
      const row = els.rows.children[editIndex];
      const label = row && row.querySelector(".tier-label");
      const name = label && label.querySelector(".tier-name");
      if (label) label.style.background = tier.color;
      if (name) name.style.color = contrastText(tier.color);
      save();
    });
    els.modalAbove.addEventListener("click", function () {
      if (editIndex < 0) return;
      addTier(editIndex);
      closeEditor();
    });
    els.modalBelow.addEventListener("click", function () {
      if (editIndex < 0) return;
      addTier(editIndex + 1);
      closeEditor();
    });
    els.modalDelete.addEventListener("click", function () {
      if (editIndex < 0 || state.tiers.length <= 1) return;
      state.tiers.splice(editIndex, 1);
      save();
      closeEditor();
      render();
    });
    els.modalDone.addEventListener("click", closeEditor);
    els.modalBackdrop.addEventListener("click", closeEditor);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && els.modal && !els.modal.hidden) closeEditor();
    });
    bindDrop(els.grid, function (payload) { removeChamp(payload.name); }, true);
    render();
    showApp();
    els.search.focus();
  } catch (error) {
    if (els.bootStatus) els.bootStatus.textContent = error.message;
  }
}

boot();
