"use strict";

const data = window.UFC_MODEL || { rankings: [], features: [], beta: [], scale: [] };
const fighters = Array.isArray(data.rankings) ? data.rankings : [];
const POINTS = data.pointsPerUnit || 173.717;
const FEATURE_INDEX = {};
(data.features || []).forEach((name, i) => (FEATURE_INDEX[name] = i));

const els = {
  summary: document.getElementById("ufc-summary"),
  inputA: document.getElementById("fighter-a"),
  inputB: document.getElementById("fighter-b"),
  swap: document.getElementById("h2h-swap"),
  list: document.getElementById("fighter-list"),
  result: document.getElementById("h2h-result"),
  call: document.getElementById("h2h-call"),
  probA: document.getElementById("prob-a"),
  probB: document.getElementById("prob-b"),
  probALabel: document.getElementById("prob-a-label"),
  probBLabel: document.getElementById("prob-b-label"),
  whyAName: document.getElementById("why-a-name"),
  whyBName: document.getElementById("why-b-name"),
  whyA: document.getElementById("why-a"),
  whyB: document.getElementById("why-b"),
  confidenceBadge: document.getElementById("confidence-badge"),
  confidenceReasons: document.getElementById("confidence-reasons"),
  tape: document.getElementById("tape-body"),
  note: document.getElementById("h2h-note"),
};

function fold(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function fmt(value, digits) {
  return value == null ? "—" : Number(value).toFixed(digits == null ? 1 : digits);
}

function signedPts(value) {
  const n = Math.round(value);
  return (n > 0 ? "+" : "") + n;
}

function heightText(inches) {
  if (inches == null) return "—";
  const total = Math.round(inches);
  return `${Math.floor(total / 12)}'${total % 12}"`;
}

function byName(name) {
  const needle = fold(name).trim();
  return fighters.find((row) => fold(row.name) === needle) || null;
}

function vec(row, feature) {
  const i = FEATURE_INDEX[feature];
  return i == null || !row.vector ? 0 : row.vector[i] || 0;
}

const DRIVER_TEXT = {
  sig_diff: (a, b) => `striking differential ${fmt(vec(a, "sig_diff"), 2)} vs ${fmt(vec(b, "sig_diff"), 2)} per minute (opponent-adjusted)`,
  sig_accuracy: (a, b) => `strike accuracy edge in recent fights`,
  kd_diff: () => `knockdown power in recent fights`,
  td_diff: (a, b) => `takedown differential ${fmt(vec(a, "td_diff"), 2)} vs ${fmt(vec(b, "td_diff"), 2)} per minute`,
  td_accuracy: () => `takedown accuracy edge`,
  td_defense: () => `harder to take down recently`,
  control_share: () => `control-time dominance in recent fights`,
  sub_diff: () => `submission pressure in recent fights`,
  finish_rate: () => `finishes fights at a higher rate`,
  finished_rate: () => `almost never gets finished`,
  win_form: () => `better recent results coming in`,
  streak: () => `momentum adjustment (streaks are priced against the step-up, so this can cut either way)`,
  layoff: (a, b) => `layoff: ${layoffText(a)} vs ${layoffText(b)} since last fight`,
  experience: (a, b) => `UFC experience, ${a.fights} vs ${b.fights} rated fights`,
  reach: (a, b) => `reach ${a.reach_in == null ? "—" : Math.round(a.reach_in) + '"'} vs ${b.reach_in == null ? "—" : Math.round(b.reach_in) + '"'}`,
  height: (a, b) => `height ${heightText(a.height_in)} vs ${heightText(b.height_in)}`,
  age: (a, b) => `age ${a.age == null ? "—" : fmt(a.age, 0)} vs ${b.age == null ? "—" : fmt(b.age, 0)} — decline past 33 is priced`,
};

const DRIVER_LABEL = {
  sig_diff: "Striking differential",
  sig_accuracy: "Strike accuracy",
  kd_diff: "Knockdowns",
  td_diff: "Takedowns",
  td_accuracy: "Takedown accuracy",
  td_defense: "Takedown defense",
  control_share: "Control",
  sub_diff: "Submission pressure",
  finish_rate: "Finishing",
  finished_rate: "Durability",
  win_form: "Recent form",
  streak: "Streak adjustment",
  layoff: "Layoff",
  experience: "Experience",
  reach: "Reach",
  height: "Height",
  age: "Age",
};

function layoffText(row) {
  const days = Math.round(Math.expm1(vec(row, "layoff")));
  if (days < 60) return `${days} days`;
  return `${(days / 30.44).toFixed(days >= 300 ? 0 : 1)} months`;
}

function predict(a, b) {
  const drivers = [
    {
      label: "Demonstrated class",
      value: (a.strength || 0) - (b.strength || 0),
      detail: `class ${fmt(1500 + POINTS * (a.strength || 0), 0)} vs ${fmt(1500 + POINTS * (b.strength || 0), 0)} from the full record`,
    },
  ];
  (data.features || []).forEach((feature, i) => {
    const value = ((data.beta[i] || 0) * ((a.vector[i] || 0) - (b.vector[i] || 0))) / (data.scale[i] || 1);
    if (Math.abs(value) < 0.005) return;
    drivers.push({
      label: DRIVER_LABEL[feature] || feature,
      value,
      detail: DRIVER_TEXT[feature] ? DRIVER_TEXT[feature](a, b) : "",
    });
  });
  // Size cannot be fitted: every training fight is at one weight class, so
  // a weight gap has no variance to learn from. This overlay is a stated
  // heuristic (about +0.16 log-odds per 10 lb), shown separately and never
  // folded into the rankings.
  if (a.weight_lb != null && b.weight_lb != null && Math.abs(a.weight_lb - b.weight_lb) >= 5) {
    drivers.push({
      label: "Size gap (heuristic)",
      value: 0.016 * (a.weight_lb - b.weight_lb),
      detail: `${Math.round(a.weight_lb)} lb vs ${Math.round(b.weight_lb)} lb — not a fitted edge; the model only ever saw same-class fights, so size is priced by rule of thumb`,
    });
  }
  const logit = drivers.reduce((sum, d) => sum + d.value, 0);
  const probA = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, logit))));
  return { probA, drivers };
}

function confidence(a, b, probA) {
  const fav = Math.max(probA, 1 - probA);
  let level = fav >= 0.72 ? 3 : fav >= 0.62 ? 2 : fav >= 0.55 ? 1 : 0;
  const reasons = [];
  reasons.push(
    fav >= 0.72
      ? `The line is decisive: the favorite wins about ${Math.round(fav * 100)} of 100 on the model's numbers.`
      : fav >= 0.62
        ? `A clear but not safe lean at ${Math.round(fav * 100)}%.`
        : fav >= 0.55
          ? `Only a lean at ${Math.round(fav * 100)}% — small edges, several of them fragile.`
          : `A genuine coin flip (${Math.round(fav * 100)}%): treat the pick as a tie-breaker, not a prediction.`
  );
  const minFights = Math.min(a.fights, b.fights);
  if (minFights < 8) {
    level = Math.max(0, level - 1);
    reasons.push(`Thin evidence: the greener fighter has only ${minFights} rated UFC fights, so their class is still being estimated.`);
  } else {
    reasons.push(`Both are established (${a.fights} and ${b.fights} rated fights), so the class estimates are stable.`);
  }
  if (a.weight_lb != null && b.weight_lb != null && Math.abs(a.weight_lb - b.weight_lb) >= 20) {
    level = Math.max(0, level - 1);
    reasons.push(
      `Cross-division size gap (${Math.round(Math.abs(a.weight_lb - b.weight_lb))} lb): the size edge is a heuristic overlay, not something the model learned, so the true margin is less certain than the number looks.`
    );
  }
  const layoffDays = (row) => Math.round(Math.expm1(vec(row, "layoff")));
  const rusty = [a, b].filter((row) => layoffDays(row) > 540);
  if (rusty.length) {
    level = Math.max(0, level - 1);
    reasons.push(`Layoff uncertainty: ${rusty.map((row) => `${row.name} (${layoffText(row)} out)`).join(", ")} — long absences make current form harder to trust.`);
  }
  if (a.age == null || b.age == null || a.reach_in == null || b.reach_in == null) {
    reasons.push("Some biometric data is missing for one of them, so the age/reach edges are partly guessed.");
  }
  const labels = ["Low — coin flip territory", "Low-moderate lean", "Moderate confidence", "High confidence"];
  return { label: labels[level], level, reasons };
}

function driverList(el, drivers, maxAbs) {
  el.textContent = "";
  if (!drivers.length) {
    const li = document.createElement("li");
    li.className = "driver-empty";
    li.textContent = "No meaningful edges — the other fighter's advantages decide this.";
    el.appendChild(li);
    return;
  }
  for (const driver of drivers.slice(0, 5)) {
    const li = document.createElement("li");
    const head = document.createElement("div");
    head.className = "driver-head";
    const name = document.createElement("span");
    name.textContent = driver.label;
    const pts = document.createElement("span");
    pts.className = "driver-pts";
    pts.textContent = signedPts(POINTS * Math.abs(driver.value)) + " pts";
    head.append(name, pts);
    const track = document.createElement("div");
    track.className = "driver-track";
    const fill = document.createElement("div");
    fill.className = "driver-fill";
    fill.style.width = `${Math.max(6, (Math.abs(driver.value) / maxAbs) * 100)}%`;
    track.appendChild(fill);
    const detail = document.createElement("p");
    detail.className = "driver-detail";
    detail.textContent = driver.detail;
    li.append(head, track, detail);
    el.appendChild(li);
  }
}

function tapeRow(label, aValue, bValue) {
  const tr = document.createElement("tr");
  const tdA = document.createElement("td");
  tdA.textContent = aValue;
  const th = document.createElement("th");
  th.textContent = label;
  const tdB = document.createElement("td");
  tdB.textContent = bValue;
  tr.append(tdA, th, tdB);
  return tr;
}

function render() {
  const a = byName(els.inputA.value);
  const b = byName(els.inputB.value);
  if (!a || !b || a.fighter_id === b.fighter_id) {
    els.result.hidden = true;
    return;
  }
  const { probA, drivers } = predict(a, b);
  const favA = probA >= 0.5;
  const winner = favA ? a : b;
  const winnerProb = favA ? probA : 1 - probA;

  els.result.hidden = false;
  els.call.textContent = `${winner.name} — ${Math.round(winnerProb * 100)}%`;
  els.probA.style.width = `${probA * 100}%`;
  els.probB.style.width = `${(1 - probA) * 100}%`;
  els.probALabel.textContent = `${a.name} ${Math.round(probA * 100)}%`;
  els.probBLabel.textContent = `${b.name} ${Math.round((1 - probA) * 100)}%`;
  els.whyAName.textContent = a.name.split(" ").slice(-1)[0];
  els.whyBName.textContent = b.name.split(" ").slice(-1)[0];

  const maxAbs = Math.max(...drivers.map((d) => Math.abs(d.value)), 0.01);
  const byImpact = (x, y) => y.value - x.value;
  driverList(els.whyA, drivers.filter((d) => d.value > 0.01).sort(byImpact), maxAbs);
  driverList(
    els.whyB,
    drivers
      .filter((d) => d.value < -0.01)
      .map((d) => ({ ...d, value: -d.value }))
      .sort(byImpact),
    maxAbs
  );

  const conf = confidence(a, b, probA);
  els.confidenceBadge.textContent = conf.label;
  els.confidenceBadge.dataset.level = conf.level;
  els.confidenceReasons.textContent = "";
  for (const reason of conf.reasons) {
    const li = document.createElement("li");
    li.textContent = reason;
    els.confidenceReasons.appendChild(li);
  }

  els.tape.textContent = "";
  const form = (row) => signedPts(POINTS * 0.5 * (row.form_component || 0));
  els.tape.append(
    tapeRow("Division", `${a.division} #${a.division_rank}`, `${b.division} #${b.division_rank}`),
    tapeRow("Record", `${a.wins}-${a.losses}`, `${b.wins}-${b.losses}`),
    tapeRow("Score", fmt(a.rating), fmt(b.rating)),
    tapeRow("Class", fmt(1500 + POINTS * (a.strength || 0), 0), fmt(1500 + POINTS * (b.strength || 0), 0)),
    tapeRow("Form", form(a), form(b)),
    tapeRow("Style", a.style || "—", b.style || "—"),
    tapeRow("Age", a.age == null ? "—" : fmt(a.age, 0), b.age == null ? "—" : fmt(b.age, 0)),
    tapeRow("Weight", a.weight_lb == null ? "—" : Math.round(a.weight_lb) + " lb", b.weight_lb == null ? "—" : Math.round(b.weight_lb) + " lb"),
    tapeRow("Height", heightText(a.height_in), heightText(b.height_in)),
    tapeRow("Reach", a.reach_in == null ? "—" : Math.round(a.reach_in) + '"', b.reach_in == null ? "—" : Math.round(b.reach_in) + '"'),
    tapeRow("Stance", a.stance || "—", b.stance || "—"),
    tapeRow("Last 5", (a.recent || "").trim() || "—", (b.recent || "").trim() || "—")
  );

  const notes = [];
  if (a.division !== b.division) {
    notes.push("Cross-division fantasy matchup: class and form transfer across divisions, but the size edge is a heuristic overlay — no real fight in the training data had a gap like this.");
  }
  notes.push(`Layoffs are as of ${data.asOf || "the latest data"}; a full camp for either fighter would change that edge on the night.`);
  if (a.stance && b.stance && fold(a.stance) !== fold(b.stance)) {
    notes.push(`Open-stance matchup (${a.stance} vs ${b.stance}) — shown for context; stance is not one of the model's fitted edges.`);
  }
  els.note.textContent = notes.join(" ");
}

for (const name of fighters.map((row) => row.name).sort()) {
  const option = document.createElement("option");
  option.value = name;
  els.list.appendChild(option);
}

els.inputA.addEventListener("input", render);
els.inputB.addEventListener("input", render);
els.swap.addEventListener("click", () => {
  [els.inputA.value, els.inputB.value] = [els.inputB.value, els.inputA.value];
  render();
});

els.inputA.value = "Islam Makhachev";
els.inputB.value = "Michael Morales";
els.summary.textContent = data.asOf
  ? `${fighters.length} fighters · ${data.fights} rated fights · through ${data.asOf}`
  : `${fighters.length} fighters`;
render();
