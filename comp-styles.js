/* Comp style taxonomy: Pick / Fight / Poke (+ subs).
   Cycle: Pick → Fight → Poke → Pick (each answers the next). */
(function (root) {
  "use strict";

  var MAJORS = {
    pick: {
      id: "pick",
      label: "Pick",
      short: "Isolate one target and delete them before a fair fight starts.",
      beats: "fight",
      color: "#c9a24a",
    },
    fight: {
      id: "fight",
      label: "Fight",
      short: "Force a full teamfight and win the brawl on numbers and setup.",
      beats: "poke",
      color: "#5b8def",
    },
    poke: {
      id: "poke",
      label: "Poke",
      short: "Whittle from range, take plates and towers, avoid committing first.",
      beats: "pick",
      color: "#6fbf8a",
    },
  };

  var SUBS = {
    hook: {
      id: "hook",
      major: "pick",
      label: "Hook",
      short: "Ranged CC that isolates a target and presents a kill opportunity.",
    },
    skirmish: {
      id: "skirmish",
      major: "pick",
      label: "Skirmish",
      short: "Win short 1–3 person scraps spread across the map",
    },
    burst: {
      id: "burst",
      major: "pick",
      label: "Burst",
      short: "High tempo assassins that can delete an enemy in one combo.",
    },
    engage: {
      id: "engage",
      major: "fight",
      label: "Engage",
      short: "Layering AOE CC and ultimates starts a 5v5 on your terms.",
    },
    dive: {
      id: "dive",
      major: "fight",
      label: "Dive",
      short: "Pressure the enemy backline and force them to react.",
    },
    protect: {
      id: "protect",
      major: "fight",
      label: "Protect",
      short: "Peel and buff your carry so the fight comes to them.",
    },
    artillery: {
      id: "artillery",
      major: "poke",
      label: "Artillery",
      short: "Long-range spells punish anyone who walks up.",
    },
    siege: {
      id: "siege",
      major: "poke",
      label: "Siege",
      short: "Clear waves safely and take towers without a fair fight.",
    },
  };

  var MAJOR_ORDER = ["pick", "fight", "poke"];
  var SUB_ORDER = ["hook", "skirmish", "burst", "engage", "dive", "protect", "artillery", "siege"];

  /* Primary weight 3, secondary 1.5, tertiary 1. Keys are champion ids. */
  var CHAMP = {
    Aatrox: ["dive", "engage"],
    Ahri: ["burst", "skirmish"],
    Akali: ["burst", "dive", "skirmish"],
    Akshan: ["skirmish", "siege"],
    Alistar: ["engage", "protect"],
    Ambessa: ["dive", "skirmish"],
    Amumu: ["engage"],
    Anivia: ["artillery", "protect"],
    Annie: ["burst", "engage"],
    Aphelios: ["siege", "protect"],
    Ashe: ["artillery", "siege"],
    AurelionSol: ["artillery", "engage"],
    Aurora: ["burst", "skirmish"],
    Azir: ["siege", "artillery"],
    Bard: ["hook", "skirmish", "engage"],
    Belveth: ["skirmish", "dive"],
    Blitzcrank: ["hook"],
    Brand: ["artillery", "burst"],
    Braum: ["protect", "engage"],
    Briar: ["dive", "skirmish"],
    Caitlyn: ["siege", "artillery"],
    Camille: ["dive", "skirmish"],
    Cassiopeia: ["skirmish", "artillery"],
    Chogath: ["engage", "skirmish", "protect"],
    Corki: ["siege", "artillery", "skirmish"],
    Darius: ["skirmish", "engage"],
    Diana: ["dive", "burst"],
    DrMundo: ["protect", "engage"],
    Draven: ["skirmish", "burst"],
    Ekko: ["burst", "skirmish"],
    Elise: ["skirmish", "dive"],
    Evelynn: ["burst", "dive"],
    Ezreal: ["artillery", "siege"],
    Fiddlesticks: ["burst", "engage"],
    Fiora: ["skirmish", "dive"],
    Fizz: ["burst", "dive"],
    Galio: ["engage", "protect", "protect"],
    Gangplank: ["siege", "artillery"],
    Garen: ["engage", "skirmish", "burst"],
    Gnar: ["engage", "artillery", "skirmish"],
    Gragas: ["engage", "skirmish"],
    Graves: ["skirmish", "siege", "burst"],
    Gwen: ["skirmish", "dive", "engage"],
    Hecarim: ["dive", "engage", "skirmish"],
    Heimerdinger: ["siege", "artillery"],
    Hwei: ["artillery", "siege"],
    Illaoi: ["protect", "siege"],
    Irelia: ["dive", "skirmish"],
    Ivern: ["protect", "skirmish"],
    Janna: ["protect"],
    JarvanIV: ["dive", "engage"],
    Jax: ["dive", "skirmish"],
    Jayce: ["artillery", "siege"],
    Jhin: ["artillery", "burst"],
    Jinx: ["siege", "protect"],
    KSante: ["engage", "protect"],
    Kaisa: ["dive", "skirmish"],
    Kalista: ["skirmish", "dive"],
    Karma: ["artillery", "siege","protect"],
    Karthus: ["artillery", "engage"],
    Kassadin: ["burst", "dive"],
    Katarina: ["burst", "dive"],
    Kayle: ["protect", "siege"],
    Kayn: ["dive", "skirmish"],
    Kennen: ["engage", "artillery"],
    Khazix: ["burst", "skirmish"],
    Kindred: ["skirmish", "protect"],
    Kled: ["dive", "engage", "skirmish"],
    KogMaw: ["siege", "artillery", "protect"],
    Leblanc: ["burst", "skirmish", "dive"],
    LeeSin: ["skirmish", "dive"],
    Leona: ["engage", "hook"],
    Lillia: ["skirmish", "engage"],
    Lissandra: ["engage", "burst"],
    Locke: ["burst", "skirmish", "dive"],
    Lucian: ["skirmish", "siege"],
    Lulu: ["protect"],
    Lux: ["artillery", "hook"],
    Malphite: ["engage"],
    Malzahar: ["burst", "protect"],
    Maokai: ["engage", "protect"],
    MasterYi: ["dive", "skirmish"],
    Mel: ["artillery", "burst"],
    Milio: ["protect"],
    MissFortune: ["engage", "siege"],
    Mordekaiser: ["skirmish", "engage"],
    Morgana: ["protect", "hook"],
    Naafiri: ["burst", "skirmish"],
    Nami: ["protect", "hook"],
    Nasus: ["protect", "siege"],
    Nautilus: ["hook", "engage"],
    Neeko: ["engage", "burst"],
    Nidalee: ["skirmish", "artillery"],
    Nilah: ["dive", "skirmish"],
    Nocturne: ["dive", "engage"],
    Nunu: ["engage", "dive"],
    Olaf: ["dive", "skirmish"],
    Orianna: ["engage", "artillery"],
    Ornn: ["engage", "protect"],
    Pantheon: ["dive", "skirmish"],
    Poppy: ["protect", "engage"],
    Pyke: ["hook", "burst"],
    Qiyana: ["burst", "skirmish"],
    Quinn: ["skirmish", "siege"],
    Rakan: ["engage", "protect"],
    Rammus: ["engage", "dive"],
    RekSai: ["dive", "skirmish"],
    Rell: ["engage", "hook"],
    Renata: ["protect", "engage"],
    Renekton: ["dive", "skirmish"],
    Rengar: ["burst", "dive"],
    Riven: ["dive", "skirmish"],
    Rumble: ["engage", "artillery"],
    Ryze: ["siege", "skirmish"],
    Samira: ["dive", "skirmish"],
    Sejuani: ["engage", "protect"],
    Senna: ["artillery", "siege"],
    Seraphine: ["artillery", "protect"],
    Sett: ["engage", "skirmish"],
    Shaco: ["burst", "skirmish"],
    Shen: ["protect", "dive"],
    Shyvana: ["dive", "engage"],
    Singed: ["engage", "skirmish"],
    Sion: ["engage", "protect"],
    Sivir: ["siege", "protect"],
    Skarner: ["engage", "hook"],
    Smolder: ["siege", "artillery"],
    Sona: ["protect", "artillery"],
    Soraka: ["protect"],
    Swain: ["engage", "artillery"],
    Sylas: ["dive", "skirmish"],
    Syndra: ["burst", "artillery"],
    TahmKench: ["protect", "engage"],
    Taliyah: ["artillery", "skirmish"],
    Talon: ["burst", "dive"],
    Taric: ["protect", "engage"],
    Teemo: ["artillery", "siege"],
    Thresh: ["hook", "protect"],
    Tristana: ["siege", "dive"],
    Trundle: ["skirmish"],
    Tryndamere: ["dive", "skirmish"],
    TwistedFate: ["burst", "skirmish"],
    Twitch: ["burst", "skirmish"],
    Udyr: ["dive", "skirmish"],
    Urgot: ["engage", "skirmish"],
    Varus: ["artillery", "hook"],
    Vayne: ["skirmish", "protect"],
    Veigar: ["burst", "artillery"],
    Velkoz: ["artillery"],
    Vex: ["burst", "engage"],
    Vi: ["dive", "engage"],
    Viego: ["skirmish", "dive", "burst"],
    Viktor: ["artillery", "siege"],
    Vladimir: ["skirmish", "engage"],
    Volibear: ["dive", "engage"],
    Warwick: ["dive", "skirmish"],
    MonkeyKing: ["dive", "engage"],
    Xayah: ["protect", "siege"],
    Xerath: ["artillery"],
    XinZhao: ["dive", "skirmish"],
    Yasuo: ["dive", "skirmish", "burst"],
    Yone: ["dive", "skirmish"],
    Yorick: ["siege", "protect"],
    Yunara: ["siege", "skirmish", "protect"],
    Yuumi: ["protect"],
    Zaahen: ["dive", "skirmish"],
    Zac: ["engage", "dive"],
    Zed: ["burst", "dive"],
    Zeri: ["siege", "skirmish", "protect"],
    Ziggs: ["siege", "artillery", "burst"],
    Zilean: ["protect", "burst"],
    Zoe: ["burst", "artillery"],
    Zyra: ["artillery", "siege"],
  };

  var WEIGHTS = [3, 1.5, 1];

  function emptyScores() {
    return {
      pick: 0,
      fight: 0,
      poke: 0,
      hook: 0,
      skirmish: 0,
      burst: 0,
      engage: 0,
      dive: 0,
      protect: 0,
      artillery: 0,
      siege: 0,
    };
  }

  function addChamp(scores, id) {
    var tags = CHAMP[id];
    if (!tags || !tags.length) return;
    for (var i = 0; i < tags.length; i += 1) {
      var sub = tags[i];
      var w = WEIGHTS[i] || 1;
      if (!SUBS[sub]) continue;
      scores[sub] += w;
      scores[SUBS[sub].major] += w;
    }
  }

  function topKey(scores, keys) {
    var best = keys[0];
    var bestVal = -1;
    for (var i = 0; i < keys.length; i += 1) {
      var k = keys[i];
      var v = scores[k] || 0;
      if (v > bestVal) {
        bestVal = v;
        best = k;
      }
    }
    return { id: best, score: bestVal };
  }

  function subsForMajor(majorId) {
    var out = [];
    for (var i = 0; i < SUB_ORDER.length; i += 1) {
      var id = SUB_ORDER[i];
      if (SUBS[id].major === majorId) out.push(id);
    }
    return out;
  }

  function softMajors(scores) {
    var total = (scores.pick || 0) + (scores.fight || 0) + (scores.poke || 0);
    if (!total) return { pick: 1 / 3, fight: 1 / 3, poke: 1 / 3 };
    return {
      pick: scores.pick / total,
      fight: scores.fight / total,
      poke: scores.poke / total,
    };
  }

  /* Secondary must clear this share of total style mass.
     Same-major seconds (Siege/Artillery) get a slightly lower bar.
     Cross-major seconds must clear the full bar on the SUB itself —
     not just the runner-up major — so one Dive champ can't mint a Dive tag. */
  var SECONDARY_SHARE = 0.28;
  var SECONDARY_SAME_MAJOR = 0.18;

  function pickSecondary(scores, primarySub, total) {
    if (!total || !primarySub || !SUBS[primarySub]) return null;
    var primaryMajor = SUBS[primarySub].major;
    var ranked = SUB_ORDER.slice().sort(function (a, b) {
      return (scores[b] || 0) - (scores[a] || 0);
    });
    var same = null;
    var cross = null;
    var i;
    for (i = 0; i < ranked.length; i += 1) {
      var id = ranked[i];
      if (id === primarySub || !SUBS[id]) continue;
      var share = (scores[id] || 0) / total;
      if (SUBS[id].major === primaryMajor) {
        if (!same && share >= SECONDARY_SAME_MAJOR) same = id;
      } else if (!cross && share >= SECONDARY_SHARE) {
        cross = id;
      }
    }
    return same || cross;
  }

  function classify(champIds) {
    var scores = emptyScores();
    var list = champIds || [];
    for (var i = 0; i < list.length; i += 1) {
      if (list[i]) addChamp(scores, list[i]);
    }
    var major = topKey(scores, MAJOR_ORDER);
    var sub = topKey(scores, subsForMajor(major.id));
    var total = scores.pick + scores.fight + scores.poke;
    var confidence = total > 0 ? major.score / total : 0;
    var secondaryId = pickSecondary(scores, sub.id, total);
    var secondary = null;
    if (secondaryId && SUBS[secondaryId]) {
      secondary = {
        major: SUBS[secondaryId].major,
        sub: secondaryId,
        majorMeta: MAJORS[SUBS[secondaryId].major],
        subMeta: SUBS[secondaryId],
        label: MAJORS[SUBS[secondaryId].major].label + " · " + SUBS[secondaryId].label,
        short: SUBS[secondaryId].short,
        share: total ? scores[secondaryId] / total : 0,
      };
    }
    var label = MAJORS[major.id].label + " · " + SUBS[sub.id].label;
    if (secondary) label = SUBS[sub.id].label + " / " + SUBS[secondaryId].label;
    return {
      major: major.id,
      sub: sub.id,
      secondary: secondary,
      dual: !!secondary,
      scores: scores,
      soft: softMajors(scores),
      confidence: confidence,
      majorMeta: MAJORS[major.id],
      subMeta: SUBS[sub.id],
      label: label,
      short: secondary
        ? SUBS[sub.id].short + " Fail-safe: " + SUBS[secondaryId].short
        : SUBS[sub.id].short,
    };
  }

  function cycleScore(aSoft, bSoft) {
    var s = 0;
    for (var i = 0; i < MAJOR_ORDER.length; i += 1) {
      var atk = MAJOR_ORDER[i];
      var vic = MAJOR_ORDER[(i + 1) % MAJOR_ORDER.length];
      s += (aSoft[atk] || 0) * (bSoft[vic] || 0) - (bSoft[atk] || 0) * (aSoft[vic] || 0);
    }
    return s;
  }

  var styleTableMemo = null;

  function pairKey(a, b) {
    return a + "|" + b;
  }

  function buildStyleTables(games) {
    var h2h = {};
    var list = games || [];
    for (var i = 0; i < list.length; i += 1) {
      var g = list[i];
      var b = classify(g.b || []);
      var r = classify(g.r || []);
      if (!b.sub || !r.sub || b.sub === r.sub) continue;
      var bw = g.w === 1;
      var ab = pairKey(b.sub, r.sub);
      var ba = pairKey(r.sub, b.sub);
      if (!h2h[ab]) h2h[ab] = { w: 0, n: 0 };
      if (!h2h[ba]) h2h[ba] = { w: 0, n: 0 };
      if (bw) {
        h2h[ab].w += 1;
        h2h[ab].n += 1;
        h2h[ba].n += 1;
      } else {
        h2h[ba].w += 1;
        h2h[ba].n += 1;
        h2h[ab].n += 1;
      }
    }
    styleTableMemo = { h2h: h2h, games: list.length };
    return styleTableMemo;
  }

  function ensureStyleTables() {
    if (styleTableMemo) return styleTableMemo;
    var games =
      (typeof root !== "undefined" && root.RIFT_PRO_GAMES && root.RIFT_PRO_GAMES.games) ||
      (typeof window !== "undefined" && window.RIFT_PRO_GAMES && window.RIFT_PRO_GAMES.games) ||
      [];
    return buildStyleTables(games);
  }

  function subEdge(aSub, bSub, prior, h2hTable) {
    if (!aSub || !bSub || aSub === bSub) return { edge: 0, n: 0, wr: 0.5 };
    prior = prior == null ? 20 : prior;
    var table = h2hTable || ensureStyleTables().h2h;
    var rec = table[pairKey(aSub, bSub)];
    var n = rec ? rec.n : 0;
    var w = rec ? rec.w : 0;
    var wr = (w + prior * 0.5) / (n + prior);
    return { edge: (wr - 0.5) * 2, n: n, wr: wr };
  }

  /* Tuned in ratings/tune_style.py: sub@60 (+0.8pp / +4.3pp in close games). */
  var STYLE_SUB_MULT = 60;
  var STYLE_SOFT_MULT = 10;
  var STYLE_SUB_MIN = 8;

  function predictFeature(blueIds, redIds, h2hTable) {
    var blue = classify(blueIds || []);
    var red = classify(redIds || []);
    var soft = cycleScore(blue.soft, red.soft);
    var sub = subEdge(blue.sub, red.sub, null, h2hTable);
    var usedSub = sub.n >= STYLE_SUB_MIN;
    var feature = usedSub ? sub.edge : soft;
    var mult = usedSub ? STYLE_SUB_MULT : STYLE_SOFT_MULT;
    var elo = feature * mult;
    var note = matchup(blue, red);
    return {
      blue: blue,
      red: red,
      soft: soft,
      sub: sub,
      usedSub: usedSub,
      feature: feature,
      elo: elo,
      note: note,
    };
  }

  function answers(attacker, victim) {
    return MAJORS[attacker] && MAJORS[attacker].beats === victim;
  }

  function matchupDetail(winner, loser) {
    var wL = winner.majorMeta.label;
    var lL = loser.majorMeta.label;
    var wS = winner.subMeta.label;
    var lS = loser.subMeta.label;
    if (winner.major === "pick") {
      return (
        wL +
        " wants to isolate before " +
        lL +
        " gets a clean " +
        lS.toLowerCase() +
        ". Play for the catch, not the fair fight."
      );
    }
    if (winner.major === "fight") {
      return (
        wL +
        " should all-in before " +
        lL +
        " whittles the wave. " +
        wS +
        " beats a slow siege if the start lands."
      );
    }
    return (
      wL +
      " punishes " +
      lL +
      " for walking up. Stay at range, clear, and take towers — do not take " +
      lS.toLowerCase() +
      " fights."
    );
  }

  function failSafeNote(side) {
    if (!side || !side.secondary) return "";
    return (
      " " +
      side.subMeta.label +
      " is the start; " +
      side.secondary.subMeta.label.toLowerCase() +
      " is the fail-safe."
    );
  }

  function matchup(a, b) {
    if (!a || !b) return null;
    var aL = a.majorMeta.label;
    var bL = b.majorMeta.label;
    var aS = a.subMeta.label;
    var bS = b.subMeta.label;
    var dualBits = failSafeNote(a) + failSafeNote(b);
    if (answers(a.major, b.major)) {
      return {
        favored: "a",
        headline: a.label + " answers " + b.label,
        detail: matchupDetail(a, b) + dualBits,
      };
    }
    if (answers(b.major, a.major)) {
      return {
        favored: "b",
        headline: b.label + " answers " + a.label,
        detail: matchupDetail(b, a) + dualBits,
      };
    }
    if (a.sub === b.sub && !a.dual && !b.dual) {
      return {
        favored: "even",
        headline: "Same script · " + aS,
        detail: "Both sides want the same kind of fight. Execution and vision decide it.",
      };
    }
    return {
      favored: "even",
      headline: a.label + " vs " + b.label,
      detail:
        (a.major === b.major
          ? "Same major, different tools. Whoever lands their plan first owns the map."
          : aS + " vs " + bS + " — execution and vision decide it.") + dualBits,
    };
  }

  function oneChip(majorId, subLabel, opts) {
    opts = opts || {};
    var cls = "comp-style-chip major-" + majorId;
    if (opts.compact) cls += " is-compact";
    if (opts.secondary) cls += " is-secondary";
    var major = opts.compact
      ? ""
      : "<em>" + MAJORS[majorId].label + "</em>";
    return (
      '<span class="' +
      cls +
      '">' +
      major +
      "<span>" +
      subLabel +
      "</span></span>"
    );
  }

  function chipHtml(result, opts) {
    opts = opts || {};
    if (!result) return "";
    var title = result.label + " — " + result.short;
    var html = oneChip(result.major, result.subMeta.label, opts);
    if (result.secondary) {
      html +=
        '<span class="comp-style-slash" aria-hidden="true">/</span>' +
        oneChip(result.secondary.major, result.secondary.subMeta.label, {
          compact: opts.compact,
          secondary: true,
        });
    }
    return (
      '<span class="comp-style-stack" title="' + title.replace(/"/g, "&quot;") + '">' + html + "</span>"
    );
  }

  root.CompStyles = {
    MAJORS: MAJORS,
    SUBS: SUBS,
    MAJOR_ORDER: MAJOR_ORDER,
    SUB_ORDER: SUB_ORDER,
    CHAMP: CHAMP,
    STYLE_SUB_MULT: STYLE_SUB_MULT,
    STYLE_SOFT_MULT: STYLE_SOFT_MULT,
    SECONDARY_SHARE: SECONDARY_SHARE,
    SECONDARY_SAME_MAJOR: SECONDARY_SAME_MAJOR,
    classify: classify,
    matchup: matchup,
    chipHtml: chipHtml,
    subsForMajor: subsForMajor,
    answers: answers,
    cycleScore: cycleScore,
    softMajors: softMajors,
    buildStyleTables: buildStyleTables,
    ensureStyleTables: ensureStyleTables,
    subEdge: subEdge,
    predictFeature: predictFeature,
  };
})(typeof window !== "undefined" ? window : globalThis);
