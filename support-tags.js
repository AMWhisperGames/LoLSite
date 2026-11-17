/* Support archetype tags (multi-label). First cut for testing.
   A champ can carry several tags when they fit. Order in each list is
   primary → secondary. Keys are champion ids (same as champions.js). */
(function (root) {
  "use strict";

  var TAGS = {
    enchanter: {
      id: "enchanter",
      label: "Enchanter",
      short: "Shields, heals, and buffs that power the carry.",
      color: "#6fbf8a",
    },
    engage: {
      id: "engage",
      label: "Engage",
      short: "Starts the fight — hard CC engage onto the enemy.",
      color: "#e0706c",
    },
    warden: {
      id: "warden",
      label: "Warden",
      short: "Peels and bodyblocks; keeps the backline alive.",
      color: "#5b8def",
    },
    hook: {
      id: "hook",
      label: "Hook",
      short: "Long-range catch: hooks, binds, or similar pick tools.",
      color: "#c9a24a",
    },
    mage: {
      id: "mage",
      label: "Mage",
      short: "Damage/poke mage support — AP threat from bot.",
      color: "#9b7bde",
    },
    other: {
      id: "other",
      label: "Other",
      short: "Utility, roam, or hybrid that does not sit cleanly elsewhere.",
      color: "#8a96a3",
    },
  };

  var TAG_ORDER = ["enchanter", "engage", "warden", "hook", "mage", "other"];

  /* Primary-first. Flex / off-meta supports included when they show up in lane. */
  var CHAMP = {
    Alistar: ["engage", "warden"],
    Amumu: ["engage"],
    Anivia: ["mage", "warden"],
    Annie: ["mage", "engage"],
    Ashe: ["other", "mage"],
    Bard: ["hook", "other", "engage"],
    Blitzcrank: ["hook"],
    Brand: ["mage"],
    Braum: ["warden", "engage"],
    Camille: ["engage", "other"],
    Elise: ["engage", "other"],
    Fiddlesticks: ["mage", "engage"],
    Galio: ["engage", "warden"],
    Gragas: ["engage", "warden"],
    Heimerdinger: ["mage"],
    Hwei: ["mage"],
    Ivern: ["enchanter", "other"],
    Janna: ["enchanter", "warden"],
    Karma: ["enchanter", "mage"],
    Leblanc: ["mage", "other"],
    Leona: ["engage"],
    Lulu: ["enchanter"],
    Lux: ["mage", "hook"],
    Maokai: ["engage", "warden"],
    Mel: ["mage"],
    Milio: ["enchanter"],
    Morgana: ["mage", "hook", "warden"],
    Nami: ["enchanter", "hook"],
    Nautilus: ["hook", "engage"],
    Neeko: ["mage", "engage"],
    Nidalee: ["other", "mage"],
    Nunu: ["engage"],
    Pantheon: ["engage", "other"],
    Poppy: ["warden", "engage"],
    Pyke: ["hook", "engage", "other"],
    Rakan: ["engage", "enchanter"],
    Rell: ["engage", "hook"],
    Renata: ["enchanter", "engage"],
    Senna: ["mage", "other"],
    Seraphine: ["enchanter", "mage"],
    Shaco: ["other", "hook"],
    Shen: ["warden", "engage"],
    Skarner: ["engage"],
    Sona: ["enchanter", "mage"],
    Soraka: ["enchanter"],
    Swain: ["mage", "engage"],
    Sylas: ["mage", "engage"],
    TahmKench: ["warden"],
    Taric: ["warden", "enchanter", "engage"],
    Teemo: ["mage", "other"],
    Thresh: ["hook", "engage", "warden"],
    Twitch: ["other", "mage"],
    Veigar: ["mage"],
    Velkoz: ["mage"],
    Xerath: ["mage"],
    Yuumi: ["enchanter"],
    Zac: ["engage", "warden"],
    Zilean: ["enchanter", "other"],
    Zoe: ["mage", "other"],
    Zyra: ["mage"],
  };

  function normalizeId(id) {
    return String(id || "").replace(/[^a-zA-Z0-9]/g, "");
  }

  function tagsOf(id) {
    var key = normalizeId(id);
    var list = CHAMP[key] || CHAMP[id] || null;
    if (!list || !list.length) return [];
    var out = [];
    var seen = {};
    for (let i = 0; i < list.length; i += 1) {
      var tag = list[i];
      if (!TAGS[tag] || seen[tag]) continue;
      seen[tag] = true;
      out.push(tag);
    }
    return out;
  }

  function primaryOf(id) {
    var tags = tagsOf(id);
    return tags[0] || null;
  }

  function hasTag(id, tag) {
    return tagsOf(id).indexOf(tag) !== -1;
  }

  function metaOf(tag) {
    return TAGS[tag] || null;
  }

  function classify(id) {
    var tags = tagsOf(id);
    return {
      id: id,
      tags: tags,
      primary: tags[0] || null,
      metas: tags.map(function (t) {
        return TAGS[t];
      }),
    };
  }

  function chipHtml(id, opts) {
    opts = opts || {};
    var tags = tagsOf(id);
    if (!tags.length) return "";
    var html = "";
    for (let i = 0; i < tags.length; i += 1) {
      var meta = TAGS[tags[i]];
      if (!meta) continue;
      var secondary = i > 0;
      html +=
        '<span class="support-tag' +
        (secondary ? " is-secondary" : "") +
        '" style="--support-tag:' +
        meta.color +
        '" title="' +
        meta.label +
        " — " +
        meta.short.replace(/"/g, "&quot;") +
        '">' +
        (opts.compact ? meta.label.slice(0, 3) : meta.label) +
        "</span>";
    }
    return '<span class="support-tag-stack">' + html + "</span>";
  }

  function champsWithTag(tag) {
    var out = [];
    var ids = Object.keys(CHAMP);
    for (let i = 0; i < ids.length; i += 1) {
      if (hasTag(ids[i], tag)) out.push(ids[i]);
    }
    return out;
  }

  root.SupportTags = {
    TAGS: TAGS,
    TAG_ORDER: TAG_ORDER,
    CHAMP: CHAMP,
    tagsOf: tagsOf,
    primaryOf: primaryOf,
    hasTag: hasTag,
    metaOf: metaOf,
    classify: classify,
    chipHtml: chipHtml,
    champsWithTag: champsWithTag,
  };
})(typeof window !== "undefined" ? window : globalThis);
