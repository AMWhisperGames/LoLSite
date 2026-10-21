"use strict";

const data = window.UFC_MODEL || { rankings: [], divisions: [] };
const rankings = Array.isArray(data.rankings) ? data.rankings : [];
const POINTS = data.pointsPerUnit || 173.717;
const FORM_WEIGHT = data.formScoreWeight == null ? 0.5 : data.formScoreWeight;

const els = {
  summary: document.getElementById("ufc-summary"),
  search: document.getElementById("ufc-search"),
  divisions: document.getElementById("ufc-divisions"),
  blurb: document.getElementById("ufc-blurb"),
  status: document.getElementById("ufc-status"),
  body: document.getElementById("ufc-body"),
  viewScore: document.getElementById("view-score"),
  viewRoundRobin: document.getElementById("view-roundrobin"),
  detail: document.getElementById("ufc-detail"),
  detailKicker: document.getElementById("detail-kicker"),
  detailName: document.getElementById("detail-name"),
  detailMeta: document.getElementById("detail-meta"),
  detailStats: document.getElementById("detail-stats"),
  detailHistory: document.getElementById("detail-history"),
  detailNote: document.getElementById("detail-note"),
};

const state = { division: "", view: "score", search: "", selectedId: "" };

function fold(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function fmt(value, digits) {
  return value == null ? "—" : Number(value).toFixed(digits == null ? 1 : digits);
}

function signed(value) {
  if (value == null) return "—";
  const n = Number(value);
  return (n > 0 ? "+" : "") + n.toFixed(1);
}

function record(row) {
  return row.draws ? `${row.wins}-${row.losses}-${row.draws}` : `${row.wins}-${row.losses}`;
}

function classPoints(row) {
  return 1500 + POINTS * (row.strength || 0);
}

function formPoints(row) {
  return POINTS * FORM_WEIGHT * (row.form_component || 0);
}

function heightText(inches) {
  if (inches == null) return "—";
  const total = Math.round(inches);
  return `${Math.floor(total / 12)}'${total % 12}"`;
}

function divisionCounts() {
  const counts = new Map();
  for (const row of rankings) counts.set(row.division, (counts.get(row.division) || 0) + 1);
  return counts;
}

function renderDivisionChips() {
  const counts = divisionCounts();
  const names = ["", ...(data.divisions || [])];
  els.divisions.textContent = "";
  for (const name of names) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = name ? `${name} (${counts.get(name) || 0})` : `All (${rankings.length})`;
    button.classList.toggle("active", state.division === name);
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", state.division === name ? "true" : "false");
    button.addEventListener("click", () => {
      state.division = name;
      render();
    });
    els.divisions.appendChild(button);
  }
}

function filteredRows() {
  const needle = fold(state.search).trim();
  return rankings.filter((row) => {
    if (state.division && row.division !== state.division) return false;
    if (needle && !fold(row.name).includes(needle)) return false;
    return true;
  });
}

function displayRank(row, index) {
  if (state.view === "roundrobin") {
    return state.division && !state.search ? row.rr_division_rank : index + 1;
  }
  if (state.search) return index + 1;
  return state.division ? row.division_rank : row.rank;
}

function formLetters(row) {
  const wrap = document.createElement("span");
  wrap.className = "ufc-form";
  for (const mark of String(row.recent || "").split(" ").filter(Boolean)) {
    const chip = document.createElement("span");
    chip.className = "ufc-form-chip is-" + mark.toLowerCase();
    chip.textContent = mark;
    wrap.appendChild(chip);
  }
  return wrap;
}

function tagChips(row) {
  const wrap = document.createElement("span");
  wrap.className = "ufc-tags";
  if (row.style) {
    const style = document.createElement("span");
    style.className = "ufc-style";
    style.textContent = row.style;
    style.title = "Primary style, from their recent statistical profile relative to the division";
    wrap.appendChild(style);
  }
  for (const tag of row.tags || []) {
    const chip = document.createElement("span");
    chip.className = "ufc-tag";
    chip.textContent = tag;
    chip.title = "Top or bottom quarter of the division on a recent statistical dimension";
    wrap.appendChild(chip);
  }
  return wrap;
}

function render() {
  renderDivisionChips();
  els.viewScore.classList.toggle("active", state.view === "score");
  els.viewRoundRobin.classList.toggle("active", state.view === "roundrobin");

  const rows = filteredRows();
  let display = rows;
  if (state.view === "roundrobin") {
    display = [...rows].sort(
      (a, b) => (b.rr_win_pct || 0) - (a.rr_win_pct || 0) || b.rating - a.rating || a.name.localeCompare(b.name)
    );
  }

  els.blurb.textContent =
    state.view === "roundrobin"
      ? "Round robin: every fighter is matched against everyone in their division through the model. Win% is their average predicted chance — styles included, so it can reorder the score board where matchups do."
      : "Score is demonstrated class (latent strength, fitted on every fight at once) plus half of current statistical form. Click a fighter for the breakdown and full fight history.";
  els.status.textContent = rows.length
    ? `${rows.length} fighter${rows.length === 1 ? "" : "s"}${state.division ? " · " + state.division : ""}`
    : "No fighters match.";

  els.body.textContent = "";
  display.forEach((row, index) => {
    const tr = document.createElement("tr");
    tr.tabIndex = 0;
    tr.classList.toggle("is-selected", state.selectedId === row.fighter_id);
    tr.setAttribute("aria-label", row.name);

    const rankTd = document.createElement("td");
    rankTd.textContent = displayRank(row, index);
    tr.appendChild(rankTd);

    const nameTd = document.createElement("td");
    const name = document.createElement("span");
    name.className = "ufc-name";
    name.textContent = row.name;
    nameTd.appendChild(name);
    if (!state.division) {
      const div = document.createElement("span");
      div.className = "ufc-sub";
      div.textContent = `${row.division} #${row.division_rank}`;
      nameTd.appendChild(div);
    }
    nameTd.appendChild(tagChips(row));
    tr.appendChild(nameTd);

    const scoreTd = document.createElement("td");
    scoreTd.textContent = fmt(row.rating);
    scoreTd.className = "ufc-elo";
    tr.appendChild(scoreTd);

    const recTd = document.createElement("td");
    recTd.textContent = record(row);
    tr.appendChild(recTd);

    const classTd = document.createElement("td");
    classTd.textContent = fmt(classPoints(row));
    tr.appendChild(classTd);

    const formTd = document.createElement("td");
    formTd.textContent = signed(formPoints(row));
    formTd.className = formPoints(row) > 0 ? "is-up" : formPoints(row) < 0 ? "is-down" : "";
    tr.appendChild(formTd);

    const rrTd = document.createElement("td");
    rrTd.textContent = row.rr_win_pct == null ? "—" : Math.round(row.rr_win_pct * 100) + "%";
    rrTd.className = state.view === "roundrobin" ? "ufc-elo" : "";
    tr.appendChild(rrTd);

    const last5Td = document.createElement("td");
    last5Td.appendChild(formLetters(row));
    tr.appendChild(last5Td);

    const lastTd = document.createElement("td");
    lastTd.textContent = row.last_date || "—";
    tr.appendChild(lastTd);

    const open = () => showDetail(row);
    tr.addEventListener("click", open);
    tr.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
    els.body.appendChild(tr);
  });
}

function stat(label, value) {
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  els.detailStats.append(dt, dd);
}

function showDetail(row) {
  state.selectedId = row.fighter_id;
  els.detail.hidden = false;
  els.detailKicker.textContent = `${row.division} · #${row.division_rank} · overall #${row.rank}`;
  els.detailName.textContent = row.name;
  const bits = [`${record(row)} · last fought ${row.last_date || "—"}`];
  if (row.style) bits.push(row.style);
  els.detailMeta.textContent = bits.join(" · ");

  els.detailStats.textContent = "";
  stat("Score", fmt(row.rating));
  stat("Class (strength)", fmt(classPoints(row)));
  stat("Current form", signed(formPoints(row)) + " pts");
  stat("Round robin", row.rr_win_pct == null ? "—" : `${Math.round(row.rr_win_pct * 100)}% vs ${row.division} (RR #${row.rr_division_rank})`);
  if (row.age != null) stat("Age", fmt(row.age, 1));
  if (row.height_in != null || row.reach_in != null) {
    stat("Height / reach", `${heightText(row.height_in)} / ${row.reach_in == null ? "—" : Math.round(row.reach_in) + '"'}`);
  }
  if (row.stance) stat("Stance", row.stance);
  if (row.tags && row.tags.length) stat("Tags", row.tags.join(", "));

  els.detailHistory.textContent = "";
  for (const bout of row.history || []) {
    const li = document.createElement("li");
    const mark = document.createElement("span");
    mark.className = "ufc-form-chip is-" + String(bout.result || "").toLowerCase();
    mark.textContent = bout.result || "?";
    const text = document.createElement("span");
    text.textContent = `${bout.opponent} · ${bout.date}`;
    li.append(mark, text);
    if (!bout.counted) {
      const note = document.createElement("em");
      note.textContent = "not rated";
      li.appendChild(note);
    }
    els.detailHistory.appendChild(li);
  }

  const notes = [];
  notes.push(
    `Class is what the model needed to explain this record after pricing in age, reach, and how the fights were fought. Form is the current statistical profile — opponent-adjusted, weighted toward recent fights — counted at half weight in the score.`
  );
  if (row.rr_win_pct != null) {
    notes.push(
      `Against the average ${row.division} opponent profile the model gives them about a ${Math.round(row.rr_win_pct * 100)}% win chance across the division round robin.`
    );
  }
  els.detailNote.textContent = notes.join(" ");
  els.detail.scrollIntoView({ block: "nearest", behavior: "smooth" });
  render();
}

els.search.addEventListener("input", () => {
  state.search = els.search.value;
  render();
});
els.viewScore.addEventListener("click", () => {
  state.view = "score";
  render();
});
els.viewRoundRobin.addEventListener("click", () => {
  state.view = "roundrobin";
  render();
});

els.summary.textContent = data.asOf
  ? `${rankings.length} fighters · ${data.fights} rated fights · through ${data.asOf}`
  : `${rankings.length} fighters`;
render();
