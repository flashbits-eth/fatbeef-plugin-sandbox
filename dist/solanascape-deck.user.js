// ==UserScript==
// @name         Solanascape Deck
// @namespace    https://solanascape.online/
// @version      2.2.0
// @description  Unified OSRS-style overlays, alerts, tile indicators, and native menu swaps for Solanascape.
// @author       Solanascape Deck contributors
// @match        https://solanascape.online/play*
// @homepageURL  https://github.com/flashbits-eth/solanascape-deck
// @supportURL   https://github.com/flashbits-eth/solanascape-deck/issues
// @downloadURL  https://raw.githubusercontent.com/flashbits-eth/solanascape-deck/main/dist/solanascape-deck.user.js
// @updateURL    https://raw.githubusercontent.com/flashbits-eth/solanascape-deck/main/dist/solanascape-deck.user.js
// @run-at       document-start
// @noframes
// @grant        unsafeWindow
// ==/UserScript==
"use strict";
(() => {
  // src/experience.ts
  var MAX_LEVEL = 99;
  var XP_FOR_LEVEL = (() => {
    const thresholds = new Array(MAX_LEVEL + 1).fill(0);
    let points = 0;
    thresholds[1] = 0;
    for (let level = 1; level < MAX_LEVEL; level += 1) {
      points += Math.floor(level + 300 * 2 ** (level / 7));
      thresholds[level + 1] = Math.floor(points / 4);
    }
    return Object.freeze(thresholds);
  })();
  function levelForXp(xp) {
    const safeXp = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
    for (let level = MAX_LEVEL; level >= 2; level -= 1) {
      if (safeXp >= (XP_FOR_LEVEL[level] ?? 0)) return level;
    }
    return 1;
  }
  function xpProgress(xp, level) {
    const normalizedLevel = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
    const currentLevelXp = XP_FOR_LEVEL[normalizedLevel] ?? 0;
    if (normalizedLevel >= MAX_LEVEL) {
      return { currentLevelXp, nextLevelXp: null, remaining: 0, ratio: 1 };
    }
    const nextLevelXp = XP_FOR_LEVEL[normalizedLevel + 1] ?? currentLevelXp;
    const span = Math.max(1, nextLevelXp - currentLevelXp);
    return {
      currentLevelXp,
      nextLevelXp,
      remaining: Math.max(0, nextLevelXp - xp),
      ratio: Math.max(0, Math.min(1, (xp - currentLevelXp) / span))
    };
  }

  // src/mapping.ts
  var CURRENT_FIELD_MAP = Object.freeze({
    build: "client.js?v=20260702c",
    skills: { xp: "Fz", current: "Dz", base: "Ez" },
    session: { ingame: "Xr" },
    player: {
      local: "tz",
      localX: "x",
      localZ: "z",
      level: "level",
      name: "name",
      combatLevel: "Vo",
      baseX: "ev",
      baseZ: "fv",
      plane: "xn",
      animation: "so",
      targetIndex: "mo",
      pathX: "Mo",
      pathZ: "No",
      pathLength: "Lo"
    },
    npcs: {
      table: "Nu",
      activeIndices: "Pu",
      activeCount: "Ou",
      type: "type",
      id: "id",
      name: "name",
      healthRatio: "eo",
      healthScale: "fo"
    },
    players: { table: "mz", activeIndices: "oz", activeCount: "nz" },
    groundItems: { grid: "zz", sentinel: "Y", next: "next", id: "id", count: "count" },
    chat: { types: "DA", senders: "EA", messages: "FA" },
    combat: { state: "lA", attackStyleIndex: 43 },
    menu: { count: "Jz", options: "Tz", opcodes: "Rz", identifiers: "Sz" },
    scene: {
      graph: "nv",
      tag: "Jk",
      info: "Kk",
      getters: { wall: "Rm", wallDecoration: "Sm", object: "Tm", groundDecoration: "Um" }
    },
    projection: {
      heights: "jm",
      renderFlags: "yn",
      cameraX: "xy",
      cameraHeight: "yy",
      cameraZ: "zy",
      yaw: "By",
      pitch: "Ay",
      mouseX: "Lc",
      mouseY: "Mc"
    }
  });
  function isRecord(value) {
    return typeof value === "object" && value !== null;
  }
  function getField(target, name) {
    if (!isRecord(target)) return void 0;
    return Reflect.get(target, name);
  }
  function getOwnDataField(target, name) {
    const descriptor = Object.getOwnPropertyDescriptor(target, name);
    return descriptor && "value" in descriptor ? descriptor.value : void 0;
  }
  function readFiniteNumbers(value, expectedLength) {
    if (value === null || value === void 0 || typeof value === "string") return null;
    const length = getArrayLikeLength(value);
    if (length === null || expectedLength !== void 0 && length !== expectedLength) return null;
    const result = [];
    for (let index = 0; index < length; index += 1) {
      const item = Reflect.get(Object(value), String(index));
      if (typeof item !== "number" || !Number.isFinite(item)) return null;
      result.push(item);
    }
    return result;
  }
  function getArrayLikeLength(value) {
    if (value === null || value === void 0 || typeof value === "function" || typeof value === "string") return null;
    const length = Reflect.get(Object(value), "length");
    return typeof length === "number" && Number.isInteger(length) && length >= 0 ? length : null;
  }
  function isXpArray(values) {
    return values.every((value) => Number.isInteger(value) && value >= 0 && value <= 1e9);
  }
  function isLevelArray(values) {
    return values.every((value) => Number.isInteger(value) && value >= 0 && value <= 255);
  }
  function baseMatchesXp(xp, base) {
    let matches = 0;
    for (let index = 0; index < xp.length; index += 1) {
      const level = base[index] ?? 0;
      if (level === 0 && (xp[index] ?? 0) === 0) matches += 1;
      else if (levelForXp(xp[index] ?? 0) === level) matches += 1;
    }
    return matches;
  }
  function currentMatchesBase(current, base) {
    let score = 0;
    for (let index = 0; index < current.length; index += 1) {
      const difference = Math.abs((current[index] ?? 0) - (base[index] ?? 0));
      if (difference === 0) score += 2;
      else if (difference <= 20) score += 1;
    }
    return score;
  }
  function validateTriplet(xp, current, base) {
    if (!xp || !current || !base || !isXpArray(xp) || !isLevelArray(current) || !isLevelArray(base)) return false;
    return baseMatchesXp(xp, base) >= 18;
  }
  function resolveSkillFields(client, mapping = CURRENT_FIELD_MAP) {
    const failures = [];
    if (!isRecord(client)) {
      return { resolved: null, failures: ["gameClient is not available"], candidates: [] };
    }
    const mappedXp = readFiniteNumbers(getField(client, mapping.skills.xp), 21);
    const mappedCurrent = readFiniteNumbers(getField(client, mapping.skills.current), 21);
    const mappedBase = readFiniteNumbers(getField(client, mapping.skills.base), 21);
    if (validateTriplet(mappedXp, mappedCurrent, mappedBase)) {
      return {
        resolved: {
          xpField: mapping.skills.xp,
          currentField: mapping.skills.current,
          baseField: mapping.skills.base,
          source: "mapped-field",
          xp: mappedXp ?? [],
          current: mappedCurrent ?? [],
          base: mappedBase ?? []
        },
        failures,
        candidates: [mapping.skills.xp, mapping.skills.current, mapping.skills.base]
      };
    }
    failures.push("Configured skill fields failed their 21-skill shape or XP/level validation.");
    const numericArrays = Reflect.ownKeys(client).filter((key) => typeof key === "string").map((name) => ({ name, values: readFiniteNumbers(getOwnDataField(client, name), 21) })).filter((entry) => entry.values !== null);
    const xpCandidates = numericArrays.filter((entry) => isXpArray(entry.values));
    const levelCandidates = numericArrays.filter((entry) => isLevelArray(entry.values));
    const matches = [];
    for (const xp of xpCandidates) {
      for (const base of levelCandidates) {
        if (xp.name === base.name) continue;
        const baseScore = baseMatchesXp(xp.values, base.values);
        if (baseScore < 18) continue;
        for (const current of levelCandidates) {
          if (current.name === xp.name || current.name === base.name) continue;
          matches.push({ xp, current, base, score: baseScore * 3 + currentMatchesBase(current.values, base.values) });
        }
      }
    }
    matches.sort((left, right) => right.score - left.score);
    const best = matches[0];
    const second = matches[1];
    if (!best || second && best.score === second.score) {
      failures.push(best ? "Adaptive skill mapping was ambiguous." : "No adaptive skill mapping satisfied validation.");
      return { resolved: null, failures, candidates: numericArrays.map((entry) => entry.name) };
    }
    return {
      resolved: {
        xpField: best.xp.name,
        currentField: best.current.name,
        baseField: best.base.name,
        source: "adaptive",
        xp: best.xp.values,
        current: best.current.values,
        base: best.base.values
      },
      failures,
      candidates: numericArrays.map((entry) => entry.name)
    };
  }

  // src/types.ts
  var SKILL_NAMES = Object.freeze([
    "Attack",
    "Defence",
    "Strength",
    "Hitpoints",
    "Ranged",
    "Prayer",
    "Magic",
    "Cooking",
    "Woodcutting",
    "Fletching",
    "Fishing",
    "Firemaking",
    "Crafting",
    "Smithing",
    "Mining",
    "Herblore",
    "Agility",
    "Thieving",
    "Slayer",
    "Farming",
    "Runecraft"
  ]);
  var ATTACK_STYLE_NAMES = Object.freeze(["Chop", "Slash", "Lunge", "Block"]);

  // src/item-name-data.ts
  var STANDARD_ITEM_NAMES = Object.freeze({
    "2": "Steel cannonball",
    "6": "Cannon base",
    "8": "Cannon stand",
    "10": "Cannon barrels",
    "12": "Cannon furnace",
    "28": "Insect repellent",
    "30": "Bucket of wax",
    "36": "Candle",
    "39": "Bronze arrowtips",
    "40": "Iron arrowtips",
    "41": "Steel arrowtips",
    "42": "Mithril arrowtips",
    "43": "Adamant arrowtips",
    "44": "Rune arrowtips",
    "45": "Opal bolt tips",
    "46": "Pearl bolt tips",
    "47": "Barb bolttips",
    "48": "Longbow (u)",
    "50": "Shortbow (u)",
    "52": "Arrow shaft",
    "53": "Headless arrow",
    "54": "Oak shortbow (u)",
    "56": "Oak longbow (u)",
    "58": "Willow longbow (u)",
    "60": "Willow shortbow (u)",
    "62": "Maple longbow (u)",
    "64": "Maple shortbow (u)",
    "66": "Yew longbow (u)",
    "68": "Yew shortbow (u)",
    "70": "Magic longbow (u)",
    "72": "Magic shortbow (u)",
    "91": "Guam potion (unf)",
    "93": "Marrentill potion (unf)",
    "95": "Tarromin potion (unf)",
    "97": "Harralander potion (unf)",
    "99": "Ranarr potion (unf)",
    "101": "Irit potion (unf)",
    "103": "Avantoe potion (unf)",
    "105": "Kwuarm potion (unf)",
    "107": "Cadantine potion (unf)",
    "109": "Dwarf weed potion (unf)",
    "111": "Torstol potion (unf)",
    "113": "Strength potion(4)",
    "115": "Strength potion(3)",
    "117": "Strength potion(2)",
    "119": "Strength potion(1)",
    "121": "Attack potion(3)",
    "123": "Attack potion(2)",
    "125": "Attack potion(1)",
    "127": "Restore potion(3)",
    "129": "Restore potion(2)",
    "131": "Restore potion(1)",
    "133": "Defence potion(3)",
    "135": "Defence potion(2)",
    "137": "Defence potion(1)",
    "139": "Prayer potion(3)",
    "141": "Prayer potion(2)",
    "143": "Prayer potion(1)",
    "145": "Super attack(3)",
    "147": "Super attack(2)",
    "149": "Super attack(1)",
    "151": "Fishing potion(3)",
    "153": "Fishing potion(2)",
    "155": "Fishing potion(1)",
    "157": "Super strength(3)",
    "159": "Super strength(2)",
    "161": "Super strength(1)",
    "163": "Super defence(3)",
    "165": "Super defence(2)",
    "167": "Super defence(1)",
    "169": "Ranging potion(3)",
    "171": "Ranging potion(2)",
    "173": "Ranging potion(1)",
    "175": "Antipoison(3)",
    "177": "Antipoison(2)",
    "179": "Antipoison(1)",
    "181": "Superantipoison(3)",
    "183": "Superantipoison(2)",
    "185": "Superantipoison(1)",
    "187": "Weapon poison",
    "189": "Zamorak brew(3)",
    "191": "Zamorak brew(2)",
    "193": "Zamorak brew(1)",
    "197": "Poison chalice",
    "199": "Grimy guam leaf",
    "201": "Grimy marrentill",
    "203": "Grimy tarromin",
    "205": "Grimy harralander",
    "207": "Grimy ranarr weed",
    "209": "Grimy irit leaf",
    "211": "Grimy avantoe",
    "213": "Grimy kwuarm",
    "215": "Grimy cadantine",
    "217": "Grimy dwarf weed",
    "219": "Grimy torstol",
    "221": "Eye of newt",
    "223": "Red spiders' eggs",
    "225": "Limpwurt root",
    "227": "Vial of water",
    "229": "Vial",
    "231": "Snape grass",
    "233": "Pestle and mortar",
    "235": "Unicorn horn dust",
    "237": "Unicorn horn",
    "239": "White berries",
    "241": "Dragon scale dust",
    "243": "Blue dragon scale",
    "245": "Wine of zamorak",
    "247": "Jangerberries",
    "249": "Guam leaf",
    "251": "Marrentill",
    "253": "Tarromin",
    "255": "Harralander",
    "257": "Ranarr weed",
    "259": "Irit leaf",
    "261": "Avantoe",
    "263": "Kwuarm",
    "265": "Cadantine",
    "267": "Dwarf weed",
    "269": "Torstol",
    "272": "Fish food",
    "273": "Poison (item)",
    "288": "Goblin mail",
    "299": "Mithril seeds",
    "301": "Lobster pot",
    "303": "Small fishing net",
    "305": "Big fishing net",
    "307": "Fishing rod",
    "309": "Fly fishing rod",
    "311": "Harpoon",
    "313": "Fishing bait",
    "314": "Feather",
    "315": "Shrimps",
    "317": "Raw shrimps",
    "319": "Anchovies",
    "321": "Raw anchovies",
    "325": "Sardine",
    "327": "Raw sardine",
    "329": "Salmon",
    "331": "Raw salmon",
    "333": "Trout",
    "335": "Raw trout",
    "339": "Cod",
    "341": "Raw cod",
    "345": "Raw herring",
    "347": "Herring",
    "349": "Raw pike",
    "351": "Pike",
    "353": "Raw mackerel",
    "355": "Mackerel",
    "359": "Raw tuna",
    "361": "Tuna",
    "363": "Raw bass",
    "365": "Bass",
    "371": "Raw swordfish",
    "373": "Swordfish",
    "377": "Raw lobster",
    "379": "Lobster",
    "383": "Raw shark",
    "385": "Shark",
    "389": "Raw manta ray",
    "391": "Manta ray",
    "395": "Raw sea turtle",
    "397": "Sea turtle",
    "401": "Seaweed",
    "403": "Edible seaweed",
    "405": "Casket",
    "407": "Oyster",
    "411": "Oyster pearl",
    "413": "Oyster pearls",
    "426": "Priest gown (top)",
    "428": "Priest gown (bottom)",
    "434": "Clay",
    "436": "Copper ore",
    "438": "Tin ore",
    "440": "Iron ore",
    "442": "Silver ore",
    "444": "Gold ore",
    "447": "Mithril ore",
    "449": "Adamantite ore",
    "451": "Runite ore",
    "453": "Coal",
    "464": "Strange fruit",
    "526": "Bones",
    "528": "Burnt bones",
    "530": "Bat bones",
    "532": "Big bones",
    "534": "Babydragon bones",
    "536": "Dragon bones",
    "538": "Druid's robe",
    "540": "Druid's robe top",
    "542": "Monk's robe",
    "544": "Monk's robe top",
    "546": "Shade robe top",
    "548": "Shade robe",
    "554": "Fire rune",
    "555": "Water rune",
    "556": "Air rune",
    "557": "Earth rune",
    "558": "Mind rune",
    "559": "Body rune",
    "560": "Death rune",
    "561": "Nature rune",
    "562": "Chaos rune",
    "563": "Law rune",
    "564": "Cosmic rune",
    "565": "Blood rune",
    "566": "Soul rune",
    "567": "Unpowered orb",
    "569": "Fire orb",
    "571": "Water orb",
    "573": "Air orb",
    "575": "Earth orb",
    "577": "Blue wizard robe",
    "579": "Blue wizard hat",
    "581": "Black robe",
    "590": "Tinderbox",
    "592": "Ashes",
    "596": "Unlit torch",
    "621": "Ship ticket",
    "626": "Pink boots",
    "628": "Green boots",
    "630": "Blue boots",
    "632": "Cream boots",
    "634": "Turquoise boots",
    "636": "Pink robe top",
    "638": "Green robe top",
    "640": "Blue robe top",
    "642": "Cream robe top",
    "644": "Turquoise robe top",
    "646": "Pink robe bottoms",
    "648": "Green robe bottoms",
    "650": "Blue robe bottoms",
    "652": "Cream robe bottoms",
    "654": "Turquoise robe bottoms",
    "656": "Pink hat",
    "658": "Green hat",
    "660": "Blue hat",
    "662": "Cream hat",
    "664": "Turquoise hat",
    "751": "Gnomeball",
    "753": "Cadava berries",
    "800": "Bronze thrownaxe",
    "801": "Iron thrownaxe",
    "802": "Steel thrownaxe",
    "803": "Mithril thrownaxe",
    "804": "Adamant thrownaxe",
    "805": "Rune thrownaxe",
    "806": "Bronze dart",
    "807": "Iron dart",
    "808": "Steel dart",
    "809": "Mithril dart",
    "810": "Adamant dart",
    "811": "Rune dart",
    "812": "Bronze dart(p)",
    "813": "Iron dart (p)",
    "814": "Steel dart(p)",
    "815": "Mithril dart(p)",
    "816": "Adamant dart(p)",
    "817": "Rune dart(p)",
    "819": "Bronze dart tip",
    "820": "Iron dart tip",
    "821": "Steel dart tip",
    "822": "Mithril dart tip",
    "823": "Adamant dart tip",
    "824": "Rune dart tip",
    "825": "Bronze javelin",
    "826": "Iron javelin",
    "827": "Steel javelin",
    "828": "Mithril javelin",
    "829": "Adamant javelin",
    "830": "Rune javelin",
    "831": "Bronze javelin(p)",
    "832": "Iron javelin(p)",
    "833": "Steel javelin(p)",
    "834": "Mithril javelin(p)",
    "835": "Adamant javelin(p)",
    "836": "Rune javelin(p)",
    "837": "Crossbow",
    "839": "Longbow",
    "841": "Shortbow",
    "843": "Oak shortbow",
    "845": "Oak longbow",
    "847": "Willow longbow",
    "849": "Willow shortbow",
    "851": "Maple longbow",
    "853": "Maple shortbow",
    "855": "Yew longbow",
    "857": "Yew shortbow",
    "859": "Magic longbow",
    "861": "Magic shortbow",
    "863": "Iron knife",
    "864": "Bronze knife",
    "865": "Steel knife",
    "866": "Mithril knife",
    "867": "Adamant knife",
    "868": "Rune knife",
    "869": "Black knife",
    "870": "Bronze knife(p)",
    "871": "Iron knife(p)",
    "872": "Steel knife(p)",
    "873": "Mithril knife(p)",
    "874": "Black knife(p)",
    "875": "Adamant knife(p)",
    "876": "Rune knife(p)",
    "877": "Bronze bolts",
    "878": "Bronze bolts (p)",
    "879": "Opal bolts",
    "880": "Pearl bolts",
    "881": "Barbed bolts",
    "882": "Bronze arrow",
    "883": "Bronze arrow(p)",
    "884": "Iron arrow",
    "885": "Iron arrow(p)",
    "886": "Steel arrow",
    "887": "Steel arrow(p)",
    "888": "Mithril arrow",
    "889": "Mithril arrow(p)",
    "890": "Adamant arrow",
    "891": "Adamant arrow(p)",
    "892": "Rune arrow",
    "893": "Rune arrow(p)",
    "946": "Knife",
    "948": "Bear fur",
    "950": "Silk",
    "952": "Spade",
    "954": "Rope",
    "958": "Grey wolf fur",
    "960": "Plank",
    "962": "Christmas cracker",
    "970": "Papyrus",
    "973": "Charcoal",
    "975": "Machete",
    "981": "Disk of returning",
    "983": "Brass key",
    "985": "Tooth half of key",
    "987": "Loop half of key",
    "989": "Crystal key",
    "991": "Muddy key",
    "993": "Sinister key",
    "1005": "White apron",
    "1007": "Red cape",
    "1009": "Brass necklace",
    "1011": "Blue skirt",
    "1013": "Pink skirt",
    "1015": "Black skirt",
    "1017": "Wizard hat",
    "1019": "Black cape",
    "1021": "Blue cape",
    "1023": "Yellow cape",
    "1025": "Right eye patch",
    "1027": "Green cape",
    "1029": "Purple cape",
    "1031": "Orange cape",
    "1033": "Zamorak monk bottom",
    "1035": "Zamorak monk top",
    "1038": "Red partyhat",
    "1040": "Yellow partyhat",
    "1042": "Blue partyhat",
    "1044": "Green partyhat",
    "1046": "Purple partyhat",
    "1048": "White partyhat",
    "1050": "Santa hat",
    "1053": "Green halloween mask",
    "1055": "Blue halloween mask",
    "1057": "Red halloween mask",
    "1059": "Leather gloves",
    "1061": "Leather boots",
    "1063": "Leather vambraces",
    "1065": "Green d'hide vambraces",
    "1067": "Iron platelegs",
    "1069": "Steel platelegs",
    "1071": "Mithril platelegs",
    "1073": "Adamant platelegs",
    "1075": "Bronze platelegs",
    "1077": "Black platelegs",
    "1079": "Rune platelegs",
    "1081": "Iron plateskirt",
    "1083": "Steel plateskirt",
    "1085": "Mithril plateskirt",
    "1087": "Bronze plateskirt",
    "1089": "Black plateskirt",
    "1091": "Adamant plateskirt",
    "1093": "Rune plateskirt",
    "1095": "Leather chaps",
    "1097": "Studded chaps",
    "1099": "Green d'hide chaps",
    "1101": "Iron chainbody",
    "1103": "Bronze chainbody",
    "1105": "Steel chainbody",
    "1107": "Black chainbody",
    "1109": "Mithril chainbody",
    "1111": "Adamant chainbody",
    "1113": "Rune chainbody",
    "1115": "Iron platebody",
    "1117": "Bronze platebody",
    "1119": "Steel platebody",
    "1121": "Mithril platebody",
    "1123": "Adamant platebody",
    "1125": "Black platebody",
    "1127": "Rune platebody",
    "1129": "Leather body",
    "1131": "Hardleather body",
    "1133": "Studded body",
    "1135": "Green d'hide body",
    "1137": "Iron med helm",
    "1139": "Bronze med helm",
    "1141": "Steel med helm",
    "1143": "Mithril med helm",
    "1145": "Adamant med helm",
    "1147": "Rune med helm",
    "1149": "Dragon med helm",
    "1151": "Black med helm",
    "1153": "Iron full helm",
    "1155": "Bronze full helm",
    "1157": "Steel full helm",
    "1159": "Mithril full helm",
    "1161": "Adamant full helm",
    "1163": "Rune full helm",
    "1165": "Black full helm",
    "1167": "Leather cowl",
    "1169": "Coif",
    "1171": "Wooden shield",
    "1173": "Bronze sq shield",
    "1175": "Iron sq shield",
    "1177": "Steel sq shield",
    "1179": "Black sq shield",
    "1181": "Mithril sq shield",
    "1183": "Adamant sq shield",
    "1185": "Rune sq shield",
    "1187": "Dragon sq shield",
    "1189": "Bronze kiteshield",
    "1191": "Iron kiteshield",
    "1193": "Steel kiteshield",
    "1195": "Black kiteshield",
    "1197": "Mithril kiteshield",
    "1199": "Adamant kiteshield",
    "1201": "Rune kiteshield",
    "1203": "Iron dagger",
    "1205": "Bronze dagger",
    "1207": "Steel dagger",
    "1209": "Mithril dagger",
    "1211": "Adamant dagger",
    "1213": "Rune dagger",
    "1215": "Dragon dagger",
    "1217": "Black dagger",
    "1219": "Iron dagger(p)",
    "1221": "Bronze dagger(p)",
    "1223": "Steel dagger(p)",
    "1225": "Mithril dagger(p)",
    "1227": "Adamant dagger(p)",
    "1229": "Rune dagger(p)",
    "1231": "Dragon dagger(p)",
    "1233": "Black dagger(p)",
    "1237": "Bronze spear",
    "1239": "Iron spear",
    "1241": "Steel spear",
    "1243": "Mithril spear",
    "1245": "Adamant spear",
    "1247": "Rune spear",
    "1249": "Dragon spear",
    "1251": "Bronze spear(p)",
    "1253": "Iron spear(p)",
    "1255": "Steel spear(p)",
    "1257": "Mithril spear(p)",
    "1259": "Adamant spear(p)",
    "1261": "Rune spear(p)",
    "1263": "Dragon spear(p)",
    "1265": "Bronze pickaxe",
    "1267": "Iron pickaxe",
    "1269": "Steel pickaxe",
    "1271": "Adamant pickaxe",
    "1273": "Mithril pickaxe",
    "1275": "Rune pickaxe",
    "1277": "Bronze sword",
    "1279": "Iron sword",
    "1281": "Steel sword",
    "1283": "Black sword",
    "1285": "Mithril sword",
    "1287": "Adamant sword",
    "1289": "Rune sword",
    "1291": "Bronze longsword",
    "1293": "Iron longsword",
    "1295": "Steel longsword",
    "1297": "Black longsword",
    "1299": "Mithril longsword",
    "1301": "Adamant longsword",
    "1303": "Rune longsword",
    "1305": "Dragon longsword",
    "1307": "Bronze 2h sword",
    "1309": "Iron 2h sword",
    "1311": "Steel 2h sword",
    "1313": "Black 2h sword",
    "1315": "Mithril 2h sword",
    "1317": "Adamant 2h sword",
    "1319": "Rune 2h sword",
    "1321": "Bronze scimitar",
    "1323": "Iron scimitar",
    "1325": "Steel scimitar",
    "1327": "Black scimitar",
    "1329": "Mithril scimitar",
    "1331": "Adamant scimitar",
    "1333": "Rune scimitar",
    "1335": "Iron warhammer",
    "1337": "Bronze warhammer",
    "1339": "Steel warhammer",
    "1341": "Black warhammer",
    "1343": "Mithril warhammer",
    "1345": "Adamant warhammer",
    "1347": "Rune warhammer",
    "1349": "Iron axe",
    "1351": "Bronze axe",
    "1353": "Steel axe",
    "1355": "Mithril axe",
    "1357": "Adamant axe",
    "1359": "Rune axe",
    "1361": "Black axe",
    "1363": "Iron battleaxe",
    "1365": "Steel battleaxe",
    "1367": "Black battleaxe",
    "1369": "Mithril battleaxe",
    "1371": "Adamant battleaxe",
    "1373": "Rune battleaxe",
    "1375": "Bronze battleaxe",
    "1377": "Dragon battleaxe",
    "1379": "Staff",
    "1381": "Staff of air",
    "1383": "Staff of water",
    "1385": "Staff of earth",
    "1387": "Staff of fire",
    "1389": "Magic staff",
    "1391": "Battlestaff",
    "1393": "Fire battlestaff",
    "1395": "Water battlestaff",
    "1397": "Air battlestaff",
    "1399": "Earth battlestaff",
    "1401": "Mystic fire staff",
    "1403": "Mystic water staff",
    "1405": "Mystic air staff",
    "1407": "Mystic earth staff",
    "1420": "Iron mace",
    "1422": "Bronze mace",
    "1424": "Steel mace",
    "1426": "Black mace",
    "1428": "Mithril mace",
    "1430": "Adamant mace",
    "1432": "Rune mace",
    "1434": "Dragon mace",
    "1436": "Rune essence",
    "1438": "Air talisman",
    "1440": "Earth talisman",
    "1442": "Fire talisman",
    "1444": "Water talisman",
    "1446": "Body talisman",
    "1448": "Mind talisman",
    "1450": "Blood talisman",
    "1452": "Chaos talisman",
    "1454": "Cosmic talisman",
    "1456": "Death talisman",
    "1462": "Nature talisman",
    "1464": "Archery ticket",
    "1470": "Red bead",
    "1472": "Yellow bead",
    "1474": "Black bead",
    "1476": "White bead",
    "1478": "Amulet of accuracy",
    "1511": "Logs",
    "1513": "Magic logs",
    "1515": "Yew logs",
    "1517": "Maple logs",
    "1519": "Willow logs",
    "1521": "Oak logs",
    "1523": "Lockpick",
    "1539": "Steel nails",
    "1540": "Anti-dragon shield",
    "1550": "Garlic",
    "1552": "Seasoned sardine",
    "1573": "Doogle leaves",
    "1592": "Ring mould",
    "1595": "Amulet mould",
    "1597": "Necklace mould",
    "1599": "Holy mould",
    "1601": "Diamond",
    "1603": "Ruby",
    "1605": "Emerald",
    "1607": "Sapphire",
    "1609": "Opal",
    "1611": "Jade",
    "1613": "Red topaz",
    "1615": "Dragonstone",
    "1617": "Uncut diamond",
    "1619": "Uncut ruby",
    "1621": "Uncut emerald",
    "1623": "Uncut sapphire",
    "1625": "Uncut opal",
    "1627": "Uncut jade",
    "1629": "Uncut red topaz",
    "1631": "Uncut dragonstone",
    "1635": "Gold ring",
    "1637": "Sapphire ring",
    "1639": "Emerald ring",
    "1641": "Ruby ring",
    "1643": "Diamond ring",
    "1645": "Dragonstone ring",
    "1654": "Gold necklace",
    "1656": "Sapphire necklace",
    "1658": "Emerald necklace",
    "1660": "Ruby necklace",
    "1662": "Diamond necklace",
    "1664": "Dragon necklace",
    "1673": "Gold amulet (u)",
    "1675": "Sapphire amulet (u)",
    "1677": "Emerald amulet (u)",
    "1679": "Ruby amulet (u)",
    "1681": "Diamond amulet (u)",
    "1683": "Dragonstone amulet (u)",
    "1692": "Gold amulet",
    "1694": "Sapphire amulet",
    "1696": "Emerald amulet",
    "1698": "Ruby amulet",
    "1700": "Diamond amulet",
    "1702": "Dragonstone amulet",
    "1704": "Amulet of glory",
    "1712": "Amulet of glory(4)",
    "1714": "Unstrung symbol",
    "1716": "Unblessed symbol",
    "1718": "Holy symbol",
    "1720": "Unstrung emblem",
    "1722": "Unpowered symbol",
    "1724": "Unholy symbol",
    "1725": "Amulet of strength",
    "1727": "Amulet of magic",
    "1729": "Amulet of defence",
    "1731": "Amulet of power",
    "1733": "Needle",
    "1734": "Thread",
    "1735": "Shears",
    "1737": "Wool",
    "1739": "Cowhide",
    "1741": "Leather",
    "1743": "Hard leather",
    "1745": "Green dragon leather",
    "1747": "Black dragonhide",
    "1749": "Red dragonhide",
    "1751": "Blue dragonhide",
    "1753": "Green dragonhide",
    "1755": "Chisel",
    "1757": "Brown apron",
    "1759": "Ball of wool",
    "1761": "Soft clay",
    "1763": "Red dye",
    "1765": "Yellow dye",
    "1767": "Blue dye",
    "1769": "Orange dye",
    "1771": "Green dye",
    "1773": "Purple dye",
    "1775": "Molten glass",
    "1777": "Bow string",
    "1779": "Flax",
    "1781": "Soda ash",
    "1783": "Bucket of sand",
    "1785": "Glassblowing pipe",
    "1787": "Unfired pot",
    "1789": "Unfired pie dish",
    "1791": "Unfired bowl",
    "1793": "Woad leaf",
    "1794": "Bronze wire",
    "1823": "Waterskin(4)",
    "1831": "Waterskin(0)",
    "1833": "Desert shirt",
    "1835": "Desert robe",
    "1837": "Desert boots",
    "1854": "Shantay pass (item)",
    "1859": "Raw ugthanki meat",
    "1861": "Ugthanki meat",
    "1865": "Pitta bread",
    "1869": "Chopped tomato",
    "1871": "Chopped onion",
    "1873": "Chopped ugthanki",
    "1875": "Onion & tomato",
    "1877": "Ugthanki & onion",
    "1879": "Ugthanki & tomato",
    "1881": "Kebab mix",
    "1885": "Ugthanki kebab",
    "1887": "Cake tin",
    "1891": "Cake",
    "1897": "Chocolate cake",
    "1905": "Asgarnian ale",
    "1907": "Wizard's mind bomb",
    "1909": "Greenman's ale",
    "1911": "Dragon bitter",
    "1913": "Dwarven stout",
    "1915": "Grog",
    "1917": "Beer",
    "1919": "Beer glass",
    "1921": "Bowl of water",
    "1923": "Bowl",
    "1925": "Bucket",
    "1927": "Bucket of milk",
    "1929": "Bucket of water",
    "1931": "Pot",
    "1933": "Pot of flour",
    "1935": "Jug",
    "1937": "Jug of water",
    "1939": "Swamp tar",
    "1941": "Swamp paste",
    "1942": "Potato",
    "1944": "Egg",
    "1947": "Grain",
    "1949": "Chef's hat",
    "1951": "Redberries",
    "1953": "Pastry dough",
    "1955": "Cooking apple",
    "1957": "Onion",
    "1959": "Pumpkin",
    "1961": "Easter egg",
    "1963": "Banana",
    "1965": "Cabbage",
    "1969": "Spinach roll",
    "1971": "Kebab",
    "1973": "Chocolate bar",
    "1975": "Chocolate dust",
    "1978": "Cup of tea",
    "1980": "Empty cup",
    "1982": "Tomato",
    "1985": "Cheese",
    "1987": "Grapes",
    "1989": "Half full wine jug",
    "1993": "Jug of wine",
    "2003": "Stew",
    "2007": "Spice",
    "2011": "Curry",
    "2015": "Vodka",
    "2017": "Whisky",
    "2019": "Gin",
    "2021": "Brandy",
    "2023": "Cocktail guide",
    "2025": "Cocktail shaker",
    "2026": "Cocktail glass",
    "2028": "Premade blurb' sp.",
    "2030": "Premade choc s'dy",
    "2032": "Premade dr' dragon",
    "2034": "Premade fr' blast",
    "2036": "Premade p' punch",
    "2038": "Premade sgg",
    "2040": "Premade wiz blz'd",
    "2048": "Pineapple punch",
    "2054": "Wizard blizzard",
    "2064": "Blurberry special",
    "2074": "Choc saturday",
    "2080": "Short green guy",
    "2084": "Fruit blast",
    "2092": "Drunk dragon",
    "2102": "Lemon",
    "2104": "Lemon chunks",
    "2106": "Lemon slices",
    "2108": "Orange",
    "2110": "Orange chunks",
    "2112": "Orange slices",
    "2114": "Pineapple",
    "2116": "Pineapple chunks",
    "2118": "Pineapple ring",
    "2120": "Lime",
    "2122": "Lime chunks",
    "2124": "Lime slices",
    "2126": "Dwellberries",
    "2128": "Equa leaves",
    "2130": "Pot of cream",
    "2132": "Raw beef",
    "2134": "Raw rat meat",
    "2136": "Raw bear meat",
    "2138": "Raw chicken",
    "2140": "Cooked chicken",
    "2142": "Cooked meat",
    "2150": "Swamp toad (item)",
    "2152": "Toad's legs",
    "2162": "King worm",
    "2164": "Batta tin",
    "2165": "Crunchy tray",
    "2166": "Gnomebowl mould",
    "2167": "Gianne's cook book",
    "2169": "Gnome spice",
    "2171": "Gianne dough",
    "2185": "Chocolate bomb",
    "2187": "Tangled toad's legs",
    "2191": "Worm hole",
    "2195": "Veg ball",
    "2203": "Rock-climbing boots",
    "2205": "Worm crunchies",
    "2209": "Chocchip crunchies",
    "2213": "Spicy crunchies",
    "2217": "Toad crunchies",
    "2219": "Premade w'm batta",
    "2221": "Premade t'd batta",
    "2223": "Premade c+t batta",
    "2225": "Premade fr't batta",
    "2227": "Premade veg batta",
    "2229": "Premade choc bomb",
    "2231": "Premade ttl",
    "2233": "Premade worm hole",
    "2235": "Premade veg ball",
    "2237": "Premade w'm crun'",
    "2239": "Premade ch' crunch",
    "2241": "Premade s'y crunch",
    "2243": "Premade t'd crunch",
    "2253": "Worm batta",
    "2255": "Toad batta",
    "2259": "Cheese+tom batta",
    "2277": "Fruit batta",
    "2281": "Vegetable batta",
    "2283": "Pizza base",
    "2289": "Plain pizza",
    "2293": "Meat pizza",
    "2297": "Anchovy pizza",
    "2301": "Pineapple pizza",
    "2307": "Bread dough",
    "2309": "Bread",
    "2313": "Pie dish",
    "2315": "Pie shell",
    "2317": "Uncooked apple pie",
    "2319": "Uncooked meat pie",
    "2321": "Uncooked berry pie",
    "2323": "Apple pie",
    "2325": "Redberry pie",
    "2327": "Meat pie",
    "2337": "Raw oomlie",
    "2341": "Wrapped oomlie",
    "2343": "Cooked oomlie wrap",
    "2347": "Hammer",
    "2349": "Bronze bar",
    "2351": "Iron bar",
    "2353": "Steel bar",
    "2355": "Silver bar",
    "2357": "Gold bar",
    "2359": "Mithril bar",
    "2361": "Adamantite bar",
    "2363": "Runite bar",
    "2366": "Shield left half",
    "2368": "Shield right half",
    "2370": "Steel studs",
    "2428": "Attack potion(4)",
    "2430": "Restore potion(4)",
    "2432": "Defence potion(4)",
    "2434": "Prayer potion(4)",
    "2436": "Super attack(4)",
    "2438": "Fishing potion(4)",
    "2440": "Super strength(4)",
    "2442": "Super defence(4)",
    "2444": "Ranging potion(4)",
    "2446": "Antipoison(4)",
    "2448": "Superantipoison(4)",
    "2450": "Zamorak brew(4)",
    "2452": "Antifire potion(4)",
    "2454": "Antifire potion(3)",
    "2456": "Antifire potion(2)",
    "2458": "Antifire potion(1)",
    "2460": "Assorted flowers",
    "2462": "Red flowers",
    "2464": "Blue flowers",
    "2466": "Yellow flowers",
    "2468": "Purple flowers",
    "2470": "Orange flowers",
    "2472": "Mixed flowers",
    "2474": "White flowers",
    "2476": "Black flowers",
    "2481": "Lantadyme",
    "2483": "Lantadyme potion (unf)",
    "2485": "Grimy lantadyme",
    "2487": "Blue d'hide vambraces",
    "2489": "Red d'hide vambraces",
    "2491": "Black d'hide vambraces",
    "2493": "Blue d'hide chaps",
    "2495": "Red d'hide chaps",
    "2497": "Black d'hide chaps",
    "2499": "Blue d'hide body",
    "2501": "Red d'hide body",
    "2503": "Black d'hide body",
    "2505": "Blue dragon leather",
    "2507": "Red dragon leather",
    "2509": "Black dragon leather",
    "2520": "Brown toy horsey",
    "2522": "White toy horsey",
    "2524": "Black toy horsey",
    "2526": "Grey toy horsey",
    "2550": "Ring of recoil",
    "2552": "Ring of dueling(8)",
    "2568": "Ring of forging",
    "2570": "Ring of life",
    "2572": "Ring of wealth",
    "2577": "Ranger boots",
    "2579": "Wizard boots",
    "2581": "Robin hood hat",
    "2583": "Black platebody (t)",
    "2585": "Black platelegs (t)",
    "2587": "Black full helm (t)",
    "2589": "Black kiteshield (t)",
    "2591": "Black platebody (g)",
    "2593": "Black platelegs (g)",
    "2595": "Black full helm (g)",
    "2597": "Black kiteshield (g)",
    "2599": "Adamant platebody (t)",
    "2601": "Adamant platelegs (t)",
    "2603": "Adamant kiteshield (t)",
    "2605": "Adamant full helm (t)",
    "2607": "Adamant platebody (g)",
    "2609": "Adamant platelegs (g)",
    "2611": "Adamant kiteshield (g)",
    "2613": "Adamant full helm (g)",
    "2615": "Rune platebody (g)",
    "2617": "Rune platelegs (g)",
    "2619": "Rune full helm (g)",
    "2621": "Rune kiteshield (g)",
    "2623": "Rune platebody (t)",
    "2625": "Rune platelegs (t)",
    "2627": "Rune full helm (t)",
    "2629": "Rune kiteshield (t)",
    "2631": "Highwayman mask",
    "2633": "Blue beret",
    "2635": "Black beret",
    "2637": "White beret",
    "2639": "Tan cavalier",
    "2641": "Dark cavalier",
    "2643": "Black cavalier",
    "2645": "Red headband",
    "2647": "Black headband",
    "2649": "Brown headband",
    "2651": "Pirate's hat",
    "2653": "Zamorak platebody",
    "2655": "Zamorak platelegs",
    "2657": "Zamorak full helm",
    "2659": "Zamorak kiteshield",
    "2661": "Saradomin platebody",
    "2663": "Saradomin platelegs",
    "2665": "Saradomin full helm",
    "2667": "Saradomin kiteshield",
    "2669": "Guthix platebody",
    "2671": "Guthix platelegs",
    "2673": "Guthix full helm",
    "2675": "Guthix kiteshield",
    "2859": "Wolf bones",
    "2861": "Wolfbone arrowtips",
    "2862": "Achey tree logs",
    "2864": "Ogre arrow shaft",
    "2865": "Flighted ogre arrow",
    "2866": "Ogre arrow",
    "2876": "Raw chompy",
    "2878": "Cooked chompy",
    "2890": "Elemental shield",
    "2894": "Grey boots",
    "2896": "Grey robe top",
    "2898": "Grey robe bottoms",
    "2900": "Grey hat",
    "2902": "Grey gloves",
    "2904": "Red boots",
    "2906": "Red robe top",
    "2908": "Red robe bottoms",
    "2910": "Red hat",
    "2912": "Red gloves",
    "2914": "Yellow boots",
    "2916": "Yellow robe top",
    "2918": "Yellow robe bottoms",
    "2920": "Yellow hat",
    "2922": "Yellow gloves",
    "2924": "Teal boots",
    "2926": "Teal robe top",
    "2928": "Teal robe bottoms",
    "2930": "Teal hat",
    "2932": "Teal gloves",
    "2934": "Purple boots",
    "2936": "Purple robe top",
    "2938": "Purple robe bottoms",
    "2940": "Purple hat",
    "2942": "Purple gloves",
    "2955": "Moonlight mead",
    "2961": "Silver sickle",
    "2970": "Mort myre fungus",
    "2972": "Mort myre stem",
    "2974": "Mort myre pear",
    "2976": "Sickle mould",
    "2997": "Pirate's hook",
    "2998": "Toadflax",
    "3000": "Snapdragon",
    "3002": "Toadflax potion (unf)",
    "3004": "Snapdragon potion (unf)",
    "3008": "Energy potion(4)",
    "3010": "Energy potion(3)",
    "3012": "Energy potion(2)",
    "3014": "Energy potion(1)",
    "3016": "Super energy(4)",
    "3018": "Super energy(3)",
    "3020": "Super energy(2)",
    "3022": "Super energy(1)",
    "3024": "Super restore(4)",
    "3026": "Super restore(3)",
    "3028": "Super restore(2)",
    "3030": "Super restore(1)",
    "3032": "Agility potion(4)",
    "3034": "Agility potion(3)",
    "3036": "Agility potion(2)",
    "3038": "Agility potion(1)",
    "3040": "Magic potion(4)",
    "3042": "Magic potion(3)",
    "3044": "Magic potion(2)",
    "3046": "Magic potion(1)",
    "3049": "Grimy toadflax",
    "3051": "Grimy snapdragon",
    "3053": "Lava battlestaff",
    "3054": "Mystic lava staff",
    "3093": "Black dart",
    "3094": "Black dart(p)",
    "3095": "Bronze claws",
    "3096": "Iron claws",
    "3097": "Steel claws",
    "3098": "Black claws",
    "3099": "Mithril claws",
    "3100": "Adamant claws",
    "3101": "Rune claws",
    "3105": "Climbing boots",
    "3107": "Spiked boots",
    "3122": "Granite shield",
    "3123": "Shaikahan bones",
    "3125": "Jogre bones",
    "3138": "Potato cactus",
    "3140": "Dragon chainbody",
    "3142": "Raw karambwan",
    "3144": "Cooked karambwan",
    "3157": "Karambwan vessel",
    "3159": "Karambwan vessel (baited)",
    "3162": "Sliced banana",
    "3183": "Monkey bones",
    "3188": "Cleaning cloth",
    "3190": "Bronze halberd",
    "3192": "Iron halberd",
    "3194": "Steel halberd",
    "3196": "Black halberd",
    "3198": "Mithril halberd",
    "3200": "Adamant halberd",
    "3202": "Rune halberd",
    "3204": "Dragon halberd",
    "3211": "Limestone",
    "3216": "Barrel",
    "3226": "Raw rabbit",
    "3228": "Cooked rabbit",
    "3239": "Bark",
    "3325": "Vampyre dust",
    "3327": "Myre snelm",
    "3329": "Blood'n'tar snelm",
    "3331": "Ochre snelm",
    "3333": "Bruise blue snelm",
    "3335": "Broken bark snelm",
    "3337": "Pointed myre snelm",
    "3339": "Pointed blood'n'tar snelm",
    "3341": "Pointed ochre snelm",
    "3343": "Pointed bruise blue snelm",
    "3345": "Blamish myre shell (round)",
    "3347": "Blamish red shell (round)",
    "3349": "Blamish ochre shell (round)",
    "3351": "Blamish blue shell (round)",
    "3353": "Blamish bark shell",
    "3355": "Blamish myre shell (pointed)",
    "3357": "Blamish red shell (pointed)",
    "3359": "Blamish ochre shell (pointed)",
    "3361": "Blamish blue shell (pointed)",
    "3363": "Thin snail",
    "3365": "Lean snail",
    "3367": "Fat snail",
    "3369": "Thin snail meat",
    "3371": "Lean snail meat",
    "3373": "Fat snail meat",
    "3379": "Raw slimy eel",
    "3381": "Cooked slimy eel",
    "3385": "Splitbark helm",
    "3387": "Splitbark body",
    "3389": "Splitbark legs",
    "3391": "Splitbark gauntlets",
    "3393": "Splitbark boots",
    "3396": "Loar remains",
    "3398": "Phrin remains",
    "3400": "Riyl remains",
    "3402": "Asyn remains",
    "3404": "Fiyr remains",
    "3406": "Unfinished potion",
    "3408": "Serum 207 (4)",
    "3410": "Serum 207 (3)",
    "3412": "Serum 207 (2)",
    "3414": "Serum 207 (1)",
    "3420": "Limestone brick",
    "3422": "Olive oil(4)",
    "3424": "Olive oil(3)",
    "3426": "Olive oil(2)",
    "3428": "Olive oil(1)",
    "3430": "Sacred oil(4)",
    "3432": "Sacred oil(3)",
    "3434": "Sacred oil(2)",
    "3436": "Sacred oil(1)",
    "3438": "Pyre logs",
    "3440": "Oak pyre logs",
    "3442": "Willow pyre logs",
    "3444": "Maple pyre logs",
    "3446": "Yew pyre logs",
    "3448": "Magic pyre logs",
    "3470": "Fine cloth",
    "3472": "Black plateskirt (t)",
    "3473": "Black plateskirt (g)",
    "3474": "Adamant plateskirt (t)",
    "3475": "Adamant plateskirt (g)",
    "3476": "Rune plateskirt (g)",
    "3477": "Rune plateskirt (t)",
    "3478": "Zamorak plateskirt",
    "3479": "Saradomin plateskirt",
    "3480": "Guthix plateskirt",
    "3481": "Gilded platebody",
    "3483": "Gilded platelegs",
    "3485": "Gilded plateskirt",
    "3486": "Gilded full helm",
    "3488": "Gilded kiteshield",
    "3678": "Flamtaer hammer",
    "3749": "Archer helm",
    "3751": "Berserker helm",
    "3753": "Warrior helm",
    "3755": "Farseer helm",
    "3759": "Fremennik cyan cloak",
    "3761": "Fremennik brown cloak",
    "3763": "Fremennik blue cloak",
    "3765": "Fremennik green cloak",
    "3767": "Fremennik brown shirt",
    "3769": "Fremennik grey shirt",
    "3771": "Fremennik beige shirt",
    "3773": "Fremennik red shirt",
    "3775": "Fremennik blue shirt",
    "3777": "Fremennik red cloak",
    "3779": "Fremennik grey cloak",
    "3781": "Fremennik yellow cloak",
    "3783": "Fremennik teal cloak",
    "3785": "Fremennik purple cloak",
    "3787": "Fremennik pink cloak",
    "3789": "Fremennik black cloak",
    "3791": "Fremennik boots",
    "3793": "Fremennik robe",
    "3795": "Fremennik skirt",
    "3797": "Fremennik hat",
    "3799": "Fremennik gloves",
    "3801": "Keg of beer",
    "3803": "Beer tankard",
    "3827": "Saradomin page 1",
    "3828": "Saradomin page 2",
    "3829": "Saradomin page 3",
    "3830": "Saradomin page 4",
    "3831": "Zamorak page 1",
    "3832": "Zamorak page 2",
    "3833": "Zamorak page 3",
    "3834": "Zamorak page 4",
    "3835": "Guthix page 1",
    "3836": "Guthix page 2",
    "3837": "Guthix page 3",
    "3838": "Guthix page 4",
    "3853": "Games necklace(8)",
    "4012": "Monkey nuts",
    "4014": "Monkey bar",
    "4016": "Banana stew",
    "4087": "Dragon platelegs",
    "4089": "Mystic hat",
    "4091": "Mystic robe top",
    "4093": "Mystic robe bottom",
    "4095": "Mystic gloves",
    "4097": "Mystic boots",
    "4099": "Mystic hat (dark)",
    "4101": "Mystic robe top (dark)",
    "4103": "Mystic robe bottom (dark)",
    "4105": "Mystic gloves (dark)",
    "4107": "Mystic boots (dark)",
    "4109": "Mystic hat (light)",
    "4111": "Mystic robe top (light)",
    "4113": "Mystic robe bottom (light)",
    "4115": "Mystic gloves (light)",
    "4117": "Mystic boots (light)",
    "4119": "Bronze boots",
    "4121": "Iron boots",
    "4123": "Steel boots",
    "4125": "Black boots",
    "4127": "Mithril boots",
    "4129": "Adamant boots",
    "4131": "Rune boots",
    "4151": "Abyssal whip",
    "4153": "Granite maul",
    "4156": "Mirror shield",
    "4161": "Bag of salt",
    "4162": "Rock hammer",
    "4164": "Facemask",
    "4166": "Earmuffs",
    "4168": "Nose peg",
    "4170": "Slayer's staff",
    "4207": "Crystal weapon seed",
    "4298": "Ham shirt",
    "4300": "Ham robe",
    "4302": "Ham hood",
    "4304": "Ham cloak",
    "4306": "Ham logo",
    "4308": "Ham gloves",
    "4310": "Ham boots",
    "4315": "Team-1 cape",
    "4317": "Team-2 cape",
    "4319": "Team-3 cape",
    "4321": "Team-4 cape",
    "4323": "Team-5 cape",
    "4325": "Team-6 cape",
    "4327": "Team-7 cape",
    "4329": "Team-8 cape",
    "4331": "Team-9 cape",
    "4333": "Team-10 cape",
    "4335": "Team-11 cape",
    "4337": "Team-12 cape",
    "4339": "Team-13 cape",
    "4341": "Team-14 cape",
    "4343": "Team-15 cape",
    "4345": "Team-16 cape",
    "4347": "Team-17 cape",
    "4349": "Team-18 cape",
    "4351": "Team-19 cape",
    "4353": "Team-20 cape",
    "4355": "Team-21 cape",
    "4357": "Team-22 cape",
    "4359": "Team-23 cape",
    "4361": "Team-24 cape",
    "4363": "Team-25 cape",
    "4365": "Team-26 cape",
    "4367": "Team-27 cape",
    "4369": "Team-28 cape",
    "4371": "Team-29 cape",
    "4373": "Team-30 cape",
    "4375": "Team-31 cape",
    "4377": "Team-32 cape",
    "4379": "Team-33 cape",
    "4381": "Team-34 cape",
    "4383": "Team-35 cape",
    "4385": "Team-36 cape",
    "4387": "Team-37 cape",
    "4389": "Team-38 cape",
    "4391": "Team-39 cape",
    "4393": "Team-40 cape",
    "4395": "Team-41 cape",
    "4397": "Team-42 cape",
    "4399": "Team-43 cape",
    "4401": "Team-44 cape",
    "4403": "Team-45 cape",
    "4405": "Team-46 cape",
    "4407": "Team-47 cape",
    "4409": "Team-48 cape",
    "4411": "Team-49 cape",
    "4413": "Team-50 cape",
    "4417": "Guthix rest(4)",
    "4419": "Guthix rest(3)",
    "4421": "Guthix rest(2)",
    "4423": "Guthix rest(1)",
    "4436": "Airtight pot",
    "4438": "Unfired pot lid",
    "4440": "Pot lid",
    "4456": "Bowl of hot water",
    "4458": "Cup of water",
    "4460": "Cup of hot water",
    "4517": "Giant frog legs",
    "4522": "Oil lamp",
    "4525": "Empty oil lamp",
    "4527": "Empty candle lantern",
    "4529": "Candle lantern (white)",
    "4532": "Candle lantern (black)",
    "4535": "Empty oil lantern",
    "4537": "Oil lantern",
    "4540": "Oil lantern frame",
    "4542": "Lantern lens",
    "4544": "Bullseye lantern (unf)",
    "4546": "Bullseye lantern (empty)",
    "4548": "Bullseye lantern",
    "4551": "Spiny helmet",
    "4580": "Black spear",
    "4582": "Black spear(p)",
    "4585": "Dragon plateskirt",
    "4587": "Dragon scimitar",
    "4591": "Kharidian headpiece",
    "4593": "Fake beard",
    "4595": "Karidian disguise",
    "4600": "Willow blackjack",
    "4608": "Super kebab",
    "4627": "Bandit's brew",
    "4668": "Garlic powder",
    "4675": "Ancient staff",
    "4684": "Linen (Icthlarin's Little Helper)",
    "4687": "Bucket of sap",
    "4689": "Pile of salt",
    "4694": "Steam rune",
    "4695": "Mist rune",
    "4696": "Dust rune",
    "4697": "Smoke rune",
    "4698": "Mud rune",
    "4699": "Lava rune",
    "4708": "Ahrim's hood",
    "4710": "Ahrim's staff",
    "4712": "Ahrim's robetop",
    "4714": "Ahrim's robeskirt",
    "4716": "Dharok's helm",
    "4718": "Dharok's greataxe",
    "4720": "Dharok's platebody",
    "4722": "Dharok's platelegs",
    "4724": "Guthan's helm",
    "4726": "Guthan's warspear",
    "4728": "Guthan's platebody",
    "4730": "Guthan's chainskirt",
    "4732": "Karil's coif",
    "4734": "Karil's crossbow",
    "4736": "Karil's leathertop",
    "4738": "Karil's leatherskirt",
    "4740": "Bolt rack",
    "4745": "Torag's helm",
    "4747": "Torag's hammers",
    "4749": "Torag's platebody",
    "4751": "Torag's platelegs",
    "4753": "Verac's helm",
    "4755": "Verac's flail",
    "4757": "Verac's brassard",
    "4759": "Verac's plateskirt",
    "4773": "Bronze brutal",
    "4778": "Iron brutal",
    "4783": "Steel brutal",
    "4788": "Black brutal",
    "4793": "Mithril brutal",
    "4798": "Adamant brutal",
    "4803": "Rune brutal",
    "4812": "Zogre bones",
    "4819": "Bronze nails",
    "4820": "Iron nails",
    "4821": "Black nails",
    "4822": "Mithril nails",
    "4823": "Adamantite nails",
    "4824": "Rune nails",
    "4825": "Unstrung comp bow",
    "4827": "Comp ogre bow",
    "4830": "Fayrg bones",
    "4832": "Raurg bones",
    "4834": "Ourg bones",
    "4842": "Relicym's balm(4)",
    "4844": "Relicym's balm(3)",
    "4846": "Relicym's balm(2)",
    "4848": "Relicym's balm(1)",
    "4850": "Ogre coffin key",
    "4860": "Ahrim's hood 0",
    "4866": "Ahrim's staff 0",
    "4872": "Ahrim's robetop 0",
    "4878": "Ahrim's robeskirt 0",
    "4884": "Dharok's helm 0",
    "4890": "Dharok's greataxe 0",
    "4896": "Dharok's platebody 0",
    "4902": "Dharok's platelegs 0",
    "4908": "Guthan's helm 0",
    "4914": "Guthan's warspear 0",
    "4920": "Guthan's platebody 0",
    "4926": "Guthan's chainskirt 0",
    "4932": "Karil's coif 0",
    "4938": "Karil's crossbow 0",
    "4944": "Karil's leathertop 0",
    "4950": "Karil's leatherskirt 0",
    "4956": "Torag's helm 0",
    "4962": "Torag's hammers 0",
    "4968": "Torag's platebody 0",
    "4974": "Torag's platelegs 0",
    "4980": "Verac's helm 0",
    "4986": "Verac's flail 0",
    "4992": "Verac's brassard 0",
    "4998": "Verac's plateskirt 0",
    "5001": "Raw cave eel",
    "5003": "Cave eel",
    "5014": "Mining helmet",
    "5016": "Bone spear",
    "5018": "Bone club",
    "5024": "Woven top (brown)",
    "5026": "Woven top (yellow)",
    "5028": "Woven top (blue)",
    "5030": "Shirt (brown)",
    "5032": "Shirt (yellow)",
    "5034": "Shirt (lilac)",
    "5036": "Trousers (brown)",
    "5038": "Trousers (lilac)",
    "5040": "Trousers (blue)",
    "5042": "Shorts (brown)",
    "5044": "Shorts (yellow)",
    "5046": "Shorts (blue)",
    "5048": "Skirt (brown)",
    "5050": "Skirt (lilac)",
    "5052": "Skirt (blue)",
    "5075": "Bird nest (empty)",
    "5096": "Marigold seed",
    "5097": "Rosemary seed",
    "5098": "Nasturtium seed",
    "5099": "Woad seed",
    "5100": "Limpwurt seed",
    "5101": "Redberry seed",
    "5102": "Cadavaberry seed",
    "5103": "Dwellberry seed",
    "5104": "Jangerberry seed",
    "5105": "Whiteberry seed",
    "5106": "Poison ivy seed",
    "5280": "Cactus seed",
    "5281": "Belladonna seed",
    "5282": "Mushroom spore",
    "5283": "Apple tree seed",
    "5284": "Banana tree seed",
    "5285": "Orange tree seed",
    "5286": "Curry tree seed",
    "5287": "Pineapple seed",
    "5288": "Papaya tree seed",
    "5289": "Palm tree seed",
    "5290": "Calquat tree seed",
    "5291": "Guam seed",
    "5292": "Marrentill seed",
    "5293": "Tarromin seed",
    "5294": "Harralander seed",
    "5295": "Ranarr seed",
    "5296": "Toadflax seed",
    "5297": "Irit seed",
    "5298": "Avantoe seed",
    "5299": "Kwuarm seed",
    "5300": "Snapdragon seed",
    "5301": "Cadantine seed",
    "5302": "Lantadyme seed",
    "5303": "Dwarf weed seed",
    "5304": "Torstol seed",
    "5305": "Barley seed",
    "5306": "Jute seed",
    "5307": "Hammerstone seed",
    "5308": "Asgarnian seed",
    "5309": "Yanillian seed",
    "5310": "Krandorian seed",
    "5311": "Wildblood seed",
    "5312": "Acorn",
    "5313": "Willow seed",
    "5314": "Maple seed",
    "5315": "Yew seed",
    "5316": "Magic seed",
    "5318": "Potato seed",
    "5319": "Onion seed",
    "5320": "Sweetcorn seed",
    "5321": "Watermelon seed",
    "5322": "Tomato seed",
    "5323": "Strawberry seed",
    "5324": "Cabbage seed",
    "5325": "Gardening trowel",
    "5329": "Secateurs",
    "5331": "Watering can",
    "5341": "Rake",
    "5343": "Seed dibber",
    "5345": "Gardening boots",
    "5350": "Empty plant pot",
    "5352": "Unfired plant pot",
    "5354": "Filled plant pot",
    "5370": "Oak sapling",
    "5371": "Willow sapling",
    "5372": "Maple sapling",
    "5373": "Yew sapling",
    "5374": "Magic sapling",
    "5376": "Basket",
    "5386": "Apples(5)",
    "5396": "Oranges(5)",
    "5406": "Strawberries(5)",
    "5416": "Bananas(5)",
    "5418": "Empty sack",
    "5438": "Potatoes(10)",
    "5458": "Onions(10)",
    "5478": "Cabbages(10)",
    "5496": "Apple sapling",
    "5497": "Banana sapling",
    "5498": "Orange sapling",
    "5499": "Curry sapling",
    "5500": "Pineapple sapling",
    "5501": "Papaya sapling",
    "5502": "Palm sapling",
    "5503": "Calquat sapling",
    "5504": "Strawberry",
    "5516": "Elemental talisman",
    "5521": "Binding necklace",
    "5523": "Tiara mould",
    "5525": "Tiara",
    "5527": "Air tiara",
    "5529": "Mind tiara",
    "5531": "Water tiara",
    "5533": "Body tiara",
    "5535": "Earth tiara",
    "5537": "Fire tiara",
    "5539": "Cosmic tiara",
    "5541": "Nature tiara",
    "5543": "Chaos tiara",
    "5547": "Death tiara",
    "5549": "Blood tiara",
    "5574": "Initiate sallet",
    "5575": "Initiate hauberk",
    "5576": "Initiate cuisse",
    "5616": "Bronze arrow(p+)",
    "5617": "Iron arrow(p+)",
    "5618": "Steel arrow(p+)",
    "5619": "Mithril arrow(p+)",
    "5620": "Adamant arrow(p+)",
    "5621": "Rune arrow(p+)",
    "5622": "Bronze arrow(p++)",
    "5623": "Iron arrow(p++)",
    "5624": "Steel arrow(p++)",
    "5625": "Mithril arrow(p++)",
    "5626": "Adamant arrow(p++)",
    "5627": "Rune arrow(p++)",
    "5628": "Bronze dart(p+)",
    "5629": "Iron dart(p+)",
    "5630": "Steel dart(p+)",
    "5631": "Black dart(p+)",
    "5632": "Mithril dart(p+)",
    "5633": "Adamant dart(p+)",
    "5634": "Rune dart(p+)",
    "5635": "Bronze dart(p++)",
    "5636": "Iron dart(p++)",
    "5637": "Steel dart(p++)",
    "5638": "Black dart(p++)",
    "5639": "Mithril dart(p++)",
    "5640": "Adamant dart(p++)",
    "5641": "Rune dart(p++)",
    "5642": "Bronze javelin(p+)",
    "5643": "Iron javelin(p+)",
    "5644": "Steel javelin(p+)",
    "5645": "Mithril javelin(p+)",
    "5646": "Adamant javelin(p+)",
    "5647": "Rune javelin(p+)",
    "5648": "Bronze javelin(p++)",
    "5649": "Iron javelin(p++)",
    "5650": "Steel javelin(p++)",
    "5651": "Mithril javelin(p++)",
    "5652": "Adamant javelin(p++)",
    "5653": "Rune javelin(p++)",
    "5654": "Bronze knife(p+)",
    "5655": "Iron knife(p+)",
    "5656": "Steel knife(p+)",
    "5657": "Mithril knife(p+)",
    "5658": "Black knife(p+)",
    "5659": "Adamant knife(p+)",
    "5660": "Rune knife(p+)",
    "5661": "Bronze knife(p++)",
    "5662": "Iron knife(p++)",
    "5663": "Steel knife(p++)",
    "5664": "Mithril knife(p++)",
    "5665": "Black knife(p++)",
    "5666": "Adamant knife(p++)",
    "5667": "Rune knife(p++)",
    "5668": "Iron dagger(p+)",
    "5670": "Bronze dagger(p+)",
    "5672": "Steel dagger(p+)",
    "5674": "Mithril dagger(p+)",
    "5676": "Adamant dagger(p+)",
    "5678": "Rune dagger(p+)",
    "5680": "Dragon dagger(p+)",
    "5682": "Black dagger(p+)",
    "5686": "Iron dagger(p++)",
    "5688": "Bronze dagger(p++)",
    "5690": "Steel dagger(p++)",
    "5692": "Mithril dagger(p++)",
    "5694": "Adamant dagger(p++)",
    "5696": "Rune dagger(p++)",
    "5698": "Dragon dagger(p++)",
    "5700": "Black dagger(p++)",
    "5704": "Bronze spear(p+)",
    "5706": "Iron spear(p+)",
    "5708": "Steel spear(p+)",
    "5710": "Mithril spear(p+)",
    "5712": "Adamant spear(p+)",
    "5714": "Rune spear(p+)",
    "5716": "Dragon spear(p+)",
    "5718": "Bronze spear(p++)",
    "5720": "Iron spear(p++)",
    "5722": "Steel spear(p++)",
    "5724": "Mithril spear(p++)",
    "5726": "Adamant spear(p++)",
    "5728": "Rune spear(p++)",
    "5730": "Dragon spear(p++)",
    "5734": "Black spear(p+)",
    "5736": "Black spear(p++)",
    "5739": "Asgarnian ale(m)",
    "5741": "Mature wmb",
    "5743": "Greenman's ale(m)",
    "5745": "Dragon bitter(m)",
    "5747": "Dwarven stout(m)",
    "5749": "Moonlight mead(m)",
    "5751": "Axeman's folly",
    "5753": "Axeman's folly(m)",
    "5755": "Chef's delight",
    "5757": "Chef's delight(m)",
    "5759": "Slayer's respite",
    "5761": "Slayer's respite(m)",
    "5763": "Cider",
    "5765": "Mature cider",
    "5767": "Ale yeast",
    "5769": "Calquat keg",
    "5777": "Dwarven stout(4)",
    "5785": "Asgarnian ale(4)",
    "5793": "Greenmans ale(4)",
    "5801": "Mind bomb(4)",
    "5809": "Dragon bitter(4)",
    "5817": "Moonlight mead(4)",
    "5825": "Axeman's folly(4)",
    "5833": "Chef's delight(4)",
    "5841": "Slayer's respite(4)",
    "5849": "Cider(4)",
    "5857": "Dwarven stout(m4)",
    "5865": "Asgarnian ale(m4)",
    "5873": "Greenmans ale(m4)",
    "5881": "Mind bomb(m4)",
    "5889": "Dragon bitter(m4)",
    "5897": "Moonlight mead(m4)",
    "5905": "Axeman's folly(m4)",
    "5913": "Chef's delight(m4)",
    "5921": "Slayer's respite(m4)",
    "5929": "Cider(m4)",
    "5931": "Jute fibre",
    "5933": "Willow branch",
    "5935": "Coconut milk",
    "5937": "Weapon poison(+)",
    "5940": "Weapon poison(++)",
    "5943": "Antidote+(4)",
    "5945": "Antidote+(3)",
    "5947": "Antidote+(2)",
    "5949": "Antidote+(1)",
    "5952": "Antidote++(4)",
    "5954": "Antidote++(3)",
    "5956": "Antidote++(2)",
    "5958": "Antidote++(1)",
    "5968": "Tomatoes(5)",
    "5970": "Curry leaf",
    "5972": "Papaya fruit",
    "5974": "Coconut",
    "5980": "Calquat fruit",
    "5982": "Watermelon",
    "5984": "Watermelon slice",
    "5986": "Sweetcorn",
    "5988": "Cooked sweetcorn",
    "5992": "Apple mush",
    "5994": "Hammerstone hops",
    "5996": "Asgarnian hops",
    "5998": "Yanillian hops",
    "6000": "Krandorian hops",
    "6002": "Wildblood hops",
    "6004": "Mushroom",
    "6006": "Barley",
    "6008": "Barley malt",
    "6010": "Marigolds",
    "6012": "Nasturtiums",
    "6014": "Rosemary",
    "6016": "Cactus spine",
    "6018": "Poison ivy berries",
    "6020": "Leaves",
    "6022": "Oak leaves",
    "6024": "Willow leaves",
    "6026": "Yew leaves",
    "6028": "Maple leaves",
    "6030": "Magic leaves",
    "6032": "Compost",
    "6034": "Supercompost",
    "6036": "Plant cure",
    "6038": "Magic string",
    "6043": "Oak roots",
    "6045": "Willow roots",
    "6047": "Maple roots",
    "6049": "Yew roots",
    "6051": "Magic roots",
    "6055": "Weeds",
    "6061": "Bronze bolts (p+)",
    "6062": "Bronze bolts (p++)",
    "6128": "Rock-shell helm",
    "6129": "Rock-shell plate",
    "6130": "Rock-shell legs",
    "6131": "Spined helm",
    "6133": "Spined body",
    "6135": "Spined chaps",
    "6137": "Skeletal helm",
    "6139": "Skeletal top",
    "6141": "Skeletal bottoms",
    "6143": "Spined boots",
    "6145": "Rock-shell boots",
    "6147": "Skeletal boots",
    "6149": "Spined gloves",
    "6151": "Rock-shell gloves",
    "6153": "Skeletal gloves",
    "6155": "Dagannoth hide",
    "6157": "Rock-shell chunk",
    "6159": "Rock-shell shard",
    "6161": "Rock-shell splinter",
    "6163": "Skull piece",
    "6165": "Ribcage piece",
    "6167": "Fibula piece",
    "6169": "Circular hide",
    "6171": "Flattened hide",
    "6173": "Stretched hide",
    "6211": "Teak pyre logs",
    "6213": "Mahogany pyre logs",
    "6215": "Broodoo shield (10) (poison)",
    "6235": "Broodoo shield (poison)",
    "6237": "Broodoo shield (10) (disease)",
    "6257": "Broodoo shield (disease)",
    "6259": "Broodoo shield (10) (combat)",
    "6279": "Broodoo shield (combat)",
    "6281": "Thatch spar light",
    "6283": "Thatch spar med",
    "6285": "Thatch spar dense",
    "6287": "Snake hide",
    "6289": "Snakeskin",
    "6291": "Spider carcass",
    "6297": "Spider on stick",
    "6299": "Spider on shaft",
    "6305": "Skewer stick",
    "6306": "Trading sticks",
    "6311": "Gout tuber",
    "6313": "Opal machete",
    "6315": "Jade machete",
    "6317": "Red topaz machete",
    "6319": "Proboscis",
    "6322": "Snakeskin body",
    "6324": "Snakeskin chaps",
    "6326": "Snakeskin bandana",
    "6328": "Snakeskin boots",
    "6330": "Snakeskin vambraces",
    "6332": "Mahogany logs",
    "6333": "Teak logs",
    "6335": "Tribal mask (poison)",
    "6337": "Tribal mask (disease)",
    "6339": "Tribal mask (combat)",
    "6341": "Tribal top (brown)",
    "6343": "Villager robe (brown)",
    "6345": "Villager hat (brown)",
    "6347": "Villager armband (brown)",
    "6349": "Villager sandals (brown)",
    "6351": "Tribal top (blue)",
    "6353": "Villager robe (blue)",
    "6355": "Villager hat (blue)",
    "6357": "Villager sandals (blue)",
    "6359": "Villager armband (blue)",
    "6361": "Tribal top (yellow)",
    "6363": "Villager robe (yellow)",
    "6365": "Villager hat (yellow)",
    "6367": "Villager sandals (yellow)",
    "6369": "Villager armband (yellow)",
    "6371": "Tribal top (pink)",
    "6373": "Villager robe (pink)",
    "6375": "Villager hat (pink)",
    "6377": "Villager sandals (pink)",
    "6379": "Villager armband (pink)",
    "6382": "Fez",
    "6384": "Desert top",
    "6386": "Desert robes",
    "6388": "Desert top (overcoat)",
    "6390": "Desert legs",
    "6392": "Menaphite purple hat",
    "6394": "Menaphite purple top",
    "6396": "Menaphite purple robe",
    "6398": "Menaphite purple kilt",
    "6400": "Menaphite red hat",
    "6402": "Menaphite red top",
    "6404": "Menaphite red robe",
    "6406": "Menaphite red kilt",
    "6408": "Oak blackjack(o)",
    "6410": "Oak blackjack(d)",
    "6412": "Willow blackjack(o)",
    "6414": "Willow blackjack(d)",
    "6416": "Maple blackjack",
    "6418": "Maple blackjack(o)",
    "6420": "Maple blackjack(d)",
    "6470": "Compost potion(4)",
    "6472": "Compost potion(3)",
    "6474": "Compost potion(2)",
    "6476": "Compost potion(1)",
    "6522": "Toktz-xil-ul",
    "6523": "Toktz-xil-ak",
    "6524": "Toktz-ket-xil",
    "6525": "Toktz-xil-ek",
    "6526": "Toktz-mej-tal",
    "6527": "Tzhaar-ket-em",
    "6528": "Tzhaar-ket-om",
    "6562": "Mud battlestaff",
    "6563": "Mystic mud staff",
    "6568": "Obsidian cape",
    "6571": "Uncut onyx",
    "6573": "Onyx",
    "6575": "Onyx ring",
    "6577": "Onyx necklace",
    "6579": "Onyx amulet (u)",
    "6581": "Onyx amulet",
    "6583": "Ring of stone",
    "6585": "Amulet of fury",
    "6587": "White claws",
    "6589": "White battleaxe",
    "6591": "White dagger",
    "6593": "White dagger(p)",
    "6595": "White dagger(p+)",
    "6597": "White dagger(p++)",
    "6599": "White halberd",
    "6601": "White mace",
    "6603": "White magic staff",
    "6605": "White sword",
    "6607": "White longsword",
    "6609": "White 2h sword",
    "6611": "White scimitar",
    "6613": "White warhammer",
    "6615": "White chainbody",
    "6617": "White platebody",
    "6619": "White boots",
    "6621": "White med helm",
    "6623": "White full helm",
    "6625": "White platelegs",
    "6627": "White plateskirt",
    "6629": "White gloves",
    "6631": "White sq shield",
    "6633": "White kiteshield",
    "6667": "Empty fishbowl",
    "6681": "Ground guam",
    "6685": "Saradomin brew(4)",
    "6687": "Saradomin brew(3)",
    "6689": "Saradomin brew(2)",
    "6691": "Saradomin brew(1)",
    "6693": "Crushed nest",
    "6697": "Pat of butter",
    "6701": "Baked potato",
    "6703": "Potato with butter",
    "6705": "Potato with cheese",
    "6724": "Seercull",
    "6729": "Dagannoth bones",
    "6731": "Seers ring",
    "6733": "Archers ring",
    "6735": "Warrior ring",
    "6737": "Berserker ring",
    "6739": "Dragon axe",
    "6750": "Black desert shirt",
    "6752": "Black desert robe",
    "6760": "Guthix mjolnir",
    "6762": "Saradomin mjolnir",
    "6764": "Zamorak mjolnir",
    "6794": "Choc-ice",
    "6809": "Granite legs",
    "6812": "Wyvern bones",
    "6814": "Fur",
    "6889": "Mage's book",
    "6891": "Arena book",
    "6908": "Beginner wand",
    "6910": "Apprentice wand",
    "6912": "Teacher wand",
    "6914": "Master wand",
    "6916": "Infinity top",
    "6918": "Infinity hat",
    "6920": "Infinity boots",
    "6922": "Infinity gloves",
    "6924": "Infinity bottoms",
    "6959": "Pink cape",
    "6962": "Triangle sandwich",
    "6971": "Sandstone (1kg)",
    "6973": "Sandstone (2kg)",
    "6975": "Sandstone (5kg)",
    "6977": "Sandstone (10kg)",
    "6979": "Granite (500g)",
    "6981": "Granite (2kg)",
    "6983": "Granite (5kg)",
    "7051": "Unlit bug lantern",
    "7054": "Chilli potato",
    "7056": "Egg potato",
    "7058": "Mushroom potato",
    "7060": "Tuna potato",
    "7062": "Chilli con carne",
    "7064": "Egg and tomato",
    "7066": "Mushroom & onion",
    "7068": "Tuna and corn",
    "7070": "Minced meat",
    "7072": "Spicy sauce",
    "7074": "Chopped garlic",
    "7076": "Uncooked egg",
    "7078": "Scrambled egg",
    "7080": "Sliced mushrooms",
    "7082": "Fried mushrooms",
    "7084": "Fried onions",
    "7086": "Chopped tuna",
    "7088": "Sweetcorn (bowl)",
    "7110": "Stripy pirate shirt (beige)",
    "7112": "Pirate bandana (white)",
    "7114": "Pirate boots",
    "7116": "Pirate leggings (beige)",
    "7122": "Stripy pirate shirt (red)",
    "7124": "Pirate bandana (red)",
    "7126": "Pirate leggings (red)",
    "7128": "Stripy pirate shirt (blue)",
    "7130": "Pirate bandana (blue)",
    "7132": "Pirate leggings (blue)",
    "7134": "Stripy pirate shirt (brown)",
    "7136": "Pirate bandana (brown)",
    "7138": "Pirate leggings (brown)",
    "7158": "Dragon 2h sword",
    "7159": "Insulated boots",
    "7162": "Pie recipe book",
    "7168": "Raw mud pie",
    "7170": "Mud pie",
    "7176": "Raw garden pie",
    "7178": "Garden pie",
    "7186": "Raw fish pie",
    "7188": "Fish pie",
    "7196": "Raw admiral pie",
    "7198": "Admiral pie",
    "7206": "Raw wild pie",
    "7208": "Wild pie",
    "7216": "Raw summer pie",
    "7218": "Summer pie",
    "7223": "Roast rabbit",
    "7225": "Iron spit",
    "7228": "Cooked chompy (roasted)",
    "7319": "Red boater",
    "7321": "Orange boater",
    "7323": "Green boater",
    "7325": "Blue boater",
    "7327": "Black boater",
    "7329": "Red firelighter",
    "7330": "Green firelighter",
    "7331": "Blue firelighter",
    "7332": "Black shield (h1)",
    "7334": "Adamant shield (h1)",
    "7336": "Rune shield (h1)",
    "7338": "Black shield (h2)",
    "7340": "Adamant shield (h2)",
    "7342": "Rune shield (h2)",
    "7344": "Black shield (h3)",
    "7346": "Adamant shield (h3)",
    "7348": "Rune shield (h3)",
    "7350": "Black shield (h4)",
    "7352": "Adamant shield (h4)",
    "7354": "Rune shield (h4)",
    "7356": "Black shield (h5)",
    "7358": "Adamant shield (h5)",
    "7360": "Rune shield (h5)",
    "7362": "Studded body (g)",
    "7364": "Studded body (t)",
    "7366": "Studded chaps (g)",
    "7368": "Studded chaps (t)",
    "7370": "Green d'hide body (g)",
    "7372": "Green d'hide body (t)",
    "7374": "Blue d'hide body (g)",
    "7376": "Blue d'hide body (t)",
    "7378": "Green d'hide chaps (g)",
    "7380": "Green d'hide chaps (t)",
    "7382": "Blue d'hide chaps (g)",
    "7384": "Blue d'hide chaps (t)",
    "7386": "Blue skirt (g)",
    "7388": "Blue skirt (t)",
    "7390": "Blue wizard robe (g)",
    "7392": "Blue wizard robe (t)",
    "7394": "Blue wizard hat (g)",
    "7396": "Blue wizard hat (t)",
    "7398": "Enchanted robe",
    "7399": "Enchanted top",
    "7400": "Enchanted hat",
    "7416": "Mole claw",
    "7418": "Mole skin",
    "7433": "Wooden spoon",
    "7435": "Egg whisk",
    "7437": "Spork",
    "7439": "Spatula",
    "7441": "Frying pan",
    "7443": "Skewer",
    "7445": "Rolling pin",
    "7447": "Kitchen knife",
    "7449": "Meat tenderiser",
    "7451": "Cleaver",
    "7466": "Cornflour",
    "7468": "Pot of cornflour",
    "7521": "Cooked giant crab meat",
    "7566": "Raw jubbly",
    "7568": "Cooked jubbly",
    "7650": "Silver dust",
    "7660": "Guthix balance(4)",
    "7662": "Guthix balance(3)",
    "7664": "Guthix balance(2)",
    "7666": "Guthix balance(1)",
    "7668": "Gadderhammer",
    "7759": "Toy soldier",
    "7761": "Toy soldier (wound)",
    "7763": "Toy doll",
    "7765": "Toy doll (wound)",
    "7767": "Toy mouse",
    "7769": "Toy mouse (wound)",
    "7771": "Toy cat",
    "7801": "Snake hide (swamp)",
    "7919": "Bottle of wine",
    "7936": "Pure essence",
    "7939": "Tortoise shell",
    "7944": "Raw monkfish",
    "7946": "Monkfish",
    "8007": "Varrock teleport (tablet)",
    "8008": "Lumbridge teleport (tablet)",
    "8009": "Falador teleport (tablet)",
    "8010": "Camelot teleport (tablet)",
    "8011": "Ardougne teleport (tablet)",
    "8012": "Watchtower teleport (tablet)",
    "8013": "Teleport to house (tablet)",
    "8014": "Bones to bananas (tablet)",
    "8015": "Bones to peaches (tablet)",
    "8016": "Enchant sapphire or opal",
    "8017": "Enchant emerald or jade",
    "8018": "Enchant ruby or topaz",
    "8019": "Enchant diamond",
    "8020": "Enchant dragonstone",
    "8021": "Enchant onyx",
    "8417": "Bagged dead tree",
    "8419": "Bagged nice tree",
    "8421": "Bagged oak tree",
    "8423": "Bagged willow tree",
    "8425": "Bagged maple tree",
    "8427": "Bagged yew tree",
    "8429": "Bagged magic tree",
    "8431": "Bagged plant 1",
    "8433": "Bagged plant 2",
    "8435": "Bagged plant 3",
    "8437": "Thorny hedge (bagged)",
    "8439": "Nice hedge (bagged)",
    "8441": "Small box hedge (bagged)",
    "8443": "Topiary hedge (bagged)",
    "8445": "Fancy hedge (bagged)",
    "8447": "Tall fancy hedge (bagged)",
    "8449": "Tall box hedge (bagged)",
    "8451": "Bagged flower",
    "8453": "Bagged daffodils",
    "8455": "Bagged bluebells",
    "8457": "Bagged sunflower",
    "8459": "Bagged marigolds",
    "8461": "Bagged roses",
    "8496": "Crude chair (flatpack)",
    "8498": "Wooden chair (flatpack)",
    "8500": "Rocking chair (flatpack)",
    "8502": "Oak chair (flatpack)",
    "8504": "Oak armchair (flatpack)",
    "8506": "Teak armchair (flatpack)",
    "8508": "Mahogany armchair (flatpack)",
    "8510": "Bookcase (flatpack)",
    "8512": "Oak bookcase (flatpack)",
    "8514": "Mahogany bookcase (flatpack)",
    "8516": "Beer barrel (flatpack)",
    "8518": "Cider barrel (flatpack)",
    "8520": "Asgarnian ale (flatpack)",
    "8522": "Greenman's ale (flatpack)",
    "8524": "Dragon bitter (flatpack)",
    "8526": "Chef's delight (flatpack)",
    "8528": "Kitchen table (flatpack)",
    "8530": "Oak kitchen table (flatpack)",
    "8532": "Teak kitchen table (flatpack)",
    "8548": "Wood dining table (flatpack)",
    "8550": "Oak dining table (flatpack)",
    "8552": "Carved oak table (flatpack)",
    "8554": "Teak table (flatpack)",
    "8556": "Carved teak table (flatpack)",
    "8558": "Mahogany table (flatpack)",
    "8560": "Opulent table (flatpack)",
    "8562": "Wooden bench (flatpack)",
    "8564": "Oak bench (flatpack)",
    "8566": "Carved oak bench (flatpack)",
    "8568": "Teak dining bench (flatpack)",
    "8570": "Carved teak bench (flatpack)",
    "8572": "Mahogany bench (flatpack)",
    "8574": "Gilded bench (flatpack)",
    "8576": "Wooden bed (flatpack)",
    "8578": "Oak bed (flatpack)",
    "8580": "Large oak bed (flatpack)",
    "8582": "Teak bed (flatpack)",
    "8584": "Large teak bed (flatpack)",
    "8586": "Four-poster bed (flatpack)",
    "8588": "Gilded four-poster (flatpack)",
    "8590": "Oak clock (flatpack)",
    "8592": "Teak clock (flatpack)",
    "8594": "Gilded clock (flatpack)",
    "8596": "Shaving stand (flatpack)",
    "8598": "Oak shaving stand (flatpack)",
    "8600": "Oak dresser (flatpack)",
    "8602": "Teak dresser (flatpack)",
    "8604": "Fancy teak dresser (flatpack)",
    "8606": "Mahogany dresser (flatpack)",
    "8608": "Gilded dresser (flatpack)",
    "8610": "Shoe box (flatpack)",
    "8612": "Oak drawers (flatpack)",
    "8614": "Oak wardrobe (flatpack)",
    "8616": "Teak drawers (flatpack)",
    "8618": "Teak wardrobe (flatpack)",
    "8620": "Mahogany wardrobe (flatpack)",
    "8622": "Gilded wardrobe (flatpack)",
    "8624": "Crystal ball (flatpack)",
    "8626": "Elemental sphere (flatpack)",
    "8628": "Crystal of power (flatpack)",
    "8778": "Oak plank",
    "8780": "Teak plank",
    "8782": "Mahogany plank",
    "8784": "Gold leaf",
    "8786": "Marble block",
    "8788": "Magic stone",
    "8790": "Bolt of cloth",
    "8792": "Clockwork",
    "8794": "Saw",
    "8837": "Timber beam",
    "8872": "Bone dagger",
    "8874": "Bone dagger (p)",
    "8876": "Bone dagger (p+)",
    "8878": "Bone dagger (p++)",
    "8880": "Dorgeshuun crossbow",
    "8882": "Bone bolts",
    "8901": "Black mask (10)",
    "8921": "Black mask",
    "8924": "Bandana eyepatch (white)",
    "8925": "Bandana eyepatch (red)",
    "8926": "Bandana eyepatch (blue)",
    "8927": "Bandana eyepatch (brown)",
    "8928": "Hat eyepatch",
    "8940": "Rum (red)",
    "8941": "Rum (blue)",
    "9003": "Security book",
    "9004": "Stronghold notes",
    "9026": "Ivory comb",
    "9028": "Golden scarab",
    "9030": "Stone scarab",
    "9032": "Pottery scarab",
    "9034": "Golden statuette",
    "9036": "Pottery statuette",
    "9038": "Stone statuette",
    "9040": "Gold seal",
    "9042": "Stone seal",
    "9052": "Locust meat",
    "9075": "Astral rune",
    "9140": "Iron bolts",
    "9141": "Steel bolts",
    "9142": "Mithril bolts",
    "9143": "Adamant bolts",
    "9144": "Runite bolts",
    "9145": "Silver bolts",
    "9174": "Bronze crossbow",
    "9177": "Iron crossbow",
    "9179": "Steel crossbow",
    "9181": "Mithril crossbow",
    "9183": "Adamant crossbow",
    "9185": "Rune crossbow",
    "9187": "Jade bolt tips",
    "9188": "Topaz bolt tips",
    "9189": "Sapphire bolt tips",
    "9190": "Emerald bolt tips",
    "9191": "Ruby bolt tips",
    "9192": "Diamond bolt tips",
    "9193": "Dragonstone bolt tips",
    "9194": "Onyx bolt tips",
    "9236": "Opal bolts (e)",
    "9238": "Pearl bolts (e)",
    "9239": "Topaz bolts (e)",
    "9240": "Sapphire bolts (e)",
    "9241": "Emerald bolts (e)",
    "9242": "Ruby bolts (e)",
    "9243": "Diamond bolts (e)",
    "9244": "Dragonstone bolts (e)",
    "9245": "Onyx bolts (e)",
    "9287": "Iron bolts (p)",
    "9288": "Steel bolts (p)",
    "9289": "Mithril bolts (p)",
    "9290": "Adamant bolts (p)",
    "9291": "Runite bolts (p)",
    "9292": "Silver bolts (p)",
    "9294": "Iron bolts (p+)",
    "9295": "Steel bolts (p+)",
    "9296": "Mithril bolts (p+)",
    "9297": "Adamant bolts (p+)",
    "9298": "Runite bolts (p+)",
    "9299": "Silver bolts (p+)",
    "9301": "Iron bolts (p++)",
    "9302": "Steel bolts (p++)",
    "9303": "Mithril bolts (p++)",
    "9304": "Adamant bolts (p++)",
    "9305": "Runite bolts (p++)",
    "9306": "Silver bolts (p++)",
    "9336": "Topaz bolts",
    "9337": "Sapphire bolts",
    "9338": "Emerald bolts",
    "9339": "Ruby bolts",
    "9340": "Diamond bolts",
    "9341": "Dragonstone bolts",
    "9342": "Onyx bolts",
    "9375": "Bronze bolts (unf)",
    "9377": "Iron bolts (unf)",
    "9378": "Steel bolts (unf)",
    "9379": "Mithril bolts (unf)",
    "9380": "Adamant bolts(unf)",
    "9381": "Runite bolts (unf)",
    "9382": "Silver bolts (unf)",
    "9416": "Mith grapple tip",
    "9418": "Mith grapple (unf)",
    "9419": "Mith grapple",
    "9420": "Bronze limbs",
    "9423": "Iron limbs",
    "9425": "Steel limbs",
    "9427": "Mithril limbs",
    "9429": "Adamantite limbs",
    "9431": "Runite limbs",
    "9434": "Bolt mould",
    "9436": "Sinew",
    "9438": "Crossbow string",
    "9440": "Wooden stock",
    "9442": "Oak stock",
    "9444": "Willow stock",
    "9446": "Teak stock",
    "9448": "Maple stock",
    "9450": "Mahogany stock",
    "9452": "Yew stock",
    "9454": "Bronze crossbow (u)",
    "9457": "Iron crossbow (u)",
    "9459": "Steel crossbow (u)",
    "9461": "Mithril crossbow (u)",
    "9463": "Adamant crossbow (u)",
    "9465": "Runite crossbow (u)",
    "9469": "Grand seed pod",
    "9470": "Gnome scarf",
    "9472": "Gnome goggles",
    "9475": "Mint cake",
    "9629": "Tyras helm",
    "9634": "Vyrewatch top",
    "9636": "Vyrewatch legs",
    "9638": "Vyrewatch shoes",
    "9640": "Citizen top",
    "9642": "Citizen trousers",
    "9644": "Citizen shoes",
    "9666": "Proselyte harness m",
    "9668": "Initiate harness m",
    "9670": "Proselyte harness f",
    "9672": "Proselyte sallet",
    "9674": "Proselyte hauberk",
    "9676": "Proselyte cuisse",
    "9678": "Proselyte tasset",
    "9729": "Elemental helmet",
    "9731": "Mind shield",
    "9733": "Mind helmet",
    "9735": "Desert goat horn",
    "9736": "Goat horn dust",
    "9739": "Combat potion(4)",
    "9741": "Combat potion(3)",
    "9743": "Combat potion(2)",
    "9745": "Combat potion(1)",
    "9843": "Oak cape rack (flatpack)",
    "9844": "Teak cape rack (flatpack)",
    "9845": "Mahogany cape rack (flatpack)",
    "9846": "Gilded cape rack (flatpack)",
    "9847": "Marble cape rack (flatpack)",
    "9848": "Magic cape rack (flatpack)",
    "9849": "Oak toy box (flatpack)",
    "9850": "Teak toy box (flatpack)",
    "9851": "Mahogany toy box (flatpack)",
    "9852": "Oak magic wardrobe (flatpack)",
    "9853": "Carved oak magic wardrobe (flatpack)",
    "9854": "Teak magic wardrobe (flatpack)",
    "9855": "Carved teak magic wardrobe (flatpack)",
    "9856": "Mahogany magic wardrobe (flatpack)",
    "9857": "Gilded magic wardrobe (flatpack)",
    "9858": "Marble magic wardrobe (flatpack)",
    "9859": "Oak armour case (flatpack)",
    "9860": "Teak armour case (flatpack)",
    "9861": "Mahogany armour case (flatpack)",
    "9862": "Oak treasure chest (flatpack)",
    "9863": "Teak treasure chest (flatpack)",
    "9864": "M. treasure chest (flatpack)",
    "9865": "Oak fancy dress box (flatpack)",
    "9866": "Teak fancy dress box (flatpack)",
    "9867": "Mahogany fancy dress box (flatpack)",
    "9978": "Raw bird meat",
    "9980": "Roast bird meat",
    "9986": "Raw beast meat",
    "9988": "Roast beast meat",
    "9994": "Spicy tomato",
    "9996": "Spicy minced meat",
    "9998": "Hunter potion(4)",
    "10000": "Hunter potion(3)",
    "10002": "Hunter potion(2)",
    "10004": "Hunter potion(1)",
    "10006": "Bird snare",
    "10008": "Box trap",
    "10010": "Butterfly net",
    "10012": "Butterfly jar",
    "10014": "Black warlock (item)",
    "10016": "Snowy knight (item)",
    "10018": "Sapphire glacialis (item)",
    "10020": "Ruby harvest (item)",
    "10025": "Magic box",
    "10029": "Teasing stick",
    "10031": "Rabbit snare",
    "10033": "Chinchompa",
    "10034": "Red chinchompa",
    "10035": "Kyatt legs",
    "10037": "Kyatt top",
    "10039": "Kyatt hat",
    "10041": "Larupia legs",
    "10043": "Larupia top",
    "10045": "Larupia hat",
    "10047": "Graahk legs",
    "10049": "Graahk top",
    "10051": "Graahk headdress",
    "10053": "Wood camo top",
    "10055": "Wood camo legs",
    "10057": "Jungle camo top",
    "10059": "Jungle camo legs",
    "10061": "Desert camo top",
    "10063": "Desert camo legs",
    "10065": "Polar camo top",
    "10067": "Polar camo legs",
    "10069": "Spotted cape",
    "10071": "Spottier cape",
    "10075": "Gloves of silence",
    "10077": "Spiky vambraces",
    "10079": "Green spiky vambraces",
    "10081": "Blue spiky vambraces",
    "10083": "Red spiky vambraces",
    "10085": "Black spiky vambraces",
    "10087": "Stripy feather",
    "10088": "Red feather",
    "10089": "Blue feather",
    "10090": "Yellow feather",
    "10091": "Orange feather",
    "10093": "Tatty larupia fur",
    "10095": "Larupia fur",
    "10097": "Tatty graahk fur",
    "10099": "Graahk fur",
    "10101": "Tatty kyatt fur",
    "10103": "Kyatt fur",
    "10105": "Kebbit spike",
    "10107": "Long kebbit spike",
    "10109": "Kebbit teeth",
    "10111": "Kebbit teeth dust",
    "10113": "Kebbit claws",
    "10115": "Dark kebbit fur",
    "10117": "Polar kebbit fur",
    "10119": "Feldip weasel fur",
    "10121": "Common kebbit fur",
    "10123": "Desert devil fur",
    "10125": "Spotted kebbit fur",
    "10127": "Dashing kebbit fur",
    "10129": "Barb-tail harpoon",
    "10132": "Strung rabbit foot",
    "10134": "Rabbit foot",
    "10136": "Rainbow fish",
    "10138": "Raw rainbow fish",
    "10142": "Guam tar",
    "10143": "Marrentill tar",
    "10144": "Tarromin tar",
    "10145": "Harralander tar",
    "10146": "Orange salamander",
    "10147": "Red salamander",
    "10148": "Black salamander",
    "10149": "Swamp lizard",
    "10150": "Noose wand",
    "10156": "Hunters' crossbow",
    "10158": "Kebbit bolts",
    "10159": "Long kebbit bolts",
    "10280": "Willow comp bow",
    "10282": "Yew comp bow",
    "10284": "Magic comp bow",
    "10286": "Rune helm (h1)",
    "10288": "Rune helm (h2)",
    "10290": "Rune helm (h3)",
    "10292": "Rune helm (h4)",
    "10294": "Rune helm (h5)",
    "10296": "Adamant helm (h1)",
    "10298": "Adamant helm (h2)",
    "10300": "Adamant helm (h3)",
    "10302": "Adamant helm (h4)",
    "10304": "Adamant helm (h5)",
    "10306": "Black helm (h1)",
    "10308": "Black helm (h2)",
    "10310": "Black helm (h3)",
    "10312": "Black helm (h4)",
    "10314": "Black helm (h5)",
    "10316": "Bob's red shirt",
    "10318": "Bob's blue shirt",
    "10320": "Bob's green shirt",
    "10322": "Bob's black shirt",
    "10324": "Bob's purple shirt",
    "10326": "Purple firelighter",
    "10327": "White firelighter",
    "10330": "3rd age range top",
    "10332": "3rd age range legs",
    "10334": "3rd age range coif",
    "10336": "3rd age vambraces",
    "10338": "3rd age robe top",
    "10340": "3rd age robe",
    "10342": "3rd age mage hat",
    "10344": "3rd age amulet",
    "10346": "3rd age platelegs",
    "10348": "3rd age platebody",
    "10350": "3rd age full helmet",
    "10352": "3rd age kiteshield",
    "10354": "Amulet of glory (t4)",
    "10362": "Amulet of glory (t)",
    "10364": "Strength amulet (t)",
    "10366": "Amulet of magic (t)",
    "10368": "Zamorak bracers",
    "10370": "Zamorak d'hide body",
    "10372": "Zamorak chaps",
    "10374": "Zamorak coif",
    "10376": "Guthix bracers",
    "10378": "Guthix d'hide body",
    "10380": "Guthix chaps",
    "10382": "Guthix coif",
    "10384": "Saradomin bracers",
    "10386": "Saradomin d'hide body",
    "10388": "Saradomin chaps",
    "10390": "Saradomin coif",
    "10392": "A powdered wig",
    "10394": "Flared trousers",
    "10396": "Pantaloons",
    "10398": "Sleeping cap",
    "10400": "Black elegant shirt",
    "10402": "Black elegant legs",
    "10404": "Red elegant shirt",
    "10406": "Red elegant legs",
    "10408": "Blue elegant shirt",
    "10410": "Blue elegant legs",
    "10412": "Green elegant shirt",
    "10414": "Green elegant legs",
    "10416": "Purple elegant shirt",
    "10418": "Purple elegant legs",
    "10420": "White elegant blouse",
    "10422": "White elegant skirt",
    "10424": "Red elegant blouse",
    "10426": "Red elegant skirt",
    "10428": "Blue elegant blouse",
    "10430": "Blue elegant skirt",
    "10432": "Green elegant blouse",
    "10434": "Green elegant skirt",
    "10436": "Purple elegant blouse",
    "10438": "Purple elegant skirt",
    "10440": "Saradomin crozier",
    "10442": "Guthix crozier",
    "10444": "Zamorak crozier",
    "10446": "Saradomin cloak",
    "10448": "Guthix cloak",
    "10450": "Zamorak cloak",
    "10452": "Saradomin mitre",
    "10454": "Guthix mitre",
    "10456": "Zamorak mitre",
    "10458": "Saradomin robe top",
    "10460": "Zamorak robe top",
    "10462": "Guthix robe top",
    "10464": "Saradomin robe legs",
    "10466": "Guthix robe legs",
    "10468": "Zamorak robe legs",
    "10470": "Saradomin stole",
    "10472": "Guthix stole",
    "10474": "Zamorak stole",
    "10476": "Purple sweets",
    "10496": "Polished buttons",
    "10564": "Granite body",
    "10589": "Granite helm",
    "10808": "Arctic pyre logs",
    "10810": "Arctic pine logs",
    "10812": "Split log",
    "10814": "Hair",
    "10816": "Raw yak meat",
    "10818": "Yak-hide",
    "10820": "Cured yak-hide",
    "10822": "Yak-hide armour (top)",
    "10824": "Yak-hide armour (legs)",
    "10826": "Neitiznot shield",
    "10828": "Helm of neitiznot",
    "10891": "Wooden cat",
    "10925": "Sanfew serum(4)",
    "10927": "Sanfew serum(3)",
    "10929": "Sanfew serum(2)",
    "10931": "Sanfew serum(1)",
    "10937": "Nail beast nails",
    "10952": "Slayer bell",
    "10954": "Frog-leather body",
    "10956": "Frog-leather chaps",
    "10958": "Frog-leather boots",
    "10973": "Light orb",
    "10978": "Swamp weed",
    "10981": "Cave goblin wire",
    "10999": "Goblin book",
    "11037": "Brine sabre",
    "11061": "Ancient mace",
    "11065": "Bracelet mould",
    "11069": "Gold bracelet",
    "11072": "Sapphire bracelet",
    "11074": "Bracelet of clay",
    "11076": "Emerald bracelet",
    "11079": "Castle wars bracelet(3)",
    "11085": "Ruby bracelet",
    "11088": "Inoculation bracelet",
    "11090": "Phoenix necklace",
    "11092": "Diamond bracelet",
    "11095": "Abyssal bracelet(5)",
    "11105": "Skills necklace(4)",
    "11113": "Skills necklace",
    "11115": "Dragonstone bracelet",
    "11118": "Combat bracelet(4)",
    "11126": "Combat bracelet",
    "11128": "Berserker necklace",
    "11130": "Onyx bracelet",
    "11133": "Regen bracelet",
    "11200": "Dwarven helmet",
    "11205": "Shrunk ogleroot",
    "11212": "Dragon arrow",
    "11227": "Dragon arrow(p)",
    "11228": "Dragon arrow(p+)",
    "11229": "Dragon arrow(p++)",
    "11230": "Dragon dart",
    "11231": "Dragon dart(p)",
    "11232": "Dragon dart tip",
    "11233": "Dragon dart(p+)",
    "11234": "Dragon dart(p++)",
    "11235": "Dark bow",
    "11237": "Dragon arrowtips",
    "11238": "Baby impling jar",
    "11240": "Young impling jar",
    "11242": "Gourmet impling jar",
    "11244": "Earth impling jar",
    "11246": "Essence impling jar",
    "11248": "Eclectic impling jar",
    "11250": "Nature impling jar",
    "11252": "Magpie impling jar",
    "11254": "Ninja impling jar",
    "11256": "Dragon impling jar",
    "11260": "Impling jar",
    "11280": "Cavalier mask",
    "11284": "Dragonfire shield",
    "11286": "Draconic visage",
    "11324": "Roe",
    "11326": "Caviar",
    "11328": "Leaping trout",
    "11330": "Leaping salmon",
    "11332": "Leaping sturgeon",
    "11334": "Fish offcuts",
    "11335": "Dragon full helm",
    "11367": "Bronze hasta",
    "11369": "Iron hasta",
    "11371": "Steel hasta",
    "11373": "Mithril hasta",
    "11375": "Adamant hasta",
    "11377": "Rune hasta",
    "11379": "Bronze hasta(p)",
    "11382": "Bronze hasta(p+)",
    "11384": "Bronze hasta(p++)",
    "11386": "Iron hasta(p)",
    "11389": "Iron hasta(p+)",
    "11391": "Iron hasta(p++)",
    "11393": "Steel hasta(p)",
    "11396": "Steel hasta(p+)",
    "11398": "Steel hasta(p++)",
    "11400": "Mithril hasta(p)",
    "11403": "Mithril hasta(p+)",
    "11405": "Mithril hasta(p++)",
    "11407": "Adamant hasta(p)",
    "11410": "Adamant hasta(p+)",
    "11412": "Adamant hasta(p++)",
    "11414": "Rune hasta(p)",
    "11417": "Rune hasta(p+)",
    "11419": "Rune hasta(p++)",
    "11429": "Attack mix(2)",
    "11431": "Attack mix(1)",
    "11433": "Antipoison mix(2)",
    "11435": "Antipoison mix(1)",
    "11437": "Relicym's mix(2)",
    "11439": "Relicym's mix(1)",
    "11441": "Strength mix(1)",
    "11443": "Strength mix(2)",
    "11445": "Combat mix(2)",
    "11447": "Combat mix(1)",
    "11449": "Restore mix(2)",
    "11451": "Restore mix(1)",
    "11453": "Energy mix(2)",
    "11455": "Energy mix(1)",
    "11457": "Defence mix(2)",
    "11459": "Defence mix(1)",
    "11461": "Agility mix(2)",
    "11463": "Agility mix(1)",
    "11465": "Prayer mix(2)",
    "11467": "Prayer mix(1)",
    "11469": "Superattack mix(2)",
    "11471": "Superattack mix(1)",
    "11473": "Anti-poison supermix(2)",
    "11475": "Anti-poison supermix(1)",
    "11477": "Fishing mix(2)",
    "11479": "Fishing mix(1)",
    "11481": "Super energy mix(2)",
    "11483": "Super energy mix(1)",
    "11485": "Super str. mix(2)",
    "11487": "Super str. mix(1)",
    "11489": "Magic essence mix(2)",
    "11491": "Magic essence mix(1)",
    "11493": "Super restore mix(2)",
    "11495": "Super restore mix(1)",
    "11497": "Super def. mix(2)",
    "11499": "Super def. mix(1)",
    "11501": "Antidote+ mix(2)",
    "11503": "Antidote+ mix(1)",
    "11505": "Antifire mix(2)",
    "11507": "Antifire mix(1)",
    "11509": "Ranging mix(2)",
    "11511": "Ranging mix(1)",
    "11513": "Magic mix(2)",
    "11515": "Magic mix(1)",
    "11517": "Hunting mix(2)",
    "11519": "Hunting mix(1)",
    "11521": "Zamorak mix(2)",
    "11523": "Zamorak mix(1)",
    "11785": "Armadyl crossbow",
    "11787": "Steam battlestaff",
    "11789": "Mystic steam staff",
    "11791": "Staff of the dead",
    "11798": "Godsword blade",
    "11802": "Armadyl godsword",
    "11804": "Bandos godsword",
    "11806": "Saradomin godsword",
    "11808": "Zamorak godsword",
    "11810": "Armadyl hilt",
    "11812": "Bandos hilt",
    "11814": "Saradomin hilt",
    "11816": "Zamorak hilt",
    "11818": "Godsword shard 1",
    "11820": "Godsword shard 2",
    "11822": "Godsword shard 3",
    "11824": "Zamorakian spear",
    "11826": "Armadyl helmet",
    "11828": "Armadyl chestplate",
    "11830": "Armadyl chainskirt",
    "11832": "Bandos chestplate",
    "11834": "Bandos tassets",
    "11836": "Bandos boots",
    "11838": "Saradomin sword",
    "11840": "Dragon boots",
    "11874": "Broad arrowheads",
    "11875": "Broad bolts",
    "11876": "Unfinished broad bolts",
    "11889": "Zamorakian hasta",
    "11902": "Leaf-bladed sword",
    "11905": "Trident of the seas (full)",
    "11908": "Uncharged trident",
    "11920": "Dragon pickaxe",
    "11924": "Malediction ward",
    "11926": "Odium ward",
    "11928": "Odium shard 1",
    "11929": "Odium shard 2",
    "11930": "Odium shard 3",
    "11931": "Malediction shard 1",
    "11932": "Malediction shard 2",
    "11933": "Malediction shard 3",
    "11934": "Raw dark crab",
    "11936": "Dark crab",
    "11940": "Dark fishing bait",
    "11943": "Lava dragon bones",
    "11951": "Extended antifire(4)",
    "11953": "Extended antifire(3)",
    "11955": "Extended antifire(2)",
    "11957": "Extended antifire(1)",
    "11959": "Black chinchompa",
    "11960": "Extended antifire mix(2)",
    "11962": "Extended antifire mix(1)",
    "11964": "Amulet of glory (t6)",
    "11968": "Skills necklace(6)",
    "11972": "Combat bracelet(6)",
    "11978": "Amulet of glory(6)",
    "11980": "Ring of wealth (5)",
    "11990": "Fedora",
    "11992": "Lava scale",
    "11994": "Lava scale shard",
    "11998": "Smoke battlestaff",
    "12000": "Mystic smoke staff",
    "12002": "Occult necklace",
    "12004": "Kraken tentacle",
    "12007": "Jar of dirt",
    "12193": "Ancient robe top",
    "12195": "Ancient robe legs",
    "12197": "Ancient cloak",
    "12199": "Ancient crozier",
    "12201": "Ancient stole",
    "12203": "Ancient mitre",
    "12205": "Bronze platebody (g)",
    "12207": "Bronze platelegs (g)",
    "12209": "Bronze plateskirt (g)",
    "12211": "Bronze full helm (g)",
    "12213": "Bronze kiteshield (g)",
    "12215": "Bronze platebody (t)",
    "12217": "Bronze platelegs (t)",
    "12219": "Bronze plateskirt (t)",
    "12221": "Bronze full helm (t)",
    "12223": "Bronze kiteshield (t)",
    "12225": "Iron platebody (t)",
    "12227": "Iron platelegs (t)",
    "12229": "Iron plateskirt (t)",
    "12231": "Iron full helm (t)",
    "12233": "Iron kiteshield (t)",
    "12235": "Iron platebody (g)",
    "12237": "Iron platelegs (g)",
    "12239": "Iron plateskirt (g)",
    "12241": "Iron full helm (g)",
    "12243": "Iron kiteshield (g)",
    "12245": "Beanie",
    "12247": "Red beret",
    "12249": "Imp mask",
    "12251": "Goblin mask",
    "12253": "Armadyl robe top",
    "12255": "Armadyl robe legs",
    "12257": "Armadyl stole",
    "12259": "Armadyl mitre",
    "12261": "Armadyl cloak",
    "12263": "Armadyl crozier",
    "12265": "Bandos robe top",
    "12267": "Bandos robe legs",
    "12269": "Bandos stole",
    "12271": "Bandos mitre",
    "12273": "Bandos cloak",
    "12275": "Bandos crozier",
    "12277": "Mithril platebody (g)",
    "12279": "Mithril platelegs (g)",
    "12281": "Mithril kiteshield (g)",
    "12283": "Mithril full helm (g)",
    "12285": "Mithril plateskirt (g)",
    "12287": "Mithril platebody (t)",
    "12289": "Mithril platelegs (t)",
    "12291": "Mithril kiteshield (t)",
    "12293": "Mithril full helm (t)",
    "12295": "Mithril plateskirt (t)",
    "12297": "Black pickaxe",
    "12299": "White headband",
    "12301": "Blue headband",
    "12303": "Gold headband",
    "12305": "Pink headband",
    "12307": "Green headband",
    "12309": "Pink boater",
    "12311": "Purple boater",
    "12313": "White boater",
    "12315": "Pink elegant shirt",
    "12317": "Pink elegant legs",
    "12319": "Crier hat",
    "12321": "White cavalier",
    "12323": "Red cavalier",
    "12325": "Navy cavalier",
    "12327": "Red d'hide body (g)",
    "12329": "Red d'hide chaps (g)",
    "12331": "Red d'hide body (t)",
    "12333": "Red d'hide chaps (t)",
    "12335": "Briefcase",
    "12337": "Sagacious spectacles",
    "12339": "Pink elegant blouse",
    "12341": "Pink elegant skirt",
    "12343": "Gold elegant blouse",
    "12345": "Gold elegant skirt",
    "12347": "Gold elegant shirt",
    "12349": "Gold elegant legs",
    "12351": "Musketeer hat",
    "12353": "Monocle",
    "12355": "Big pirate hat",
    "12357": "Katana",
    "12359": "Leprechaun hat",
    "12361": "Cat mask",
    "12363": "Bronze dragon mask",
    "12365": "Iron dragon mask",
    "12367": "Steel dragon mask",
    "12369": "Mithril dragon mask",
    "12371": "Lava dragon mask",
    "12373": "Dragon cane",
    "12375": "Black cane",
    "12377": "Adamant cane",
    "12379": "Rune cane",
    "12381": "Black d'hide body (g)",
    "12383": "Black d'hide chaps (g)",
    "12385": "Black d'hide body (t)",
    "12387": "Black d'hide chaps (t)",
    "12389": "Gilded scimitar",
    "12391": "Gilded boots",
    "12393": "Royal gown top",
    "12395": "Royal gown bottom",
    "12397": "Royal crown",
    "12399": "Partyhat & specs",
    "12402": "Nardah teleport",
    "12403": "Digsite teleport",
    "12404": "Feldip hills teleport",
    "12405": "Lunar isle teleport",
    "12406": "Mort'ton teleport",
    "12407": "Pest control teleport",
    "12408": "Piscatoris teleport",
    "12409": "Tai bwo wannai teleport",
    "12410": "Iorwerth camp teleport",
    "12411": "Mos le'harmless teleport",
    "12412": "Pirate hat & patch",
    "12422": "3rd age wand",
    "12424": "3rd age bow",
    "12426": "3rd age longsword",
    "12428": "Penguin mask",
    "12430": "Afro",
    "12432": "Top hat",
    "12434": "Top hat & monocle",
    "12437": "3rd age cloak",
    "12439": "Royal sceptre",
    "12441": "Musketeer tabard",
    "12443": "Musketeer pants",
    "12445": "Black skirt (g)",
    "12447": "Black skirt (t)",
    "12449": "Black wizard robe (g)",
    "12451": "Black wizard robe (t)",
    "12453": "Black wizard hat (g)",
    "12455": "Black wizard hat (t)",
    "12460": "Ancient platebody",
    "12462": "Ancient platelegs",
    "12464": "Ancient plateskirt",
    "12466": "Ancient full helm",
    "12468": "Ancient kiteshield",
    "12470": "Armadyl platebody",
    "12472": "Armadyl platelegs",
    "12474": "Armadyl plateskirt",
    "12476": "Armadyl full helm",
    "12478": "Armadyl kiteshield",
    "12480": "Bandos platebody",
    "12482": "Bandos platelegs",
    "12484": "Bandos plateskirt",
    "12486": "Bandos full helm",
    "12488": "Bandos kiteshield",
    "12490": "Ancient bracers",
    "12492": "Ancient d'hide body",
    "12494": "Ancient chaps",
    "12496": "Ancient coif",
    "12498": "Bandos bracers",
    "12500": "Bandos d'hide body",
    "12502": "Bandos chaps",
    "12504": "Bandos coif",
    "12506": "Armadyl bracers",
    "12508": "Armadyl d'hide body",
    "12510": "Armadyl chaps",
    "12512": "Armadyl coif",
    "12514": "Explorer backpack",
    "12516": "Pith helmet",
    "12518": "Green dragon mask",
    "12520": "Blue dragon mask",
    "12522": "Red dragon mask",
    "12524": "Black dragon mask",
    "12526": "Fury ornament kit",
    "12528": "Dark infinity colour kit",
    "12530": "Light infinity colour kit",
    "12532": "Dragon sq shield ornament kit",
    "12534": "Dragon chainbody ornament kit",
    "12536": "Dragon legs/skirt ornament kit",
    "12538": "Dragon full helm ornament kit",
    "12540": "Deerstalker",
    "12596": "Rangers' tunic",
    "12598": "Holy sandals",
    "12601": "Ring of the gods",
    "12603": "Tyrannical ring",
    "12605": "Treasonous ring",
    "12613": "Bandos page 1",
    "12614": "Bandos page 2",
    "12615": "Bandos page 3",
    "12616": "Bandos page 4",
    "12617": "Armadyl page 1",
    "12618": "Armadyl page 2",
    "12619": "Armadyl page 3",
    "12620": "Armadyl page 4",
    "12621": "Ancient page 1",
    "12622": "Ancient page 2",
    "12623": "Ancient page 3",
    "12624": "Ancient page 4",
    "12625": "Stamina potion(4)",
    "12627": "Stamina potion(3)",
    "12629": "Stamina potion(2)",
    "12631": "Stamina potion(1)",
    "12633": "Stamina mix(2)",
    "12635": "Stamina mix(1)",
    "12640": "Amylase crystal",
    "12642": "Lumberyard teleport",
    "12695": "Super combat potion(4)",
    "12697": "Super combat potion(3)",
    "12699": "Super combat potion(2)",
    "12701": "Super combat potion(1)",
    "12757": "Blue dark bow paint",
    "12759": "Green dark bow paint",
    "12761": "Yellow dark bow paint",
    "12763": "White dark bow paint",
    "12769": "Frozen whip mix",
    "12771": "Volcanic whip mix",
    "12775": "Annakarl teleport (tablet)",
    "12776": "Carrallanger teleport (tablet)",
    "12777": "Dareeyak teleport (tablet)",
    "12778": "Ghorrock teleport (tablet)",
    "12779": "Kharyrll teleport (tablet)",
    "12780": "Lassar teleport (tablet)",
    "12781": "Paddewwa teleport (tablet)",
    "12782": "Senntisten teleport (tablet)",
    "12783": "Ring of wealth scroll",
    "12786": "Magic shortbow scroll",
    "12789": "Clue box",
    "12798": "Steam staff upgrade kit",
    "12800": "Dragon pickaxe upgrade kit",
    "12802": "Ward upgrade kit",
    "12804": "Saradomin's tear",
    "12817": "Elysian spirit shield",
    "12819": "Elysian sigil",
    "12821": "Spectral spirit shield",
    "12823": "Spectral sigil",
    "12825": "Arcane spirit shield",
    "12827": "Arcane sigil",
    "12829": "Spirit shield",
    "12831": "Blessed spirit shield",
    "12833": "Holy elixir",
    "12846": "Target teleport scroll",
    "12849": "Granite clamp",
    "12851": "Amulet of the damned (full)",
    "12863": "Dwarf cannon set",
    "12865": "Green dragonhide set",
    "12867": "Blue dragonhide set",
    "12869": "Red dragonhide set",
    "12871": "Black dragonhide set",
    "12873": "Guthan's armour set",
    "12875": "Verac's armour set",
    "12877": "Dharok's armour set",
    "12879": "Torag's armour set",
    "12881": "Ahrim's armour set",
    "12883": "Karil's armour set",
    "12885": "Jar of sand",
    "12900": "Uncharged toxic trident",
    "12902": "Toxic staff (uncharged)",
    "12905": "Anti-venom(4)",
    "12907": "Anti-venom(3)",
    "12909": "Anti-venom(2)",
    "12911": "Anti-venom(1)",
    "12913": "Anti-venom+(4)",
    "12915": "Anti-venom+(3)",
    "12917": "Anti-venom+(2)",
    "12919": "Anti-venom+(1)",
    "12922": "Tanzanite fang",
    "12924": "Toxic blowpipe (empty)",
    "12927": "Serpentine visage",
    "12929": "Serpentine helm (uncharged)",
    "12932": "Magic fang",
    "12934": "Zulrah's scales",
    "12936": "Jar of swamp",
    "12938": "Zul-andra teleport",
    "12960": "Bronze set (lg)",
    "12962": "Bronze set (sk)",
    "12964": "Bronze trimmed set (lg)",
    "12966": "Bronze trimmed set (sk)",
    "12968": "Bronze gold-trimmed set (lg)",
    "12970": "Bronze gold-trimmed set (sk)",
    "12972": "Iron set (lg)",
    "12974": "Iron set (sk)",
    "12976": "Iron trimmed set (lg)",
    "12978": "Iron trimmed set (sk)",
    "12980": "Iron gold-trimmed set (lg)",
    "12982": "Iron gold-trimmed set (sk)",
    "12984": "Steel set (lg)",
    "12986": "Steel set (sk)",
    "12988": "Black set (lg)",
    "12990": "Black set (sk)",
    "12992": "Black trimmed set (lg)",
    "12994": "Black trimmed set (sk)",
    "12996": "Black gold-trimmed set (lg)",
    "12998": "Black gold-trimmed set (sk)",
    "13000": "Mithril set (lg)",
    "13002": "Mithril set (sk)",
    "13004": "Mithril trimmed set (lg)",
    "13006": "Mithril trimmed set (sk)",
    "13008": "Mithril gold-trimmed set (lg)",
    "13010": "Mithril gold-trimmed set (sk)",
    "13012": "Adamant set (lg)",
    "13014": "Adamant set (sk)",
    "13016": "Adamant trimmed set (lg)",
    "13018": "Adamant trimmed set (sk)",
    "13020": "Adamant gold-trimmed set (lg)",
    "13022": "Adamant gold-trimmed set (sk)",
    "13024": "Rune armour set (lg)",
    "13026": "Rune armour set (sk)",
    "13028": "Rune trimmed set (lg)",
    "13030": "Rune trimmed set (sk)",
    "13032": "Rune gold-trimmed set (lg)",
    "13034": "Rune gold-trimmed set (sk)",
    "13036": "Gilded armour set (lg)",
    "13038": "Gilded armour set (sk)",
    "13040": "Saradomin armour set (lg)",
    "13042": "Saradomin armour set (sk)",
    "13044": "Zamorak armour set (lg)",
    "13046": "Zamorak armour set (sk)",
    "13048": "Guthix armour set (lg)",
    "13050": "Guthix armour set (sk)",
    "13052": "Armadyl rune armour set (lg)",
    "13054": "Armadyl rune armour set (sk)",
    "13056": "Bandos rune armour set (lg)",
    "13058": "Bandos rune armour set (sk)",
    "13060": "Ancient rune armour set (lg)",
    "13062": "Ancient rune armour set (sk)",
    "13064": "Combat potion set",
    "13066": "Super potion set",
    "13149": "Holy book page set",
    "13151": "Unholy book page set",
    "13153": "Book of balance page set",
    "13155": "Book of war page set",
    "13157": "Book of law page set",
    "13159": "Book of darkness page set",
    "13161": "Zamorak dragonhide set",
    "13163": "Saradomin dragonhide set",
    "13165": "Guthix dragonhide set",
    "13167": "Bandos dragonhide set",
    "13169": "Armadyl dragonhide set",
    "13171": "Ancient dragonhide set",
    "13173": "Partyhat set",
    "13175": "Halloween mask set",
    "13190": "Old school bond",
    "13227": "Eternal crystal",
    "13229": "Pegasian crystal",
    "13231": "Primordial crystal",
    "13233": "Smouldering stone",
    "13235": "Eternal boots",
    "13237": "Pegasian boots",
    "13239": "Primordial boots",
    "13245": "Jar of souls",
    "13249": "Key master teleport",
    "13256": "Saradomin's light",
    "13263": "Abyssal bludgeon",
    "13265": "Abyssal dagger",
    "13267": "Abyssal dagger (p)",
    "13269": "Abyssal dagger (p+)",
    "13271": "Abyssal dagger (p++)",
    "13277": "Jar of miasma",
    "13383": "Xerician fabric",
    "13385": "Xerician hat",
    "13387": "Xerician top",
    "13389": "Xerician robe",
    "13391": "Lizardman fang",
    "13421": "Saltpetre",
    "13431": "Sandworms",
    "13439": "Raw anglerfish",
    "13441": "Anglerfish",
    "13448": "Ensouled goblin head",
    "13451": "Ensouled monkey head",
    "13454": "Ensouled imp head",
    "13457": "Ensouled minotaur head",
    "13460": "Ensouled scorpion head",
    "13463": "Ensouled bear head",
    "13466": "Ensouled unicorn head",
    "13469": "Ensouled dog head",
    "13472": "Ensouled chaos druid head",
    "13475": "Ensouled giant head",
    "13478": "Ensouled ogre head",
    "13481": "Ensouled elf head",
    "13484": "Ensouled troll head",
    "13487": "Ensouled horror head",
    "13490": "Ensouled kalphite head",
    "13493": "Ensouled dagannoth head",
    "13496": "Ensouled bloodveld head",
    "13499": "Ensouled tzhaar head",
    "13502": "Ensouled demon head",
    "13505": "Ensouled aviansie head",
    "13508": "Ensouled abyssal head",
    "13511": "Ensouled dragon head",
    "13573": "Dynamite",
    "13576": "Dragon warhammer",
    "13652": "Dragon claws",
    "13657": "Grape seed",
    "13658": "Teleport card",
    "19478": "Light ballista",
    "19481": "Heavy ballista",
    "19484": "Dragon javelin",
    "19486": "Dragon javelin(p)",
    "19488": "Dragon javelin(p+)",
    "19490": "Dragon javelin(p++)",
    "19493": "Zenyte",
    "19496": "Uncut zenyte",
    "19501": "Zenyte amulet (u)",
    "19529": "Zenyte shard",
    "19532": "Zenyte bracelet",
    "19535": "Zenyte necklace",
    "19538": "Zenyte ring",
    "19541": "Zenyte amulet",
    "19544": "Tormented bracelet",
    "19547": "Necklace of anguish",
    "19550": "Ring of suffering",
    "19553": "Amulet of torture",
    "19570": "Bronze javelin tips",
    "19572": "Iron javelin tips",
    "19574": "Steel javelin tips",
    "19576": "Mithril javelin tips",
    "19578": "Adamant javelin tips",
    "19580": "Rune javelin tips",
    "19582": "Dragon javelin tips",
    "19584": "Javelin shaft",
    "19586": "Light frame",
    "19589": "Heavy frame",
    "19592": "Ballista limbs",
    "19595": "Incomplete light ballista",
    "19598": "Incomplete heavy ballista",
    "19601": "Ballista spring",
    "19604": "Unstrung light ballista",
    "19607": "Unstrung heavy ballista",
    "19610": "Monkey tail",
    "19613": "Arceuus library teleport (tablet)",
    "19615": "Draynor manor teleport (tablet)",
    "19617": "Mind altar teleport (tablet)",
    "19619": "Salve graveyard teleport (tablet)",
    "19621": "Fenkenstrain's castle teleport (tablet)",
    "19623": "West ardougne teleport (tablet)",
    "19625": "Harmony island teleport (tablet)",
    "19627": "Cemetery teleport (tablet)",
    "19629": "Barrows teleport (tablet)",
    "19631": "Ape atoll teleport (tablet)",
    "19653": "Golovanova fruit top",
    "19656": "Uncooked botanical pie",
    "19662": "Botanical pie",
    "19665": "Damaged monkey tail",
    "19669": "Redwood logs",
    "19672": "Redwood pyre logs",
    "19701": "Jar of darkness",
    "19707": "Amulet of eternal glory",
    "19724": "Left eye patch",
    "19727": "Double eye patch",
    "19912": "Zombie head (Treasure Trails)",
    "19915": "Cyclops head",
    "19918": "Nunchaku",
    "19921": "Ancient d'hide boots",
    "19924": "Bandos d'hide boots",
    "19927": "Guthix d'hide boots",
    "19930": "Armadyl d'hide boots",
    "19933": "Saradomin d'hide boots",
    "19936": "Zamorak d'hide boots",
    "19943": "Arceuus scarf",
    "19946": "Hosidius scarf",
    "19949": "Lovakengj scarf",
    "19952": "Piscarilius scarf",
    "19955": "Shayzien scarf",
    "19958": "Dark tuxedo jacket",
    "19961": "Dark tuxedo cuffs",
    "19964": "Dark trousers",
    "19967": "Dark tuxedo shoes",
    "19970": "Dark bow tie",
    "19973": "Light tuxedo jacket",
    "19976": "Light tuxedo cuffs",
    "19979": "Light trousers",
    "19982": "Light tuxedo shoes",
    "19985": "Light bow tie",
    "19988": "Blacksmith's helm",
    "19991": "Bucket helm",
    "19994": "Ranger gloves",
    "19997": "Holy wraps",
    "20002": "Dragon scimitar ornament kit",
    "20005": "Ring of nature",
    "20008": "Fancy tiara",
    "20011": "3rd age axe",
    "20014": "3rd age pickaxe",
    "20017": "Ring of coins",
    "20020": "Lesser demon mask",
    "20023": "Greater demon mask",
    "20026": "Black demon mask",
    "20029": "Old demon mask",
    "20032": "Jungle demon mask",
    "20035": "Samurai kasa",
    "20038": "Samurai shirt",
    "20041": "Samurai gloves",
    "20044": "Samurai greaves",
    "20047": "Samurai boots",
    "20050": "Obsidian cape (r)",
    "20053": "Half moon spectacles",
    "20056": "Ale of the gods",
    "20059": "Bucket helm (g)",
    "20062": "Torture ornament kit",
    "20065": "Occult ornament kit",
    "20068": "Armadyl godsword ornament kit",
    "20071": "Bandos godsword ornament kit",
    "20074": "Saradomin godsword ornament kit",
    "20077": "Zamorak godsword ornament kit",
    "20080": "Mummy's head",
    "20083": "Mummy's body",
    "20086": "Mummy's hands",
    "20089": "Mummy's legs",
    "20092": "Mummy's feet",
    "20095": "Ankou mask",
    "20098": "Ankou top",
    "20101": "Ankou gloves",
    "20104": "Ankou's leggings",
    "20107": "Ankou socks",
    "20110": "Bowl wig",
    "20113": "Arceuus hood",
    "20116": "Hosidius hood",
    "20119": "Lovakengj hood",
    "20122": "Piscarilius hood",
    "20125": "Shayzien hood",
    "20128": "Hood of darkness",
    "20131": "Robe top of darkness",
    "20134": "Gloves of darkness",
    "20137": "Robe bottom of darkness",
    "20140": "Boots of darkness",
    "20143": "Dragon defender ornament kit",
    "20146": "Gilded med helm",
    "20149": "Gilded chainbody",
    "20152": "Gilded sq shield",
    "20155": "Gilded 2h sword",
    "20158": "Gilded spear",
    "20161": "Gilded hasta",
    "20166": "Wooden shield (g)",
    "20169": "Steel platebody (g)",
    "20172": "Steel platelegs (g)",
    "20175": "Steel plateskirt (g)",
    "20178": "Steel full helm (g)",
    "20181": "Steel kiteshield (g)",
    "20184": "Steel platebody (t)",
    "20187": "Steel platelegs (t)",
    "20190": "Steel plateskirt (t)",
    "20193": "Steel full helm (t)",
    "20196": "Steel kiteshield (t)",
    "20199": "Monk's robe top (g)",
    "20202": "Monk's robe (g)",
    "20205": "Golden chef's hat",
    "20208": "Golden apron",
    "20211": "Team cape zero",
    "20214": "Team cape x",
    "20217": "Team cape i",
    "20220": "Holy blessing",
    "20223": "Unholy blessing",
    "20226": "Peaceful blessing",
    "20229": "Honourable blessing",
    "20232": "War blessing",
    "20235": "Ancient blessing",
    "20238": "Charge dragonstone jewellery scroll",
    "20240": "Crier coat",
    "20243": "Crier bell",
    "20246": "Black leprechaun hat",
    "20251": "Arceuus banner",
    "20254": "Hosidius banner",
    "20257": "Lovakengj banner",
    "20260": "Piscarilius banner",
    "20263": "Shayzien banner",
    "20266": "Black unicorn mask",
    "20269": "White unicorn mask",
    "20272": "Cabbage round shield",
    "20275": "Gnomish firelighter",
    "20376": "Steel trimmed set (lg)",
    "20379": "Steel trimmed set (sk)",
    "20382": "Steel gold-trimmed set (lg)",
    "20385": "Steel gold-trimmed set (sk)",
    "20433": "Evil chicken feet",
    "20436": "Evil chicken wings",
    "20439": "Evil chicken head",
    "20442": "Evil chicken legs",
    "20517": "Elder chaos top",
    "20520": "Elder chaos robe",
    "20590": "Stale baguette",
    "20595": "Elder chaos hood",
    "20716": "Tome of fire (empty)",
    "20718": "Burnt page",
    "20724": "Imbued heart",
    "20727": "Leaf-bladed battleaxe",
    "20730": "Mist battlestaff",
    "20733": "Mystic mist staff",
    "20736": "Dust battlestaff",
    "20739": "Mystic dust staff",
    "20749": "Zamorak's grapes",
    "20756": "Hill giant club",
    "20849": "Dragon thrownaxe",
    "20997": "Twisted bow",
    "21000": "Twisted buckler",
    "21003": "Elder maul",
    "21006": "Kodai wand",
    "21009": "Dragon sword",
    "21012": "Dragon hunter crossbow",
    "21015": "Dinh's bulwark",
    "21018": "Ancestral hat",
    "21021": "Ancestral robe top",
    "21024": "Ancestral robe bottom",
    "21028": "Dragon harpoon",
    "21034": "Dexterous prayer scroll",
    "21043": "Kodai insignia",
    "21047": "Torn prayer scroll",
    "21049": "Ancestral robes set",
    "21079": "Arcane prayer scroll",
    "21081": "Opal ring",
    "21084": "Jade ring",
    "21087": "Topaz ring",
    "21090": "Opal necklace",
    "21093": "Jade necklace",
    "21096": "Topaz necklace",
    "21099": "Opal amulet (u)",
    "21102": "Jade amulet (u)",
    "21105": "Topaz amulet (u)",
    "21108": "Opal amulet",
    "21111": "Jade amulet",
    "21114": "Topaz amulet",
    "21117": "Opal bracelet",
    "21120": "Jade bracelet",
    "21123": "Topaz bracelet",
    "21126": "Ring of pursuit",
    "21129": "Ring of returning(5)",
    "21140": "Efaritay's aid",
    "21143": "Dodgy necklace",
    "21146": "Necklace of passage(5)",
    "21157": "Necklace of faith",
    "21160": "Amulet of bounty",
    "21163": "Amulet of chemistry",
    "21166": "Burning amulet(5)",
    "21177": "Expeditious bracelet",
    "21180": "Flamtaer bracelet",
    "21183": "Bracelet of slaughter",
    "21202": "Lava staff upgrade kit",
    "21257": "Slayer's enchantment",
    "21270": "Eternal gem",
    "21279": "Obsidian armour set",
    "21298": "Obsidian helmet",
    "21301": "Obsidian platebody",
    "21304": "Obsidian platelegs",
    "21316": "Amethyst broad bolts",
    "21318": "Amethyst javelin",
    "21320": "Amethyst javelin(p)",
    "21322": "Amethyst javelin(p+)",
    "21324": "Amethyst javelin(p++)",
    "21326": "Amethyst arrow",
    "21332": "Amethyst arrow(p)",
    "21334": "Amethyst arrow(p+)",
    "21336": "Amethyst arrow(p++)",
    "21338": "Amethyst bolt tips",
    "21347": "Amethyst",
    "21350": "Amethyst arrowtips",
    "21352": "Amethyst javelin tips",
    "21387": "Master scroll book (empty)",
    "21477": "Teak sapling",
    "21480": "Mahogany sapling",
    "21483": "Ultracompost",
    "21486": "Teak seed",
    "21488": "Mahogany seed",
    "21490": "Seaweed spore",
    "21504": "Giant seaweed",
    "21512": "Bird house",
    "21515": "Oak bird house",
    "21518": "Willow bird house",
    "21521": "Teak bird house",
    "21543": "Calcite",
    "21545": "Pyrophosphite",
    "21555": "Numulite",
    "21622": "Volcanic ash",
    "21626": "Sulliuscep cap",
    "21634": "Ancient wyvern shield",
    "21637": "Wyvern visage",
    "21643": "Granite boots",
    "21646": "Granite longsword",
    "21649": "Merfolk trident",
    "21652": "Drift net",
    "21684": "Uncooked mushroom pie",
    "21690": "Mushroom pie",
    "21730": "Black tourmaline core",
    "21733": "Guardian boots",
    "21736": "Granite gloves",
    "21739": "Granite ring",
    "21742": "Granite hammer",
    "21745": "Jar of stone",
    "21754": "Rock thrownhammer",
    "21802": "Revenant cave teleport",
    "21804": "Ancient crystal",
    "21807": "Ancient emblem",
    "21810": "Ancient totem",
    "21813": "Ancient statuette",
    "21817": "Bracelet of ethereum (uncharged)",
    "21820": "Revenant ether",
    "21838": "Shaman mask",
    "21880": "Wrath rune",
    "21882": "Dragon armour set (lg)",
    "21885": "Dragon armour set (sk)",
    "21892": "Dragon platebody",
    "21895": "Dragon kiteshield",
    "21902": "Dragon crossbow",
    "21905": "Dragon bolts",
    "21918": "Dragon limbs",
    "21921": "Dragon crossbow (u)",
    "21924": "Dragon bolts (p)",
    "21926": "Dragon bolts (p+)",
    "21928": "Dragon bolts (p++)",
    "21930": "Dragon bolts (unf)",
    "21932": "Opal dragon bolts (e)",
    "21934": "Jade dragon bolts (e)",
    "21936": "Pearl dragon bolts (e)",
    "21938": "Topaz dragon bolts (e)",
    "21940": "Sapphire dragon bolts (e)",
    "21942": "Emerald dragon bolts (e)",
    "21944": "Ruby dragon bolts (e)",
    "21946": "Diamond dragon bolts (e)",
    "21948": "Dragonstone dragon bolts (e)",
    "21950": "Onyx dragon bolts (e)",
    "21952": "Magic stock",
    "21955": "Opal dragon bolts",
    "21957": "Jade dragon bolts",
    "21959": "Pearl dragon bolts",
    "21961": "Topaz dragon bolts",
    "21963": "Sapphire dragon bolts",
    "21965": "Emerald dragon bolts",
    "21967": "Ruby dragon bolts",
    "21969": "Diamond dragon bolts",
    "21971": "Dragonstone dragon bolts",
    "21973": "Onyx dragon bolts",
    "21975": "Crushed superior dragon bones",
    "21978": "Super antifire potion(4)",
    "21981": "Super antifire potion(3)",
    "21984": "Super antifire potion(2)",
    "21987": "Super antifire potion(1)",
    "21994": "Super antifire mix(2)",
    "21997": "Super antifire mix(1)",
    "22003": "Dragonfire ward",
    "22006": "Skeletal visage",
    "22097": "Dragon metal shard",
    "22100": "Dragon metal slice",
    "22103": "Dragon metal lump",
    "22106": "Jar of decay",
    "22111": "Dragonbone necklace",
    "22118": "Wrath talisman",
    "22121": "Wrath tiara",
    "22124": "Superior dragon bones",
    "22192": "Maple bird house",
    "22195": "Mahogany bird house",
    "22198": "Yew bird house",
    "22201": "Magic bird house",
    "22204": "Redwood bird house",
    "22209": "Extended super antifire(4)",
    "22212": "Extended super antifire(3)",
    "22215": "Extended super antifire(2)",
    "22218": "Extended super antifire(1)",
    "22221": "Extended super antifire mix(2)",
    "22224": "Extended super antifire mix(1)",
    "22231": "Dragon boots ornament kit",
    "22236": "Dragon platebody ornament kit",
    "22239": "Dragon kiteshield ornament kit",
    "22246": "Anguish ornament kit",
    "22251": "Oak shield",
    "22254": "Willow shield",
    "22257": "Maple shield",
    "22260": "Yew shield",
    "22263": "Magic shield",
    "22266": "Redwood shield",
    "22269": "Hard leather shield",
    "22272": "Snakeskin shield",
    "22275": "Green d'hide shield",
    "22278": "Blue d'hide shield",
    "22281": "Red d'hide shield",
    "22284": "Black d'hide shield",
    "22290": "Uncharged trident (e)",
    "22294": "Uncharged toxic trident (e)",
    "22296": "Staff of light",
    "22299": "Ancient medallion",
    "22302": "Ancient effigy",
    "22305": "Ancient relic",
    "22324": "Ghrazi rapier",
    "22326": "Justiciar faceguard",
    "22327": "Justiciar chestguard",
    "22328": "Justiciar legguards",
    "22368": "Bryophyta's staff (uncharged)",
    "22372": "Bryophyta's essence",
    "22430": "Bloody bracer",
    "22438": "Justiciar armour set",
    "22443": "Cadantine blood potion (unf)",
    "22446": "Vial of blood",
    "22449": "Battlemage potion(4)",
    "22452": "Battlemage potion(3)",
    "22455": "Battlemage potion(2)",
    "22458": "Battlemage potion(1)",
    "22461": "Bastion potion(4)",
    "22464": "Bastion potion(3)",
    "22467": "Bastion potion(2)",
    "22470": "Bastion potion(1)",
    "22477": "Avernic defender hilt",
    "22481": "Sanguinesti staff (uncharged)",
    "22486": "Scythe of vitur (uncharged)",
    "22542": "Viggora's chainmace (u)",
    "22547": "Craw's bow (u)",
    "22552": "Thammaron's sceptre (u)",
    "22557": "Amulet of avarice",
    "22593": "Te salt",
    "22595": "Efh salt",
    "22597": "Urt salt",
    "22599": "Icy basalt",
    "22601": "Stony basalt",
    "22603": "Basalt",
    "22610": "Vesta's spear",
    "22613": "Vesta's longsword",
    "22616": "Vesta's chainbody",
    "22619": "Vesta's plateskirt",
    "22622": "Statius's warhammer",
    "22625": "Statius's full helm",
    "22628": "Statius's platebody",
    "22631": "Statius's platelegs",
    "22634": "Morrigan's throwing axe",
    "22636": "Morrigan's javelin",
    "22638": "Morrigan's coif",
    "22641": "Morrigan's leather body",
    "22644": "Morrigan's leather chaps",
    "22647": "Zuriel's staff",
    "22650": "Zuriel's hood",
    "22653": "Zuriel's robe top",
    "22656": "Zuriel's robe bottom",
    "22731": "Dragon hasta",
    "22734": "Dragon hasta(p)",
    "22737": "Dragon hasta(p+)",
    "22740": "Dragon hasta(p++)",
    "22780": "Wyrm bones",
    "22783": "Drake bones",
    "22786": "Hydra bones",
    "22789": "Uncooked dragonfruit pie",
    "22795": "Dragonfruit pie",
    "22804": "Dragon knife",
    "22806": "Dragon knife(p)",
    "22808": "Dragon knife(p+)",
    "22810": "Dragon knife(p++)",
    "22818": "Fish chunks",
    "22826": "Bluegill",
    "22829": "Common tench",
    "22832": "Mottled eel",
    "22835": "Greater siren",
    "22856": "Celastrus sapling",
    "22859": "Redwood sapling",
    "22866": "Dragonfruit sapling",
    "22869": "Celastrus seed",
    "22871": "Redwood tree seed",
    "22873": "Potato cactus seed",
    "22877": "Dragonfruit tree seed",
    "22879": "Snape grass seed",
    "22887": "White lily seed",
    "22929": "Dragonfruit",
    "22932": "White lily",
    "22935": "Celastrus bark",
    "22949": "Battlefront teleport (tablet)",
    "22951": "Boots of brimstone",
    "22954": "Devout boots",
    "22957": "Drake's claw",
    "22960": "Drake's tooth",
    "22963": "Broken dragon hasta",
    "22966": "Hydra's claw",
    "22975": "Brimstone ring",
    "22978": "Dragon hunter lance",
    "22983": "Hydra leather",
    "22988": "Hydra tail",
    "22994": "Bottomless compost bucket",
    "22999": "Bottled dragonbreath (unpowered)",
    "23002": "Bottled dragonbreath",
    "23037": "Boots of stone",
    "23047": "Mystic hat (dusk)",
    "23050": "Mystic robe top (dusk)",
    "23053": "Mystic robe bottom (dusk)",
    "23056": "Mystic gloves (dusk)",
    "23059": "Mystic boots (dusk)",
    "23064": "Jar of chemicals",
    "23110": "Mystic set (light)",
    "23113": "Mystic set (blue)",
    "23116": "Mystic set (dark)",
    "23119": "Mystic set (dusk)",
    "23124": "Gilded dragonhide set",
    "23185": "Ring of 3rd age",
    "23188": "Guthix d'hide shield",
    "23191": "Saradomin d'hide shield",
    "23194": "Zamorak d'hide shield",
    "23197": "Ancient d'hide shield",
    "23200": "Armadyl d'hide shield",
    "23203": "Bandos d'hide shield",
    "23206": "Dual sai",
    "23209": "Rune platebody (h1)",
    "23212": "Rune platebody (h2)",
    "23215": "Rune platebody (h3)",
    "23218": "Rune platebody (h4)",
    "23221": "Rune platebody (h5)",
    "23224": "Thieving bag",
    "23227": "Rune defender ornament kit",
    "23232": "Tzhaar-ket-om ornament kit",
    "23237": "Berserker necklace ornament kit",
    "23242": "3rd age plateskirt",
    "23246": "Fremennik kilt",
    "23249": "Rangers' tights",
    "23252": "Giant boot",
    "23255": "Uri's hat",
    "23258": "Gilded coif",
    "23261": "Gilded d'hide vambraces",
    "23264": "Gilded d'hide body",
    "23267": "Gilded d'hide chaps",
    "23270": "Adamant dragon mask",
    "23273": "Rune dragon mask",
    "23276": "Gilded pickaxe",
    "23279": "Gilded axe",
    "23282": "Gilded spade",
    "23285": "Mole slippers",
    "23288": "Frog slippers",
    "23291": "Bear feet",
    "23294": "Demon feet",
    "23297": "Jester cape",
    "23300": "Shoulder parrot",
    "23303": "Monk's robe top (t)",
    "23306": "Monk's robe (t)",
    "23309": "Amulet of defence (t)",
    "23312": "Sandwich lady hat",
    "23315": "Sandwich lady top",
    "23318": "Sandwich lady bottom",
    "23321": "Rune scimitar ornament kit (guthix)",
    "23324": "Rune scimitar ornament kit (saradomin)",
    "23327": "Rune scimitar ornament kit (zamorak)",
    "23336": "3rd age druidic robe top",
    "23339": "3rd age druidic robe bottoms",
    "23342": "3rd age druidic staff",
    "23345": "3rd age druidic cloak",
    "23348": "Tormented ornament kit",
    "23351": "Cape of skulls",
    "23354": "Amulet of power (t)",
    "23357": "Rain bow",
    "23360": "Ham joint",
    "23363": "Staff of bob the cat",
    "23366": "Black platebody (h1)",
    "23369": "Black platebody (h2)",
    "23372": "Black platebody (h3)",
    "23375": "Black platebody (h4)",
    "23378": "Black platebody (h5)",
    "23381": "Leather body (g)",
    "23384": "Leather chaps (g)",
    "23387": "Watson teleport",
    "23389": "Spiked manacles",
    "23392": "Adamant platebody (h1)",
    "23395": "Adamant platebody (h2)",
    "23398": "Adamant platebody (h3)",
    "23401": "Adamant platebody (h4)",
    "23404": "Adamant platebody (h5)",
    "23407": "Wolf mask",
    "23410": "Wolf cloak",
    "23413": "Climbing boots (g)",
    "23490": "Larran's key",
    "23499": "Grubby key",
    "23517": "Giant egg sac(full)",
    "23522": "Mask of ranul",
    "23525": "Jar of eyes",
    "23528": "Sarachnis cudgel",
    "23667": "Dragonstone armour set",
    "23685": "Divine super combat potion(4)",
    "23688": "Divine super combat potion(3)",
    "23691": "Divine super combat potion(2)",
    "23694": "Divine super combat potion(1)",
    "23697": "Divine super attack potion(4)",
    "23700": "Divine super attack potion(3)",
    "23703": "Divine super attack potion(2)",
    "23706": "Divine super attack potion(1)",
    "23709": "Divine super strength potion(4)",
    "23712": "Divine super strength potion(3)",
    "23715": "Divine super strength potion(2)",
    "23718": "Divine super strength potion(1)",
    "23721": "Divine super defence potion(4)",
    "23724": "Divine super defence potion(3)",
    "23727": "Divine super defence potion(2)",
    "23730": "Divine super defence potion(1)",
    "23733": "Divine ranging potion(4)",
    "23736": "Divine ranging potion(3)",
    "23739": "Divine ranging potion(2)",
    "23742": "Divine ranging potion(1)",
    "23745": "Divine magic potion(4)",
    "23748": "Divine magic potion(3)",
    "23751": "Divine magic potion(2)",
    "23754": "Divine magic potion(1)",
    "23908": "Zalcano shard",
    "23943": "Elven signet",
    "23948": "Elven dawn",
    "23953": "Crystal tool seed",
    "23956": "Crystal armour seed",
    "23959": "Enhanced crystal teleport seed",
    "23997": "Blade of saeldor (inactive)",
    "24000": "Crystal grail",
    "24003": "Elven boots",
    "24006": "Elven gloves",
    "24009": "Elven top (yellow)",
    "24012": "Elven skirt (yellow)",
    "24015": "Elven top (white)",
    "24018": "Elven skirt (white)",
    "24021": "Elven top (yellow vest)",
    "24024": "Elven legwear",
    "24027": "Elven top (white vest)",
    "24034": "Dragonstone full helm",
    "24037": "Dragonstone platebody",
    "24040": "Dragonstone platelegs",
    "24043": "Dragonstone boots",
    "24046": "Dragonstone gauntlets",
    "24144": "Staff of balance",
    "24187": "Trouver parchment",
    "24219": "Swift blade",
    "24229": "Ornate maul handle",
    "24251": "Wilderness crabs teleport",
    "24268": "Basilisk jaw",
    "24288": "Dagon'hai hat",
    "24291": "Dagon'hai robe top",
    "24294": "Dagon'hai robe bottom",
    "24333": "Dagon'hai robes set",
    "24336": "Target teleport",
    "24387": "Twisted hat (t3)",
    "24389": "Twisted coat (t3)",
    "24391": "Twisted trousers (t3)",
    "24393": "Twisted boots (t3)",
    "24395": "Twisted cane",
    "24397": "Twisted hat (t2)",
    "24399": "Twisted coat (t2)",
    "24401": "Twisted trousers (t2)",
    "24403": "Twisted boots (t2)",
    "24405": "Twisted hat (t1)",
    "24407": "Twisted coat (t1)",
    "24409": "Twisted trousers (t1)",
    "24411": "Twisted boots (t1)",
    "24413": "Twisted banner",
    "24417": "Inquisitor's mace",
    "24419": "Inquisitor's great helm",
    "24420": "Inquisitor's hauberk",
    "24421": "Inquisitor's plateskirt",
    "24422": "Nightmare staff",
    "24460": "Twisted teleport scroll",
    "24463": "Twisted blueprints",
    "24466": "Twisted horns",
    "24469": "Twisted relic hunter (t1) armour set",
    "24472": "Twisted relic hunter (t2) armour set",
    "24475": "Twisted relic hunter (t3) armour set",
    "24488": "Inquisitor's armour set",
    "24495": "Jar of dreams",
    "24511": "Harmonised orb",
    "24514": "Volatile orb",
    "24517": "Eldritch orb",
    "24585": "Looting bag note",
    "24587": "Rune pouch note",
    "24589": "Blighted manta ray",
    "24592": "Blighted anglerfish",
    "24595": "Blighted karambwan",
    "24598": "Blighted super restore(4)",
    "24607": "Blighted ancient ice sack",
    "24609": "Blighted bind sack",
    "24611": "Blighted snare sack",
    "24613": "Blighted entangle sack",
    "24615": "Blighted teleport spell sack",
    "24621": "Blighted vengeance sack",
    "24623": "Divine battlemage potion(4)",
    "24626": "Divine battlemage potion(3)",
    "24629": "Divine battlemage potion(2)",
    "24632": "Divine battlemage potion(1)",
    "24635": "Divine bastion potion(4)",
    "24638": "Divine bastion potion(3)",
    "24641": "Divine bastion potion(2)",
    "24644": "Divine bastion potion(1)",
    "24740": "Strange old lockpick (full)",
    "24774": "Blood pint",
    "24777": "Blood shard",
    "24782": "Raw mystery meat",
    "24785": "Cooked mystery meat",
    "24844": "Ring of endurance (uncharged)",
    "24949": "Moonclan teleport (tablet)",
    "24951": "Ourania teleport (tablet)",
    "24953": "Waterbirth teleport (tablet)",
    "24955": "Barbarian teleport (tablet)",
    "24957": "Khazard teleport (tablet)",
    "24959": "Fishing guild teleport (tablet)",
    "24961": "Catherby teleport (tablet)",
    "24963": "Ice plateau teleport (tablet)",
    "25001": "Trailblazer hood (t3)",
    "25004": "Trailblazer top (t3)",
    "25007": "Trailblazer trousers (t3)",
    "25010": "Trailblazer boots (t3)",
    "25013": "Trailblazer cane",
    "25016": "Trailblazer hood (t2)",
    "25019": "Trailblazer top (t2)",
    "25022": "Trailblazer trousers (t2)",
    "25025": "Trailblazer boots (t2)",
    "25028": "Trailblazer hood (t1)",
    "25031": "Trailblazer top (t1)",
    "25034": "Trailblazer trousers (t1)",
    "25037": "Trailblazer boots (t1)",
    "25056": "Trailblazer banner",
    "25087": "Trailblazer teleport scroll",
    "25090": "Trailblazer tool ornament kit",
    "25093": "Trailblazer globe",
    "25096": "Trailblazer rug",
    "25099": "Trailblazer graceful ornament kit",
    "25139": "Bone fragments",
    "25380": "Trailblazer relic hunter (t1) armour set",
    "25383": "Trailblazer relic hunter (t2) armour set",
    "25386": "Trailblazer relic hunter (t3) armour set",
    "25389": "Swampbark body",
    "25392": "Swampbark gauntlets",
    "25395": "Swampbark boots",
    "25398": "Swampbark helm",
    "25401": "Swampbark legs",
    "25404": "Bloodbark body",
    "25407": "Bloodbark gauntlets",
    "25410": "Bloodbark boots",
    "25413": "Bloodbark helm",
    "25416": "Bloodbark legs",
    "25419": "Urium remains",
    "25442": "Bronze locks",
    "25445": "Steel locks",
    "25448": "Black locks",
    "25451": "Silver locks",
    "25454": "Gold locks",
    "25478": "Runescroll of swampbark",
    "25481": "Runescroll of bloodbark",
    "25521": "Jar of spirits",
    "25524": "Jar of smoke",
    "25576": "Tome of water (empty)",
    "25578": "Soaked page",
    "25766": "Fiendish ashes",
    "25769": "Vile ashes",
    "25772": "Malicious ashes",
    "25775": "Abyssal ashes",
    "25778": "Infernal ashes",
    "25826": "Lizardkicker",
    "25833": "Raw boar meat",
    "25849": "Amethyst dart",
    "25851": "Amethyst dart(p)",
    "25853": "Amethyst dart tip",
    "25855": "Amethyst dart(p+)",
    "25857": "Amethyst dart(p++)",
    "25859": "Enhanced crystal weapon seed",
    "25862": "Bow of faerdhinen (inactive)",
    "25975": "Lightbearer",
    "25985": "Elidinis' ward",
    "25991": "Sigil of resilience",
    "25994": "Sigil of consistency",
    "25997": "Sigil of the formidable fighter",
    "26000": "Sigil of the rigorous ranger",
    "26003": "Sigil of the meticulous mage",
    "26006": "Sigil of fortification",
    "26009": "Sigil of barrows",
    "26012": "Sigil of deft strikes",
    "26015": "Sigil of freedom",
    "26018": "Sigil of enhanced harvest",
    "26021": "Sigil of storage",
    "26024": "Sigil of the smith",
    "26027": "Sigil of the alchemist",
    "26030": "Sigil of the fletcher",
    "26033": "Sigil of the chef",
    "26036": "Sigil of the craftsman",
    "26039": "Sigil of the abyss",
    "26042": "Sigil of stamina",
    "26045": "Sigil of the potion master",
    "26048": "Sigil of the eternal jeweller",
    "26051": "Sigil of the treasure hunter",
    "26054": "Sigil of mobility",
    "26057": "Sigil of exaggeration",
    "26060": "Sigil of specialised strikes",
    "26063": "Sigil of the porcupine",
    "26066": "Sigil of binding",
    "26069": "Sigil of escaping",
    "26072": "Sigil of the ruthless ranger",
    "26075": "Sigil of the feral fighter",
    "26078": "Sigil of the menacing mage",
    "26081": "Sigil of prosperity",
    "26084": "Sigil of the dwarves",
    "26087": "Sigil of the elves",
    "26090": "Sigil of the barbarians",
    "26093": "Sigil of the gnomes",
    "26096": "Sigil of nature",
    "26099": "Sigil of devotion",
    "26102": "Sigil of the forager",
    "26105": "Sigil of garments",
    "26108": "Sigil of slaughter",
    "26111": "Sigil of the fortune farmer",
    "26114": "Sigil of versatility",
    "26117": "Sigil of the serpent",
    "26120": "Sigil of supreme stamina",
    "26123": "Sigil of preservation",
    "26126": "Sigil of finality",
    "26129": "Sigil of pious protection",
    "26132": "Sigil of aggression",
    "26135": "Sigil of rampage",
    "26138": "Sigil of the skiller",
    "26141": "Sigil of remote storage",
    "26144": "Sigil of last recall",
    "26147": "Sigil of the guardian angel",
    "26219": "Osmumten's fang",
    "26221": "Ancient ceremonial top",
    "26223": "Ancient ceremonial legs",
    "26225": "Ancient ceremonial mask",
    "26227": "Ancient ceremonial gloves",
    "26229": "Ancient ceremonial boots",
    "26231": "Nihil shard",
    "26233": "Ancient godsword",
    "26235": "Zaryte vambraces",
    "26241": "Virtus mask",
    "26243": "Virtus robe top",
    "26245": "Virtus robe bottom",
    "26266": "Condensed gold",
    "26340": "Ancient brew(4)",
    "26342": "Ancient brew(3)",
    "26344": "Ancient brew(2)",
    "26346": "Ancient brew(1)",
    "26350": "Ancient mix(2)",
    "26353": "Ancient mix(1)",
    "26368": "Nihil dust",
    "26370": "Ancient hilt",
    "26372": "Nihil horn",
    "26374": "Zaryte crossbow",
    "26376": "Torva full helm (damaged)",
    "26378": "Torva platebody (damaged)",
    "26380": "Torva platelegs (damaged)",
    "26382": "Torva full helm",
    "26384": "Torva platebody",
    "26386": "Torva platelegs",
    "26390": "Blood essence",
    "26394": "Bandosian components",
    "26421": "Shattered relics variety ornament kit",
    "26424": "Shattered banner",
    "26427": "Shattered hood (t1)",
    "26430": "Shattered top (t1)",
    "26433": "Shattered trousers (t1)",
    "26436": "Shattered boots (t1)",
    "26439": "Shattered hood (t2)",
    "26442": "Shattered top (t2)",
    "26445": "Shattered trousers (t2)",
    "26448": "Shattered boots (t2)",
    "26451": "Shattered hood (t3)",
    "26454": "Shattered top (t3)",
    "26457": "Shattered trousers (t3)",
    "26460": "Shattered boots (t3)",
    "26479": "Shattered relics void ornament kit",
    "26500": "Shattered teleport scroll",
    "26517": "Shattered cane",
    "26528": "Shattered cannon ornament kit",
    "26541": "Shattered relics mystic ornament kit",
    "26554": "Shattered relic hunter (t1) armour set",
    "26557": "Shattered relic hunter (t2) armour set",
    "26560": "Shattered relic hunter (t3) armour set",
    "26602": "Osman's report",
    "26788": "Gold tiara",
    "26798": "Catalytic talisman",
    "26801": "Catalytic tiara",
    "26804": "Elemental tiara",
    "26815": "Ring of the elements",
    "26945": "Pharaoh's sceptre (uncharged)",
    "26997": "Ensouled hellhound head",
    "27014": "Kovac's grog",
    "27202": "Menaphite remedy(4)",
    "27205": "Menaphite remedy(3)",
    "27208": "Menaphite remedy(2)",
    "27211": "Menaphite remedy(1)",
    "27226": "Masori mask",
    "27229": "Masori body",
    "27232": "Masori chaps",
    "27235": "Masori mask (f)",
    "27238": "Masori body (f)",
    "27241": "Masori chaps (f)",
    "27269": "Armadylean plate",
    "27272": "Lily of the sands",
    "27277": "Tumeken's shadow (uncharged)",
    "27355": "Masori armour set (f)",
    "27612": "Venator bow (uncharged)",
    "27614": "Venator shard",
    "27616": "Ancient essence",
    "27629": "Forgotten brew(4)",
    "27632": "Forgotten brew(3)",
    "27635": "Forgotten brew(2)",
    "27638": "Forgotten brew(1)",
    "27641": "Saturated heart",
    "27652": "Webweaver bow (u)",
    "27657": "Ursine chainmace (u)",
    "27662": "Accursed sceptre (u)",
    "27667": "Claws of callisto",
    "27670": "Fangs of venenatis",
    "27673": "Skull of vet'ion",
    "27676": "Accursed sceptre (au)",
    "27681": "Voidwaker hilt",
    "27684": "Voidwaker blade",
    "27687": "Voidwaker gem",
    "27690": "Voidwaker",
    "27785": "Thammaron's sceptre (au)",
    "27897": "Scaly blue dragonhide",
    "28146": "Log brace",
    "28149": "Sturdy harness",
    "28152": "Nature offerings",
    "28154": "Ritual mulch",
    "28157": "Forester's ration",
    "28159": "Secateurs blade",
    "28161": "Secateurs attachment",
    "28163": "Clothes pouch",
    "28166": "Clothes pouch blueprint",
    "28177": "Felling axe handle",
    "28193": "Unfired cup",
    "28196": "Bronze felling axe",
    "28199": "Iron felling axe",
    "28202": "Steel felling axe",
    "28205": "Black felling axe",
    "28208": "Mithril felling axe",
    "28211": "Adamant felling axe",
    "28214": "Rune felling axe",
    "28217": "Dragon felling axe",
    "28220": "Crystal 2h axe",
    "28223": "Crystal 2h axe (inactive)",
    "28226": "3rd age felling axe",
    "28276": "Chromium ingot",
    "28295": "Berserker icon",
    "28298": "Archer icon",
    "28301": "Warrior icon",
    "28304": "Seers icon",
    "28307": "Ultor ring",
    "28310": "Venator ring",
    "28313": "Magus ring",
    "28316": "Bellator ring",
    "28334": "Awakener's orb",
    "28338": "Soulreaper axe",
    "28478": "Sigil of sustenance",
    "28481": "Sigil of hoarding",
    "28484": "Sigil of the alchemaniac",
    "28487": "Sigil of the hunter",
    "28490": "Sigil of resistance",
    "28493": "Sigil of agile fortune",
    "28496": "Sigil of the food master",
    "28499": "Sigil of the well fed",
    "28502": "Sigil of the infernal chef",
    "28505": "Sigil of the infernal smith",
    "28508": "Sigil of the lightbearer",
    "28511": "Sigil of the bloodhound",
    "28514": "Sigil of precision",
    "28517": "Sigil of the augmented thrall",
    "28520": "Sigil of faith",
    "28523": "Sigil of titanium",
    "28526": "Sigil of the ninja",
    "28529": "Sigil of woodcraft",
    "28531": "Corrupted voidwaker",
    "28534": "Corrupted dragon claws",
    "28537": "Corrupted armadyl godsword",
    "28540": "Corrupted twisted bow",
    "28545": "Corrupted scythe of vitur (uncharged)",
    "28549": "Corrupted tumeken's shadow (uncharged)",
    "28561": "Trinket of vengeance",
    "28564": "Trinket of fairies",
    "28567": "Trinket of advanced weaponry",
    "28570": "Trinket of undead",
    "28583": "Warped sceptre (uncharged)",
    "28628": "Sawmill voucher",
    "28684": "Trailblazer reloaded bulwark ornament kit",
    "28690": "Trailblazer reloaded blowpipe ornament kit",
    "28693": "Trailblazer reloaded alchemy scroll",
    "28696": "Trailblazer reloaded vengeance scroll",
    "28699": "Trailblazer reloaded death scroll",
    "28702": "Trailblazer reloaded banner",
    "28705": "Trailblazer reloaded home teleport scroll",
    "28708": "Trailblazer reloaded rejuvenation pool scroll",
    "28712": "Trailblazer reloaded headband (t1)",
    "28715": "Trailblazer reloaded top (t1)",
    "28718": "Trailblazer reloaded trousers (t1)",
    "28721": "Trailblazer reloaded boots (t1)",
    "28724": "Trailblazer reloaded headband (t2)",
    "28727": "Trailblazer reloaded top (t2)",
    "28730": "Trailblazer reloaded trousers (t2)",
    "28733": "Trailblazer reloaded boots (t2)",
    "28736": "Trailblazer reloaded headband (t3)",
    "28739": "Trailblazer reloaded top (t3)",
    "28742": "Trailblazer reloaded trousers (t3)",
    "28745": "Trailblazer reloaded boots (t3)",
    "28748": "Trailblazer reloaded torch",
    "28777": "Trailblazer reloaded relic hunter (t1) armour set",
    "28780": "Trailblazer reloaded relic hunter (t2) armour set",
    "28783": "Trailblazer reloaded relic hunter (t3) armour set",
    "28790": "Kourend castle teleport (tablet)",
    "28810": "Zombie axe",
    "28813": "Broken zombie axe",
    "28824": "Civitas illa fortis teleport",
    "28831": "Immature tecu salamander",
    "28834": "Tecu salamander",
    "28837": "Irit tar",
    "28839": "Wood camo top (equipped)",
    "28842": "Wood camo legs (equipped)",
    "28845": "Jungle camo top (equipped)",
    "28848": "Jungle camo legs (equipped)",
    "28851": "Desert camo top (equipped)",
    "28854": "Desert camo legs (equipped)",
    "28857": "Polar camo top (equipped)",
    "28860": "Polar camo legs (equipped)",
    "28869": "Hunters' sunlight crossbow",
    "28872": "Sunlight antler bolts",
    "28878": "Moonlight antler bolts",
    "28890": "Sunlight moth (item)",
    "28893": "Moonlight moth (item)",
    "28896": "Rum",
    "28899": "Wyrmling bones",
    "28919": "Tonalztics of ralos (uncharged)",
    "28924": "Sunfire splinters",
    "28929": "Sunfire rune",
    "28931": "Searing page",
    "28933": "Sunfire fanatic helm",
    "28936": "Sunfire fanatic cuirass",
    "28939": "Sunfire fanatic chausses",
    "28942": "Echo crystal",
    "28988": "Blue moon spear",
    "28991": "Atlatl dart",
    "28997": "Dual macuahuitl",
    "29000": "Eclipse atlatl",
    "29004": "Eclipse moon chestplate",
    "29007": "Eclipse moon tassets",
    "29010": "Eclipse moon helm",
    "29013": "Blue moon chestplate",
    "29016": "Blue moon tassets",
    "29019": "Blue moon helm",
    "29022": "Blood moon chestplate",
    "29025": "Blood moon tassets",
    "29028": "Blood moon helm",
    "29049": "Eclipse moon chestplate (broken)",
    "29052": "Eclipse moon tassets (broken)",
    "29055": "Eclipse moon helm (broken)",
    "29058": "Blue moon chestplate (broken)",
    "29061": "Blue moon tassets (broken)",
    "29064": "Blue moon helm (broken)",
    "29067": "Blood moon chestplate (broken)",
    "29070": "Blood moon tassets (broken)",
    "29073": "Blood moon helm (broken)",
    "29084": "Sulphur blades",
    "29090": "Calcified moth",
    "29098": "Not meat",
    "29101": "Raw barb-tailed kebbit",
    "29104": "Raw wild kebbit",
    "29107": "Raw dashing kebbit",
    "29110": "Raw pyre fox",
    "29113": "Raw moonlight antelope",
    "29116": "Raw sunlight antelope",
    "29119": "Raw graahk",
    "29122": "Raw larupia",
    "29125": "Raw kyatt",
    "29128": "Cooked wild kebbit",
    "29131": "Cooked barb-tailed kebbit",
    "29134": "Cooked dashing kebbit",
    "29137": "Cooked pyre fox",
    "29140": "Cooked sunlight antelope",
    "29143": "Cooked moonlight antelope",
    "29146": "Cooked larupia",
    "29149": "Cooked graahk",
    "29152": "Cooked kyatt",
    "29163": "Fox fur",
    "29166": "Jerboa tail",
    "29168": "Sunlight antelope antler",
    "29171": "Moonlight antelope antler",
    "29174": "Moonlight antelope fur",
    "29177": "Sunlight antelope fur",
    "29180": "Sapphire glacialis mix (2)",
    "29183": "Snowy knight mix (2)",
    "29186": "Ruby harvest mix (2)",
    "29189": "Black warlock mix (2)",
    "29192": "Sunlight moth mix (2)",
    "29195": "Moonlight moth mix (2)",
    "29198": "Sapphire glacialis mix (1)",
    "29201": "Snowy knight mix (1)",
    "29204": "Ruby harvest mix (1)",
    "29207": "Black warlock mix (1)",
    "29210": "Sunlight moth mix (1)",
    "29213": "Moonlight moth mix (1)",
    "29218": "Jaguar fur",
    "29253": "Enhanced quetzal whistle blueprint",
    "29256": "Perfected quetzal whistle blueprint",
    "29277": "Trapper's tipple",
    "29280": "Mixed hide top",
    "29283": "Mixed hide legs",
    "29286": "Mixed hide boots",
    "29289": "Mixed hide cape",
    "29292": "Mixed hide base",
    "29305": "Hunter's spear",
    "29307": "Quetzal feed",
    "29311": "Hunter spear tips",
    "29409": "Sunbeam ale",
    "29412": "Steamforge brew",
    "29415": "Eclipse red",
    "29418": "Moon-lite",
    "29421": "Sun-shine",
    "29424": "Sunfire fanatic armour set",
    "29449": "Zombie pirate key",
    "29455": "Teleport anchoring scroll",
    "29458": "Adamant seeds",
    "29486": "Cursed amulet of magic",
    "29574": "Burning claw",
    "29577": "Burning claws",
    "29580": "Tormented synapse",
    "29599": "Corrupted dark bow",
    "29602": "Corrupted volatile nightmare staff",
    "29619": "Armageddon rug",
    "29622": "Armageddon teleport scroll",
    "29625": "Armageddon weapon scroll",
    "29628": "Armageddon cape fabric",
    "29631": "Blighted overload (4)",
    "29634": "Blighted overload (3)",
    "29637": "Blighted overload (2)",
    "29640": "Blighted overload (1)",
    "29643": "Chitin",
    "29649": "Sigil of meticulousness",
    "29652": "Sigil of revoked limitation",
    "29655": "Sigil of the rampart",
    "29658": "Sigil of deception",
    "29661": "Sigil of litheness",
    "29664": "Sigil of the adroit",
    "29667": "Sigil of onslaught",
    "29670": "Sigil of restoration",
    "29673": "Sigil of the swashbuckler",
    "29676": "Sigil of the gunslinger",
    "29679": "Sigil of arcane swiftness",
    "29684": "Guthixian temple teleport",
    "29782": "Spider cave teleport",
    "29784": "Araxyte venom sac",
    "29796": "Noxious halberd",
    "29801": "Amulet of rancour",
    "29806": "Aranea boots",
    "29824": "Extended anti-venom+(4)",
    "29827": "Extended anti-venom+(3)",
    "29830": "Extended anti-venom+(2)",
    "29833": "Extended anti-venom+(1)",
    "29889": "Glacial temotli",
    "29895": "Frozen tear",
    "29900": "Varlamorian kebab",
    "29944": "Blackbird red",
    "29947": "Chilhuac red",
    "29952": "Ixcoztic white",
    "29955": "Metztonalli white",
    "29958": "Tonameyo white",
    "29963": "Chichilihui ros\xE9",
    "29966": "Imperial ros\xE9",
    "29993": "Aldarium",
    "30002": "Chugging barrel (disassembled)",
    "30040": "Colossal wyrm teleport scroll",
    "30066": "Tome of earth (empty)",
    "30068": "Soiled page",
    "30070": "Dragon hunter wand",
    "30073": "Hueycoatl hide coif",
    "30076": "Hueycoatl hide body",
    "30079": "Hueycoatl hide chaps",
    "30082": "Hueycoatl hide vambraces",
    "30085": "Hueycoatl hide",
    "30088": "Huasca seed",
    "30094": "Grimy huasca",
    "30097": "Huasca",
    "30100": "Huasca potion (unf)",
    "30125": "Prayer regeneration potion(4)",
    "30128": "Prayer regeneration potion(3)",
    "30131": "Prayer regeneration potion(2)",
    "30134": "Prayer regeneration potion(1)",
    "30137": "Goading potion(4)",
    "30140": "Goading potion(3)",
    "30143": "Goading potion(2)",
    "30146": "Goading potion(1)",
    "30321": "Zombie helmet",
    "30324": "Broken zombie helmet",
    "30328": "Dust",
    "30331": "Raging echoes relic hunter (t1) armour set",
    "30334": "Raging echoes relic hunter (t2) armour set",
    "30337": "Raging echoes relic hunter (t3) armour set",
    "30404": "Raging echoes hat (t1)",
    "30406": "Raging echoes top (t1)",
    "30408": "Raging echoes robeskirt (t1)",
    "30410": "Raging echoes boots (t1)",
    "30412": "Raging echoes hat (t2)",
    "30414": "Raging echoes top (t2)",
    "30416": "Raging echoes robeskirt (t2)",
    "30418": "Raging echoes boots (t2)",
    "30420": "Raging echoes hat (t3)",
    "30422": "Raging echoes top (t3)",
    "30424": "Raging echoes robeskirt (t3)",
    "30426": "Raging echoes boots (t3)",
    "30428": "Raging echoes cane",
    "30430": "Raging echoes banner",
    "30432": "Echo venator bow ornament kit",
    "30443": "Echo virtus ornament kit",
    "30451": "Echo ahrim's ornament kit",
    "30453": "Echo home teleport scroll",
    "30455": "Raging echoes death scroll",
    "30457": "Raging echoes npc contact scroll",
    "30459": "Raging echoes nexus scroll",
    "30461": "Raging echoes portal scroll",
    "30554": "Raging echoes rug",
    "30557": "Raging echoes curtains",
    "30560": "Raging echoes scrying pool scroll",
    "30563": "Raging echoes spirit tree scroll",
    "30576": "Bounty supply crate",
    "30616": "Bounty supply crate (manta ray)",
    "30619": "Bounty supply crate (anglerfish)",
    "30628": "Ice element staff crown",
    "30631": "Fire element staff crown",
    "30634": "Twinflame staff",
    "30676": "Nimbleness charm",
    "30679": "Stockpiling charm",
    "30682": "Accumulation charm",
    "30685": "Vulnerability charm",
    "30744": "Oathplate armour set",
    "30750": "Oathplate helm",
    "30753": "Oathplate chest",
    "30756": "Oathplate legs",
    "30759": "Soulflame horn",
    "30765": "Oathplate shards",
    "30771": "Aether catalyst",
    "30773": "Diabolic worms",
    "30775": "Chasm teleport scroll",
    "30795": "Barrel of demonic tallow (full)",
    "30800": "Demonic tallow",
    "30810": "Contract of glyphic attenuation",
    "30813": "Contract of sensory clouding",
    "30816": "Contract of bloodied blows",
    "30819": "Contract of divine severance",
    "30822": "Contract of forfeit breath",
    "30825": "Contract of oathplate acquisition",
    "30828": "Contract of shard acquisition",
    "30831": "Contract of catalyst acquisition",
    "30834": "Contract of worm acquisition",
    "30837": "Contract of harmony acquisition",
    "30840": "Contract of familiar acquisition",
    "30843": "Aether rune",
    "30848": "Crushed infernal shale",
    "30864": "Infernal plate",
    "30895": "Steel ring",
    "30900": "Shark lure",
    "30957": "Earthbound tecpatl",
    "30998": "Atlatl dart tips",
    "31004": "Atlatl dart shaft",
    "31010": "Headless atlatl dart",
    "31024": "Greenman carving",
    "31027": "Greenman statue",
    "31032": "Ent branch",
    "31034": "Greenman mask",
    "31045": "Bale of flax",
    "31049": "Redwood hiking staff",
    "31081": "Antler guard",
    "31086": "Broken antler",
    "31088": "Avernic treads",
    "31099": "Mokhaiotl waystone",
    "31106": "Confliction gauntlets",
    "31111": "Demon tear",
    "31115": "Eye of ayak (uncharged)",
    "31136": "Blood moon armour set",
    "31139": "Blue moon armour set",
    "31142": "Eclipse moon armour set",
    "31145": "Torva armour set",
    "31148": "Virtus armour set",
    "31151": "Rock-shell armour set",
    "31154": "Skeletal armour set",
    "31157": "Spined armour set",
    "31160": "Swampbark armour set",
    "31163": "Bloodbark armour set",
    "31166": "Mixed hide armour set",
    "31169": "Hueycoatl hide armour set",
    "31181": "Grid master tabard",
    "31184": "Grid master tabard (b)",
    "31187": "Grid master tabard (p)",
    "31190": "Grid master tabard (g)",
    "31193": "Swords and emblem",
    "31196": "Swords and emblem (b)",
    "31199": "Swords and emblem (p)",
    "31202": "Swords and emblem (g)",
    "31205": "Grid master altar icon scroll",
    "31208": "Grid master torch scroll",
    "31235": "Gryphon feather",
    "31243": "Horn of plenty (empty)",
    "31245": "Belle's folly (tarnished)",
    "31248": "Belle's folly",
    "31255": "Barnacle blaster",
    "31258": "Kraken colada",
    "31261": "Sailor's mirage",
    "31383": "Camphor pyre logs",
    "31386": "Ironwood pyre logs",
    "31389": "Rosewood pyre logs",
    "31406": "Dragon nails",
    "31432": "Camphor plank",
    "31435": "Ironwood plank",
    "31438": "Rosewood plank",
    "31441": "Summon boat",
    "31443": "Teleport to boat",
    "31454": "Ball of cotton",
    "31457": "Hemp",
    "31460": "Cotton boll",
    "31463": "Linen yarn",
    "31466": "Hemp yarn",
    "31469": "Cotton yarn",
    "31472": "Bolt of linen",
    "31475": "Bolt of canvas",
    "31478": "Bolt of cotton",
    "31481": "Elkhorn coral",
    "31484": "Pillar coral",
    "31487": "Umbral coral",
    "31502": "Camphor sapling",
    "31505": "Ironwood sapling",
    "31508": "Rosewood sapling",
    "31511": "Elkhorn frag",
    "31513": "Pillar frag",
    "31515": "Umbral frag",
    "31541": "Flax seed",
    "31543": "Hemp seed",
    "31545": "Cotton seed",
    "31547": "Camphor seed",
    "31549": "Ironwood seed",
    "31551": "Rosewood seed",
    "31553": "Raw swordtip squid",
    "31556": "Swordtip squid",
    "31561": "Raw jumbo squid",
    "31564": "Jumbo squid",
    "31569": "Squid paste",
    "31572": "Squid beak",
    "31577": "Camphor blowpipe (empty)",
    "31581": "Ironwood blowpipe (empty)",
    "31585": "Rosewood blowpipe (empty)",
    "31587": "Haemostatic poultice",
    "31590": "Haemostatic dressing (4)",
    "31593": "Haemostatic dressing (3)",
    "31596": "Haemostatic dressing (2)",
    "31599": "Haemostatic dressing (1)",
    "31602": "Super fishing potion(4)",
    "31605": "Super fishing potion(3)",
    "31608": "Super fishing potion(2)",
    "31611": "Super fishing potion(1)",
    "31614": "Extreme energy potion(4)",
    "31617": "Extreme energy potion(3)",
    "31620": "Extreme energy potion(2)",
    "31623": "Extreme energy potion(1)",
    "31626": "Super hunter potion(4)",
    "31629": "Super hunter potion(3)",
    "31632": "Super hunter potion(2)",
    "31635": "Super hunter potion(1)",
    "31638": "Extended stamina potion(4)",
    "31641": "Extended stamina potion(3)",
    "31644": "Extended stamina potion(2)",
    "31647": "Extended stamina potion(1)",
    "31650": "Armadyl brew(4)",
    "31653": "Armadyl brew(3)",
    "31656": "Armadyl brew(2)",
    "31659": "Armadyl brew(1)",
    "31662": "Elkhorn potion (unf)",
    "31665": "Pillar potion (unf)",
    "31668": "Umbral potion (unf)",
    "31671": "Red crab",
    "31674": "Blue crab",
    "31677": "Rainbow crab (1)",
    "31680": "Rainbow crab (2)",
    "31683": "Rainbow crab (3)",
    "31686": "Raw red crab meat",
    "31689": "Red crab meat",
    "31692": "Raw blue crab meat",
    "31695": "Blue crab meat",
    "31700": "Raw rainbow crab meat",
    "31703": "Rainbow crab meat",
    "31708": "Crab paste",
    "31710": "Rainbow crab paste",
    "31712": "Anti-odour salt",
    "31716": "Lead ore",
    "31719": "Nickel ore",
    "31722": "Rubium splinters",
    "31726": "Strykewyrm bones",
    "31729": "Frost dragon bones",
    "31906": "Bronze cannonball",
    "31908": "Iron cannonball",
    "31910": "Mithril cannonball",
    "31912": "Adamant cannonball",
    "31914": "Rune cannonball",
    "31916": "Dragon cannonball",
    "31918": "Bronze chainshot cannonball",
    "31920": "Iron chainshot cannonball",
    "31922": "Steel chainshot cannonball",
    "31924": "Mithril chainshot cannonball",
    "31926": "Adamant chainshot cannonball",
    "31928": "Rune chainshot cannonball",
    "31930": "Dragon chainshot cannonball",
    "31932": "Bronze incendiary cannonball",
    "31934": "Iron incendiary cannonball",
    "31936": "Steel incendiary cannonball",
    "31938": "Mithril incendiary cannonball",
    "31940": "Adamant incendiary cannonball",
    "31942": "Rune incendiary cannonball",
    "31944": "Dragon incendiary cannonball",
    "31946": "Echo pearl",
    "31949": "Bottled storm",
    "31952": "Swift albatross feather",
    "31954": "Narwhal horn",
    "31959": "Ray barbs",
    "31961": "Broken dragon hook",
    "31964": "Repair kit",
    "31967": "Oak repair kit",
    "31970": "Teak repair kit",
    "31973": "Mahogany repair kit",
    "31976": "Camphor repair kit",
    "31979": "Ironwood repair kit",
    "31982": "Rosewood repair kit",
    "31989": "Boat bottle (empty)",
    "31996": "Dragon metal sheet",
    "31999": "Bronze keel parts",
    "32002": "Iron keel parts",
    "32005": "Steel keel parts",
    "32008": "Mithril keel parts",
    "32011": "Adamant keel parts",
    "32014": "Rune keel parts",
    "32017": "Dragon keel parts",
    "32020": "Large bronze keel parts",
    "32023": "Large iron keel parts",
    "32026": "Large steel keel parts",
    "32029": "Large mithril keel parts",
    "32032": "Large adamant keel parts",
    "32035": "Large rune keel parts",
    "32038": "Large dragon keel parts",
    "32041": "Wooden hull parts",
    "32044": "Oak hull parts",
    "32047": "Teak hull parts",
    "32050": "Mahogany hull parts",
    "32053": "Camphor hull parts",
    "32056": "Ironwood hull parts",
    "32059": "Rosewood hull parts",
    "32062": "Large wooden hull parts",
    "32065": "Large oak hull parts",
    "32068": "Large teak hull parts",
    "32071": "Large mahogany hull parts",
    "32074": "Large camphor hull parts",
    "32077": "Large ironwood hull parts",
    "32080": "Large rosewood hull parts",
    "32087": "Barracuda paint",
    "32090": "Shark paint",
    "32093": "Inky paint",
    "32096": "Angler's paint",
    "32099": "Salvor's paint",
    "32110": "Merchant's paint",
    "32115": "Dragon cannon barrel",
    "32307": "Fine fish offcuts",
    "32309": "Raw giant krill",
    "32312": "Giant krill",
    "32317": "Raw haddock",
    "32320": "Haddock",
    "32325": "Raw yellowfin",
    "32328": "Yellowfin",
    "32333": "Raw halibut",
    "32336": "Halibut",
    "32341": "Raw bluefin",
    "32344": "Bluefin",
    "32349": "Raw marlin",
    "32352": "Marlin",
    "32357": "Haddock eye",
    "32360": "Yellow fin",
    "32362": "Marlin scales",
    "32364": "Camphor crate",
    "32366": "Fish crate (empty)",
    "32368": "Fish crate (giant krill)",
    "32371": "Fish crate (haddock)",
    "32374": "Fish crate (yellowfin)",
    "32377": "Fish crate (halibut)",
    "32380": "Fish crate (bluefin)",
    "32383": "Fish crate (marlin)",
    "32876": "Aquanite tendon",
    "32879": "Aquanite hopper",
    "32886": "Chain",
    "32889": "Lead bar",
    "32892": "Cupronickel bar",
    "32904": "Camphor logs",
    "32907": "Ironwood logs",
    "32910": "Rosewood logs",
    "33012": "Annihilation weapon scroll",
    "33015": "Annihilation blueprints",
    "33018": "Annihilation teleport scroll",
    "33038": "The dogsword",
    "33041": "Thunder khopesh",
    "33044": "Trinket of avarice",
    "33047": "Trinket of fortuity (inactive)",
    "33050": "Trinket of fortuity (active)",
    "33074": "Facility bottle (empty)",
    "33093": "Cow slippers",
    "33106": "Raw t-bone steak",
    "33109": "Cooked t-bone steak",
    "33260": "Demonic hood (t1)",
    "33263": "Demonic robe top (t1)",
    "33266": "Demonic robe bottom (t1)",
    "33269": "Demonic boots (t1)",
    "33272": "Demonic hood (t2)",
    "33275": "Demonic robe top (t2)",
    "33278": "Demonic robe bottom (t2)",
    "33281": "Demonic boots (t2)",
    "33284": "Demonic hood (t3)",
    "33287": "Demonic robe top (t3)",
    "33290": "Demonic robe bottom (t3)",
    "33293": "Demonic boots (t3)",
    "33296": "Demonic sceptre",
    "33299": "Demonic pacts banner",
    "33302": "Demonic skin contract",
    "33305": "Demonic axe ornament kit",
    "33308": "Demonic staff ornament kit",
    "33311": "Demonic trident ornament kit",
    "33316": "Uncharged toxic trident (o)",
    "33320": "Uncharged toxic trident (e) (33320)",
    "33323": "Trident of the seas (full) (o)",
    "33328": "Uncharged trident (e) (o)",
    "33335": "Soulreaper axe (o)",
    "33342": "Demonic quill",
    "33359": "Impish ritual scroll",
    "33362": "Demonic pacts throne scroll",
    "33365": "Impish whistle",
    "33368": "Demonic pacts demon butler scroll",
    "33428": "Trinket of vengeance (2)",
    "33431": "Trinket of vengeance (1)",
    "33451": "Demonic pacts relic hunter (t1) armour set",
    "33454": "Demonic pacts relic hunter (t2) armour set",
    "33457": "Demonic pacts relic hunter (t3) armour set",
    "33534": "Etched araxyte fang",
    "33553": "Seeking bronze arrow",
    "33559": "Seeking iron arrow",
    "33565": "Seeking steel arrow",
    "33571": "Seeking mithril arrow",
    "33577": "Seeking adamant arrow",
    "33583": "Seeking rune arrow",
    "33589": "Seeking amethyst arrow",
    "33595": "Seeking dragon arrow",
    "33625": "Letvek",
    "33631": "Crimson kisten",
    "33636": "Etched elder venator fang",
    "33639": "Necklace of rupture",
    "33644": "Dummy stymphike feather",
    "33651": "Stymphike feather",
    "33657": "Orikalkum gravel",
    "33821": "Raw impaler meat"
  });

  // src/adapter.ts
  var CAPABILITIES = Object.freeze([
    "session",
    "skills",
    "player",
    "npcs",
    "players",
    "groundItems",
    "chat",
    "sceneObjects",
    "inventoryLookup",
    "varps",
    "projection",
    "animation",
    "opponent",
    "bankItems",
    "attackStyle"
  ]);
  function available(source) {
    return Object.freeze({ available: true, source });
  }
  function unavailable(reason) {
    return Object.freeze({ available: false, source: "unavailable", reason });
  }
  function freezeList(values) {
    for (const value of values) {
      if (typeof value === "object" && value !== null) Object.freeze(value);
    }
    return Object.freeze(values);
  }
  function numericField(target, name) {
    const value = getField(target, name);
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  function stringField(target, name) {
    const value = getField(target, name);
    return typeof value === "string" ? value : null;
  }
  function booleanField(target, name) {
    const value = getField(target, name);
    return typeof value === "boolean" ? value : null;
  }
  function indexValue(target, index) {
    if (target === null || target === void 0) return void 0;
    return Reflect.get(Object(target), String(index));
  }
  function hasMethod(target, name) {
    return typeof getField(target, name) === "function";
  }
  function callReadMethod(target, name, args = []) {
    const method = getField(target, name);
    if (typeof method !== "function") return void 0;
    try {
      return Reflect.apply(method, target, args);
    } catch {
      return void 0;
    }
  }
  function validTile(value) {
    if (!isRecord(value)) return null;
    const x = numericField(value, "x");
    const z = numericField(value, "z");
    const level = numericField(value, "level");
    if (x === null || z === null || level === null) return null;
    return Object.freeze({ x: Math.floor(x), z: Math.floor(z), level: Math.floor(level) });
  }
  function validIndexCollection(value, minimumLength = 1) {
    const length = getArrayLikeLength(value);
    return length !== null && length >= minimumLength;
  }
  var SolanaClientAdapter = class {
    mapping;
    client;
    skills = null;
    cachedSkillInputs = null;
    cachedSkillStates = null;
    validationFailures = /* @__PURE__ */ new Set();
    capabilities;
    lastCapabilityRefreshAt = 0;
    itemNameCache = /* @__PURE__ */ new Map();
    constructor(client, mapping = CURRENT_FIELD_MAP) {
      this.client = client;
      this.mapping = mapping;
      this.capabilities = this.detectCapabilities();
      this.lastCapabilityRefreshAt = Date.now();
    }
    getCapabilities() {
      return Object.freeze({ ...this.capabilities });
    }
    getResolvedFields() {
      return Object.freeze({
        skillXp: this.skills?.xpField ?? null,
        skillCurrent: this.skills?.currentField ?? null,
        skillBase: this.skills?.baseField ?? null,
        localPlayer: this.mapping.player.local,
        npcTable: this.mapping.npcs.table,
        playerTable: this.mapping.players.table,
        groundItems: this.mapping.groundItems.grid,
        chatTypes: this.mapping.chat.types,
        chatSenders: this.mapping.chat.senders,
        chatMessages: this.mapping.chat.messages,
        sceneGraph: this.mapping.scene.graph,
        attackStyleState: this.mapping.combat.state,
        playerAnimation: this.mapping.player.animation,
        opponentIndex: this.mapping.player.targetIndex,
        playerPathX: this.mapping.player.pathX,
        playerPathZ: this.mapping.player.pathZ,
        playerPathLength: this.mapping.player.pathLength,
        projectionHeights: this.mapping.projection.heights
      });
    }
    getValidationFailures() {
      return Object.freeze([...this.validationFailures]);
    }
    readSnapshot(at, visible, slices) {
      if (at - this.lastCapabilityRefreshAt >= 2e3 || at < this.lastCapabilityRefreshAt) {
        this.capabilities = this.detectCapabilities();
        this.lastCapabilityRefreshAt = at;
      }
      const ingame = this.readIngame();
      const skills = slices.has("skills") ? this.readSkills() : null;
      const player = this.readPlayer();
      const attackStyle = this.readAttackStyle();
      const username = this.readUsername();
      const optional = {};
      if (slices.has("npcs") && this.capabilities.npcs.available) optional.npcs = this.readNpcs();
      if (slices.has("players") && this.capabilities.players.available) optional.players = this.readPlayers();
      if (slices.has("groundItems") && this.capabilities.groundItems.available) {
        optional.groundItems = this.readGroundItems();
      }
      if (slices.has("chat") && this.capabilities.chat.available) optional.chat = this.readChat();
      if (slices.has("sceneObjects") && this.capabilities.sceneObjects.available) {
        optional.sceneObjects = this.readSceneObjects();
      }
      if (slices.has("tiles") && this.capabilities.projection.available) {
        optional.tiles = this.readProjectedTiles();
      }
      return Object.freeze({
        at,
        visible,
        ingame,
        username,
        skills,
        player,
        opponent: this.readOpponent(),
        attackStyle,
        ...optional.npcs !== void 0 ? { npcs: optional.npcs } : {},
        ...optional.players !== void 0 ? { players: optional.players } : {},
        ...optional.groundItems !== void 0 ? { groundItems: optional.groundItems } : {},
        ...optional.chat !== void 0 ? { chat: optional.chat } : {},
        ...optional.sceneObjects !== void 0 ? { sceneObjects: optional.sceneObjects } : {},
        ...optional.tiles !== void 0 ? { tiles: optional.tiles } : {}
      });
    }
    readSkills() {
      const values = this.readPublicSkills() ?? this.readResolvedSkills();
      if (!values) {
        this.capabilities.skills = unavailable("The skill mapping no longer passes validation.");
        this.validationFailures.add("Skill fields became unavailable after client initialization.");
        return null;
      }
      if (this.cachedSkillInputs && this.cachedSkillStates && this.sameNumbers(values.xp, this.cachedSkillInputs.xp) && this.sameNumbers(values.current, this.cachedSkillInputs.current) && this.sameNumbers(values.base, this.cachedSkillInputs.base)) return this.cachedSkillStates;
      const result = SKILL_NAMES.map(
        (name, id) => Object.freeze({
          id,
          name,
          xp: Math.max(0, Math.floor(values.xp[id] ?? 0)),
          currentLevel: Math.max(0, Math.floor(values.current[id] ?? 0)),
          baseLevel: Math.max(0, Math.floor(values.base[id] ?? 0))
        })
      );
      this.cachedSkillInputs = values;
      this.cachedSkillStates = Object.freeze(result);
      return this.cachedSkillStates;
    }
    readNpcs() {
      const table = getField(this.client, this.mapping.npcs.table);
      const indices = getField(this.client, this.mapping.npcs.activeIndices);
      const count = Math.min(16384, Math.max(0, Math.floor(numericField(this.client, this.mapping.npcs.activeCount) ?? 0)));
      const baseX = numericField(this.client, this.mapping.player.baseX) ?? 0;
      const baseZ = numericField(this.client, this.mapping.player.baseZ) ?? 0;
      const plane = numericField(this.client, this.mapping.player.plane) ?? 0;
      const output = [];
      for (let position = 0; position < count; position += 1) {
        const slot = indexValue(indices, position);
        if (typeof slot !== "number" || !Number.isInteger(slot)) continue;
        const entity = indexValue(table, slot);
        if (!isRecord(entity)) continue;
        const type = getField(entity, this.mapping.npcs.type);
        const localX = numericField(entity, this.mapping.player.localX);
        const localZ = numericField(entity, this.mapping.player.localZ);
        if (localX === null || localZ === null) continue;
        const entityLevel = numericField(entity, this.mapping.player.level) ?? plane;
        const typeId = numericField(type, this.mapping.npcs.id);
        output.push(
          Object.freeze({
            slot,
            id: typeId === null ? null : Math.floor(typeId),
            name: stringField(type, this.mapping.npcs.name),
            tile: Object.freeze({
              x: Math.floor(localX / 128) + Math.floor(baseX),
              z: Math.floor(localZ / 128) + Math.floor(baseZ),
              level: Math.floor(entityLevel)
            })
          })
        );
      }
      return freezeList(output);
    }
    readPlayers() {
      const table = getField(this.client, this.mapping.players.table);
      const indices = getField(this.client, this.mapping.players.activeIndices);
      const count = Math.min(2048, Math.max(0, Math.floor(numericField(this.client, this.mapping.players.activeCount) ?? 0)));
      const output = [];
      const local = getField(this.client, this.mapping.player.local);
      const localState = this.entityToPlayer(-1, local, true);
      if (localState) output.push(localState);
      for (let position = 0; position < count; position += 1) {
        const slot = indexValue(indices, position);
        if (typeof slot !== "number" || !Number.isInteger(slot)) continue;
        const entity = indexValue(table, slot);
        if (entity === local) continue;
        const state = this.entityToPlayer(slot, entity, false);
        if (state) output.push(state);
      }
      return freezeList(output);
    }
    readGroundItems(radius = 12) {
      this.learnItemNamesFromMenu();
      const fromMethod = this.readPublicGroundItems(radius);
      if (fromMethod) return fromMethod;
      const playerTile = this.readPlayerTile();
      if (!playerTile) return Object.freeze([]);
      const grid = getField(this.client, this.mapping.groundItems.grid);
      const planeGrid = indexValue(grid, playerTile.level);
      const baseX = Math.floor(numericField(this.client, this.mapping.player.baseX) ?? 0);
      const baseZ = Math.floor(numericField(this.client, this.mapping.player.baseZ) ?? 0);
      const playerLocalX = playerTile.x - baseX;
      const playerLocalZ = playerTile.z - baseZ;
      const output = [];
      for (let localX = Math.max(0, playerLocalX - radius); localX <= Math.min(103, playerLocalX + radius); localX += 1) {
        const column = indexValue(planeGrid, localX);
        for (let localZ = Math.max(0, playerLocalZ - radius); localZ <= Math.min(103, playerLocalZ + radius); localZ += 1) {
          const deque = indexValue(column, localZ);
          const sentinel = getField(deque, this.mapping.groundItems.sentinel);
          if (!isRecord(sentinel)) continue;
          const visited = /* @__PURE__ */ new Set([sentinel]);
          let node = getField(sentinel, this.mapping.groundItems.next);
          let iterations = 0;
          while (isRecord(node) && !visited.has(node) && iterations < 64) {
            visited.add(node);
            const id = numericField(node, this.mapping.groundItems.id);
            const count = numericField(node, this.mapping.groundItems.count);
            if (id !== null && count !== null) {
              output.push(
                Object.freeze({
                  id: Math.floor(id),
                  count: Math.max(0, Math.floor(count)),
                  name: this.readItemName(Math.floor(id)),
                  tile: Object.freeze({ x: baseX + localX, z: baseZ + localZ, level: playerTile.level })
                })
              );
            }
            node = getField(node, this.mapping.groundItems.next);
            iterations += 1;
          }
        }
      }
      return freezeList(output);
    }
    projectGroundItems(items) {
      const playerTile = this.readPlayerTile();
      if (!playerTile || !this.hasProjectionShape()) return Object.freeze([]);
      const baseX = numericField(this.client, this.mapping.player.baseX);
      const baseZ = numericField(this.client, this.mapping.player.baseZ);
      if (baseX === null || baseZ === null) return Object.freeze([]);
      const output = [];
      for (const item of items.slice(0, 80)) {
        if (item.tile.level !== playerTile.level) continue;
        const localX = (item.tile.x - Math.floor(baseX)) * 128 + 64;
        const localZ = (item.tile.z - Math.floor(baseZ)) * 128 + 64;
        const point = this.projectLocalPoint(localX, localZ, item.tile.level, 20);
        if (!point) continue;
        output.push(Object.freeze({ ...item, point }));
      }
      return Object.freeze(output);
    }
    projectPlayers(players) {
      const playerTile = this.readPlayerTile();
      if (!playerTile || !this.hasProjectionShape()) return Object.freeze([]);
      const baseX = numericField(this.client, this.mapping.player.baseX);
      const baseZ = numericField(this.client, this.mapping.player.baseZ);
      if (baseX === null || baseZ === null) return Object.freeze([]);
      const output = [];
      for (let index = 0; index < Math.min(players.length, 80); index += 1) {
        const player = players[index];
        if (!player) continue;
        if (player.tile.level !== playerTile.level || !player.name) continue;
        const localX = (player.tile.x - Math.floor(baseX)) * 128 + 64;
        const localZ = (player.tile.z - Math.floor(baseZ)) * 128 + 64;
        const point = this.projectLocalPoint(localX, localZ, player.tile.level, 165);
        if (!point) continue;
        output.push(Object.freeze({ ...player, point }));
      }
      return Object.freeze(output);
    }
    readPublicGroundItems(radius) {
      if (!hasMethod(this.client, "pluginGetNearbyGroundItems")) return null;
      const value = callReadMethod(this.client, "pluginGetNearbyGroundItems", [radius]);
      const length = getArrayLikeLength(value);
      if (length === null) return Object.freeze([]);
      const output = [];
      for (let index = 0; index < Math.min(length, 256); index += 1) {
        const entry = indexValue(value, index);
        if (!isRecord(entry)) continue;
        const id = numericField(entry, "id");
        const count = numericField(entry, "count") ?? numericField(entry, "quantity") ?? 1;
        const tile = validTile(getField(entry, "tile")) ?? validTile(entry);
        if (id === null || !Number.isInteger(id) || id < 0 || !tile) continue;
        const providedName = stringField(entry, "name");
        output.push(Object.freeze({
          id,
          count: Math.max(0, Math.floor(count)),
          name: providedName && providedName.trim() ? providedName.trim() : this.readItemName(id),
          tile
        }));
      }
      return Object.freeze(output);
    }
    readItemName(id) {
      if (this.itemNameCache.has(id)) return this.itemNameCache.get(id) ?? null;
      const value = callReadMethod(this.client, "pluginGetItemName", [id]);
      const name = typeof value === "string" && value.trim().length > 0 ? value.trim() : STANDARD_ITEM_NAMES[id] ?? null;
      this.itemNameCache.set(id, name);
      return name;
    }
    learnItemNamesFromMenu() {
      const count = Math.min(500, Math.max(0, Math.floor(numericField(this.client, this.mapping.menu.count) ?? 0)));
      const options = getField(this.client, this.mapping.menu.options);
      const opcodes = getField(this.client, this.mapping.menu.opcodes);
      const identifiers = getField(this.client, this.mapping.menu.identifiers);
      for (let index = 0; index < count; index += 1) {
        const option = indexValue(options, index);
        const opcodeValue = indexValue(opcodes, index);
        const identifier = indexValue(identifiers, index);
        if (typeof option !== "string" || typeof opcodeValue !== "number" || typeof identifier !== "number") continue;
        const opcode = opcodeValue >= 2e3 ? opcodeValue - 2e3 : opcodeValue;
        if (opcode !== 617 && opcode !== 1152) continue;
        const marker = option.indexOf("@lre@");
        if (marker < 0) continue;
        const name = option.slice(marker + 5).replace(/@[a-z0-9]+@/gi, "").trim();
        if (!name) continue;
        this.itemNameCache.set(Math.floor(identifier), name);
      }
    }
    readChat() {
      const types = getField(this.client, this.mapping.chat.types);
      const senders = getField(this.client, this.mapping.chat.senders);
      const messages = getField(this.client, this.mapping.chat.messages);
      const length = Math.min(100, getArrayLikeLength(messages) ?? 0);
      const output = [];
      for (let index = 0; index < length; index += 1) {
        const text = indexValue(messages, index);
        if (typeof text !== "string" || text.length === 0) continue;
        const sender = indexValue(senders, index);
        const type = indexValue(types, index);
        output.push(
          Object.freeze({
            index,
            type: typeof type === "number" && Number.isFinite(type) ? Math.floor(type) : 0,
            sender: typeof sender === "string" && sender.length > 0 ? sender : null,
            text
          })
        );
      }
      return freezeList(output);
    }
    readSceneObjects(radius = 15) {
      const playerTile = this.readPlayerTile();
      const scene = getField(this.client, this.mapping.scene.graph);
      if (!playerTile || !isRecord(scene)) return Object.freeze([]);
      const baseX = Math.floor(numericField(this.client, this.mapping.player.baseX) ?? 0);
      const baseZ = Math.floor(numericField(this.client, this.mapping.player.baseZ) ?? 0);
      const playerLocalX = playerTile.x - baseX;
      const playerLocalZ = playerTile.z - baseZ;
      const getters = [
        ["wall", this.mapping.scene.getters.wall],
        ["wallDecoration", this.mapping.scene.getters.wallDecoration],
        ["object", this.mapping.scene.getters.object],
        ["groundDecoration", this.mapping.scene.getters.groundDecoration]
      ];
      const seen = /* @__PURE__ */ new Set();
      const output = [];
      for (let localX = Math.max(0, playerLocalX - radius); localX <= Math.min(103, playerLocalX + radius); localX += 1) {
        for (let localZ = Math.max(0, playerLocalZ - radius); localZ <= Math.min(103, playerLocalZ + radius); localZ += 1) {
          for (const [kind, methodName] of getters) {
            const value = callReadMethod(scene, methodName, [playerTile.level, localX, localZ]);
            if (!isRecord(value)) continue;
            const rawTag = numericField(value, this.mapping.scene.tag);
            if (rawTag === null || rawTag === 0) continue;
            const tag = rawTag | 0;
            const key = `${kind}:${tag}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const info = numericField(value, this.mapping.scene.info);
            output.push(
              Object.freeze({
                id: tag >>> 14 & 32767,
                tag,
                kind,
                orientation: info === null ? null : Math.floor(info) & 255,
                tile: Object.freeze({ x: baseX + localX, z: baseZ + localZ, level: playerTile.level })
              })
            );
          }
        }
      }
      return freezeList(output);
    }
    getInventoryCount(itemId) {
      if (!this.capabilities.inventoryLookup.available || !Number.isInteger(itemId) || itemId < 0) return null;
      const result = callReadMethod(this.client, "pluginGetInvItemCount", [itemId]);
      return typeof result === "number" && Number.isFinite(result) ? Math.max(0, Math.floor(result)) : null;
    }
    getComponentItemCount(componentId, itemId) {
      if (!hasMethod(this.client, "pluginGetComponentItemCount")) return null;
      if (!Number.isInteger(componentId) || !Number.isInteger(itemId) || componentId < 0 || itemId < 0) return null;
      const result = callReadMethod(this.client, "pluginGetComponentItemCount", [componentId, itemId]);
      return typeof result === "number" && Number.isFinite(result) ? Math.max(0, Math.floor(result)) : null;
    }
    getVarp(id) {
      if (!this.capabilities.varps.available || !Number.isInteger(id) || id < 0) return null;
      const result = callReadMethod(this.client, "pluginGetVarp", [id]);
      return typeof result === "number" && Number.isFinite(result) ? Math.floor(result) : null;
    }
    readAttackStyle() {
      const publicIndex = callReadMethod(this.client, "pluginGetVarp", [this.mapping.combat.attackStyleIndex]);
      if (typeof publicIndex === "number" && Number.isInteger(publicIndex)) {
        const publicName = ATTACK_STYLE_NAMES[publicIndex];
        if (publicName !== void 0) return Object.freeze({ index: publicIndex, name: publicName });
      }
      const state = getField(this.client, this.mapping.combat.state);
      const rawIndex = indexValue(state, this.mapping.combat.attackStyleIndex);
      if (typeof rawIndex !== "number" || !Number.isInteger(rawIndex)) return null;
      const name = ATTACK_STYLE_NAMES[rawIndex];
      return name === void 0 ? null : Object.freeze({ index: rawIndex, name });
    }
    readOpponent() {
      const local = getField(this.client, this.mapping.player.local);
      const slot = numericField(local, this.mapping.player.targetIndex);
      if (slot === null || !Number.isInteger(slot) || slot < 0 || slot >= 32768) return null;
      const entity = indexValue(getField(this.client, this.mapping.npcs.table), slot);
      if (!isRecord(entity)) return null;
      const healthRatio = numericField(entity, this.mapping.npcs.healthRatio);
      const healthScale = numericField(entity, this.mapping.npcs.healthScale);
      if (healthRatio === null || healthScale === null || !Number.isInteger(healthRatio) || !Number.isInteger(healthScale) || healthRatio < 0 || healthScale <= 0 || healthRatio > healthScale) return null;
      const type = getField(entity, this.mapping.npcs.type);
      const id = numericField(type, this.mapping.npcs.id);
      const animation = numericField(entity, this.mapping.player.animation);
      return Object.freeze({
        slot,
        id: id === null ? null : Math.floor(id),
        name: stringField(type, this.mapping.npcs.name),
        healthRatio,
        healthScale,
        healthPercent: Math.max(0, Math.min(100, healthRatio / healthScale * 100)),
        animation: animation === null ? null : Math.floor(animation)
      });
    }
    readProjectedTiles() {
      const playerTile = this.readPlayerTile();
      if (!playerTile || !this.hasProjectionShape()) return Object.freeze([]);
      const mouseX = numericField(this.client, this.mapping.projection.mouseX);
      const mouseY = numericField(this.client, this.mapping.projection.mouseY);
      if (mouseX === null || mouseY === null || mouseX < 4 || mouseX >= 516 || mouseY < 4 || mouseY >= 338) {
        return Object.freeze([]);
      }
      const baseX = Math.floor(numericField(this.client, this.mapping.player.baseX) ?? 0);
      const baseZ = Math.floor(numericField(this.client, this.mapping.player.baseZ) ?? 0);
      const intersection = this.findTerrainIntersection(mouseX, mouseY, playerTile.level);
      if (!intersection) return Object.freeze([]);
      const intersectedTileX = Math.floor(intersection.x / 128);
      const intersectedTileZ = Math.floor(intersection.z / 128);
      let best = null;
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
          const sceneX = intersectedTileX + offsetX;
          const sceneZ = intersectedTileZ + offsetZ;
          const worldX = baseX + sceneX;
          const worldZ = baseZ + sceneZ;
          const tile = this.projectWorldTile({ x: worldX, z: worldZ, level: playerTile.level }, playerTile);
          if (!tile) continue;
          const points = tile.points;
          if (!this.pointInPolygon(mouseX, mouseY, points)) continue;
          const centerX = points.reduce((sum, point) => sum + point.x, 0) / 4;
          const centerY = points.reduce((sum, point) => sum + point.y, 0) / 4;
          const distance = (centerX - mouseX) ** 2 + (centerY - mouseY) ** 2;
          if (!best || distance < best.distance) best = { tile, distance };
        }
      }
      return best ? Object.freeze([best.tile]) : Object.freeze([]);
    }
    readProjectedDestinationTile() {
      const playerTile = this.readPlayerTile();
      const local = getField(this.client, this.mapping.player.local);
      const pathLength = numericField(local, this.mapping.player.pathLength);
      if (!playerTile || !this.hasProjectionShape() || pathLength === null || !Number.isInteger(pathLength) || pathLength <= 0) {
        return null;
      }
      const localX = indexValue(getField(local, this.mapping.player.pathX), 0);
      const localZ = indexValue(getField(local, this.mapping.player.pathZ), 0);
      const baseX = numericField(this.client, this.mapping.player.baseX);
      const baseZ = numericField(this.client, this.mapping.player.baseZ);
      if (typeof localX !== "number" || !Number.isInteger(localX) || typeof localZ !== "number" || !Number.isInteger(localZ) || baseX === null || baseZ === null) return null;
      const destination = Object.freeze({
        x: Math.floor(baseX) + localX,
        z: Math.floor(baseZ) + localZ,
        level: playerTile.level
      });
      if (destination.x === playerTile.x && destination.z === playerTile.z) return null;
      return this.projectWorldTile(destination, playerTile);
    }
    projectWorldTile(tile, playerTile) {
      const baseX = numericField(this.client, this.mapping.player.baseX);
      const baseZ = numericField(this.client, this.mapping.player.baseZ);
      if (baseX === null || baseZ === null || tile.level !== playerTile.level) return null;
      const localX = (tile.x - Math.floor(baseX)) * 128;
      const localZ = (tile.z - Math.floor(baseZ)) * 128;
      const corners = [
        this.projectLocalPoint(localX, localZ, tile.level),
        this.projectLocalPoint(localX + 128, localZ, tile.level),
        this.projectLocalPoint(localX + 128, localZ + 128, tile.level),
        this.projectLocalPoint(localX, localZ + 128, tile.level)
      ];
      if (corners.some((point) => point === null)) return null;
      const points = corners;
      return Object.freeze({
        tile: Object.freeze({ ...tile }),
        points: Object.freeze(points),
        playerTile: tile.x === playerTile.x && tile.z === playerTile.z
      });
    }
    detectCapabilities() {
      const result = {};
      for (const capability of CAPABILITIES) result[capability] = unavailable("Not detected.");
      result.session = hasMethod(this.client, "pluginIsIngame") ? available("public-api") : booleanField(this.client, this.mapping.session.ingame) !== null ? available("mapped-field") : unavailable("No validated in-game state getter or field.");
      this.resolveSkills();
      result.skills = this.skills ? available(this.skills.source) : unavailable("No unique validated 21-skill mapping.");
      result.player = hasMethod(this.client, "pluginGetPlayerTile") || this.readRawPlayerTile() !== null ? available(hasMethod(this.client, "pluginGetPlayerTile") ? "public-api" : "mapped-field") : unavailable("No validated player tile source.");
      result.npcs = this.hasNpcShape() ? available("mapped-field") : unavailable("NPC table/index/count mapping failed validation.");
      result.players = this.hasPlayerShape() ? available("mapped-field") : unavailable("Player table/index/count mapping failed validation.");
      result.groundItems = this.hasGroundItemShape() ? available("mapped-field") : unavailable("Ground-item grid mapping failed validation.");
      result.chat = this.hasChatShape() ? available("mapped-field") : unavailable("Chat ring-buffer mapping failed validation.");
      result.sceneObjects = this.hasSceneShape() ? available("mapped-field") : unavailable("Scene graph or passive tile getters are unavailable.");
      result.inventoryLookup = hasMethod(this.client, "pluginGetInvItemCount") ? available("public-api") : unavailable("Full inventory enumeration is not exposed; item-ID lookup is also unavailable.");
      result.varps = hasMethod(this.client, "pluginGetVarp") ? available("public-api") : unavailable("No public varp getter.");
      result.projection = this.hasProjectionShape() ? available("mapped-field") : unavailable("Camera or terrain-height projection fields failed validation.");
      const local = getField(this.client, this.mapping.player.local);
      result.animation = hasMethod(this.client, "pluginGetPlayerAnimation") ? available("public-api") : numericField(local, this.mapping.player.animation) !== null ? available("mapped-field") : unavailable("No validated player-animation getter or field.");
      result.opponent = this.hasOpponentShape() ? available("mapped-field") : unavailable("Opponent index or NPC table failed validation.");
      result.bankItems = hasMethod(this.client, "pluginGetBankItems") ? available("public-api") : unavailable("The current build does not expose bank enumeration.");
      result.attackStyle = this.readAttackStyle() ? available("mapped-field") : unavailable("Attack-style state kA[43] is not currently a validated index from 0 to 3.");
      return result;
    }
    resolveSkills() {
      this.validationFailures.clear();
      const resolution = resolveSkillFields(this.client, this.mapping);
      this.skills = resolution.resolved;
      for (const failure of resolution.failures) this.validationFailures.add(failure);
      if (this.capabilities) {
        this.capabilities.skills = this.skills ? available(this.skills.source) : unavailable("No unique validated 21-skill mapping.");
      }
    }
    readResolvedSkills() {
      if (!this.skills) return null;
      const xp = readFiniteNumbers(getField(this.client, this.skills.xpField), 21);
      const current = readFiniteNumbers(getField(this.client, this.skills.currentField), 21);
      const base = readFiniteNumbers(getField(this.client, this.skills.baseField), 21);
      if (!xp || !current || !base) return null;
      return { xp, current, base };
    }
    readPublicSkills() {
      if (!hasMethod(this.client, "pluginGetStatXp") || !hasMethod(this.client, "pluginGetStatLevel") || !hasMethod(this.client, "pluginGetStatBase")) return null;
      const xp = [];
      const current = [];
      const base = [];
      for (let id = 0; id < SKILL_NAMES.length; id += 1) {
        const skillXp = callReadMethod(this.client, "pluginGetStatXp", [id]);
        const currentLevel = callReadMethod(this.client, "pluginGetStatLevel", [id]);
        const baseLevel = callReadMethod(this.client, "pluginGetStatBase", [id]);
        if (typeof skillXp !== "number" || !Number.isFinite(skillXp) || skillXp < 0 || typeof currentLevel !== "number" || !Number.isFinite(currentLevel) || currentLevel < 0 || typeof baseLevel !== "number" || !Number.isFinite(baseLevel) || baseLevel < 0) return null;
        xp.push(skillXp);
        current.push(currentLevel);
        base.push(baseLevel);
      }
      return { xp, current, base };
    }
    sameNumbers(left, right) {
      return left.length === right.length && left.every((value, index) => value === right[index]);
    }
    readIngame() {
      const fromMethod = callReadMethod(this.client, "pluginIsIngame");
      if (typeof fromMethod === "boolean") return fromMethod;
      return booleanField(this.client, this.mapping.session.ingame) ?? false;
    }
    readUsername() {
      const fromMethod = callReadMethod(this.client, "pluginGetUsername");
      if (typeof fromMethod === "string" && fromMethod.trim().length > 0) return fromMethod.trim();
      return stringField(getField(this.client, this.mapping.player.local), this.mapping.player.name);
    }
    readPlayer() {
      const tile = this.readPlayerTile();
      if (!tile && !this.capabilities.player.available) return null;
      const energy = callReadMethod(this.client, "pluginGetRunEnergy");
      const running = callReadMethod(this.client, "pluginIsRunning");
      return Object.freeze({
        tile,
        runEnergy: typeof energy === "number" && Number.isFinite(energy) ? energy : null,
        running: typeof running === "boolean" ? running : null,
        animation: (() => {
          const fromMethod = callReadMethod(this.client, "pluginGetPlayerAnimation");
          if (typeof fromMethod === "number" && Number.isFinite(fromMethod)) return Math.floor(fromMethod);
          const raw = numericField(getField(this.client, this.mapping.player.local), this.mapping.player.animation);
          return raw === null ? null : Math.floor(raw);
        })()
      });
    }
    readPlayerTile() {
      const fromMethod = validTile(callReadMethod(this.client, "pluginGetPlayerTile"));
      return fromMethod ?? this.readRawPlayerTile();
    }
    readRawPlayerTile() {
      const local = getField(this.client, this.mapping.player.local);
      const localX = numericField(local, this.mapping.player.localX);
      const localZ = numericField(local, this.mapping.player.localZ);
      const baseX = numericField(this.client, this.mapping.player.baseX);
      const baseZ = numericField(this.client, this.mapping.player.baseZ);
      if (localX === null || localZ === null || baseX === null || baseZ === null) return null;
      const level = numericField(local, this.mapping.player.level) ?? numericField(this.client, this.mapping.player.plane) ?? 0;
      return Object.freeze({
        x: Math.floor(localX / 128) + Math.floor(baseX),
        z: Math.floor(localZ / 128) + Math.floor(baseZ),
        level: Math.floor(level)
      });
    }
    entityToPlayer(slot, entity, local) {
      if (!isRecord(entity)) return null;
      const localX = numericField(entity, this.mapping.player.localX);
      const localZ = numericField(entity, this.mapping.player.localZ);
      const baseX = numericField(this.client, this.mapping.player.baseX);
      const baseZ = numericField(this.client, this.mapping.player.baseZ);
      if (localX === null || localZ === null || baseX === null || baseZ === null) return null;
      const plane = numericField(entity, this.mapping.player.level) ?? numericField(this.client, this.mapping.player.plane) ?? 0;
      const combatLevel = numericField(entity, this.mapping.player.combatLevel) ?? numericField(entity, "combatLevel") ?? (local ? numericField(this.client, this.mapping.player.combatLevel) ?? numericField(this.client, "combatLevel") : null);
      return Object.freeze({
        slot,
        name: stringField(entity, this.mapping.player.name),
        combatLevel: combatLevel === null ? null : Math.floor(combatLevel),
        tile: Object.freeze({
          x: Math.floor(localX / 128) + Math.floor(baseX),
          z: Math.floor(localZ / 128) + Math.floor(baseZ),
          level: Math.floor(plane)
        }),
        local
      });
    }
    hasNpcShape() {
      return validIndexCollection(getField(this.client, this.mapping.npcs.table), 1) && validIndexCollection(getField(this.client, this.mapping.npcs.activeIndices), 1) && numericField(this.client, this.mapping.npcs.activeCount) !== null;
    }
    hasPlayerShape() {
      return validIndexCollection(getField(this.client, this.mapping.players.table), 1) && validIndexCollection(getField(this.client, this.mapping.players.activeIndices), 1) && numericField(this.client, this.mapping.players.activeCount) !== null;
    }
    hasGroundItemShape() {
      return hasMethod(this.client, "pluginGetNearbyGroundItems") || validIndexCollection(getField(this.client, this.mapping.groundItems.grid), 4);
    }
    hasChatShape() {
      return validIndexCollection(getField(this.client, this.mapping.chat.types), 100) && validIndexCollection(getField(this.client, this.mapping.chat.senders), 100) && validIndexCollection(getField(this.client, this.mapping.chat.messages), 100);
    }
    hasSceneShape() {
      const scene = getField(this.client, this.mapping.scene.graph);
      return isRecord(scene) && Object.values(this.mapping.scene.getters).every((methodName) => hasMethod(scene, methodName));
    }
    hasOpponentShape() {
      const local = getField(this.client, this.mapping.player.local);
      const target = numericField(local, this.mapping.player.targetIndex);
      return target !== null && Number.isInteger(target) && validIndexCollection(getField(this.client, this.mapping.npcs.table), 1);
    }
    hasProjectionShape() {
      const projection = this.mapping.projection;
      const heights = getField(this.client, projection.heights);
      const yaw = numericField(this.client, projection.yaw);
      const pitch = numericField(this.client, projection.pitch);
      return validIndexCollection(heights, 4) && numericField(this.client, projection.cameraX) !== null && numericField(this.client, projection.cameraHeight) !== null && numericField(this.client, projection.cameraZ) !== null && yaw !== null && Number.isInteger(yaw) && yaw >= 0 && yaw < 2048 && pitch !== null && Number.isInteger(pitch) && pitch >= 0 && pitch < 2048 && numericField(this.client, projection.mouseX) !== null && numericField(this.client, projection.mouseY) !== null;
    }
    pointInPolygon(x, y, points) {
      let inside = false;
      for (let current = 0, previous = points.length - 1; current < points.length; previous = current, current += 1) {
        const a = points[current];
        const b = points[previous];
        if (!a || !b) continue;
        const crosses = a.y > y !== b.y > y && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x;
        if (crosses) inside = !inside;
      }
      return inside;
    }
    findTerrainIntersection(mouseX, mouseY, plane) {
      const projection = this.mapping.projection;
      const cameraX = numericField(this.client, projection.cameraX);
      const cameraHeight = numericField(this.client, projection.cameraHeight);
      const cameraZ = numericField(this.client, projection.cameraZ);
      const yaw = numericField(this.client, projection.yaw);
      const pitch = numericField(this.client, projection.pitch);
      if (cameraX === null || cameraHeight === null || cameraZ === null || yaw === null || pitch === null) return null;
      const angleUnit = 0.0030679615757712823;
      const sinYaw = Math.sin(angleUnit * yaw);
      const cosYaw = Math.cos(angleUnit * yaw);
      const sinPitch = Math.sin(angleUnit * pitch);
      const cosPitch = Math.cos(angleUnit * pitch);
      const normalizedX = (mouseX - 260) / 512;
      const normalizedY = (mouseY - 171) / 512;
      const cameraPlaneZ = cosPitch - normalizedY * sinPitch;
      const directionX = normalizedX * cosYaw - cameraPlaneZ * sinYaw;
      const directionZ = normalizedX * sinYaw + cameraPlaneZ * cosYaw;
      const directionHeight = normalizedY * cosPitch + sinPitch;
      let previousT = 50;
      let previousDelta = null;
      for (let t = 50; t <= 3500; t += 64) {
        const x = cameraX + directionX * t;
        const z = cameraZ + directionZ * t;
        const terrain = this.readTerrainHeight(Math.floor(x), Math.floor(z), plane);
        if (terrain === null) {
          previousDelta = null;
          previousT = t;
          continue;
        }
        const delta = cameraHeight + directionHeight * t - terrain;
        if (previousDelta !== null && (previousDelta <= 0 && delta >= 0 || previousDelta >= 0 && delta <= 0)) {
          let low = previousT;
          let high = t;
          let lowDelta = previousDelta;
          for (let iteration = 0; iteration < 9; iteration += 1) {
            const middle = (low + high) / 2;
            const middleX = cameraX + directionX * middle;
            const middleZ = cameraZ + directionZ * middle;
            const middleTerrain = this.readTerrainHeight(Math.floor(middleX), Math.floor(middleZ), plane);
            if (middleTerrain === null) break;
            const middleDelta = cameraHeight + directionHeight * middle - middleTerrain;
            if (lowDelta <= 0 && middleDelta >= 0 || lowDelta >= 0 && middleDelta <= 0) {
              high = middle;
            } else {
              low = middle;
              lowDelta = middleDelta;
            }
          }
          const hitT = (low + high) / 2;
          return Object.freeze({ x: cameraX + directionX * hitT, z: cameraZ + directionZ * hitT });
        }
        previousDelta = delta;
        previousT = t;
      }
      return null;
    }
    projectLocalPoint(localX, localZ, plane, heightOffset = 0) {
      if (localX < 128 || localZ < 128 || localX > 13056 || localZ > 13056) return null;
      const terrainHeight = this.readTerrainHeight(localX, localZ, plane);
      if (terrainHeight === null) return null;
      const height = terrainHeight - heightOffset;
      const projection = this.mapping.projection;
      const cameraX = numericField(this.client, projection.cameraX);
      const cameraHeight = numericField(this.client, projection.cameraHeight);
      const cameraZ = numericField(this.client, projection.cameraZ);
      const yaw = numericField(this.client, projection.yaw);
      const pitch = numericField(this.client, projection.pitch);
      if (cameraX === null || cameraHeight === null || cameraZ === null || yaw === null || pitch === null) return null;
      const angleUnit = 0.0030679615757712823;
      const sinYaw = Math.trunc(65536 * Math.sin(angleUnit * yaw));
      const cosYaw = Math.trunc(65536 * Math.cos(angleUnit * yaw));
      const sinPitch = Math.trunc(65536 * Math.sin(angleUnit * pitch));
      const cosPitch = Math.trunc(65536 * Math.cos(angleUnit * pitch));
      const dx = localX - cameraX;
      const dy = height - cameraHeight;
      const dz = localZ - cameraZ;
      const rotatedX = Math.trunc((dz * sinYaw + dx * cosYaw) / 65536);
      const rotatedZ = Math.trunc((dz * cosYaw - dx * sinYaw) / 65536);
      const screenYDepth = Math.trunc((dy * sinPitch + rotatedZ * cosPitch) / 65536);
      if (screenYDepth < 50) return null;
      const rotatedY = Math.trunc((dy * cosPitch - rotatedZ * sinPitch) / 65536);
      return Object.freeze({
        x: 4 + 256 + Math.trunc(rotatedX * 512 / screenYDepth),
        y: 4 + 167 + Math.trunc(rotatedY * 512 / screenYDepth)
      });
    }
    readTerrainHeight(localX, localZ, plane) {
      const tileX = Math.floor(localX / 128);
      const tileZ = Math.floor(localZ / 128);
      if (tileX < 0 || tileZ < 0 || tileX > 103 || tileZ > 103) return null;
      let effectivePlane = Math.max(0, Math.min(3, Math.floor(plane)));
      const flagsPlane = indexValue(getField(this.client, this.mapping.projection.renderFlags), 1);
      const flagsColumn = indexValue(flagsPlane, tileX);
      const flags = indexValue(flagsColumn, tileZ);
      if (effectivePlane < 3 && typeof flags === "number" && (flags & 2) !== 0) effectivePlane += 1;
      const heightPlane = indexValue(getField(this.client, this.mapping.projection.heights), effectivePlane);
      const column = indexValue(heightPlane, tileX);
      const nextColumn = indexValue(heightPlane, tileX + 1);
      const h00 = indexValue(column, tileZ);
      const h10 = indexValue(nextColumn, tileZ);
      const h01 = indexValue(column, tileZ + 1);
      const h11 = indexValue(nextColumn, tileZ + 1);
      if (![h00, h10, h01, h11].every((value) => typeof value === "number" && Number.isFinite(value))) return null;
      const offsetX = localX & 127;
      const offsetZ = localZ & 127;
      const north = Math.trunc((h00 * (128 - offsetX) + h10 * offsetX) / 128);
      const south = Math.trunc((h01 * (128 - offsetX) + h11 * offsetX) / 128);
      return Math.trunc((north * (128 - offsetZ) + south * offsetZ) / 128);
    }
  };

  // src/diagnostics.ts
  function describeOwnProperties(client) {
    if (!isRecord(client)) return Object.freeze([]);
    const entries = [];
    for (const key of Reflect.ownKeys(client)) {
      if (typeof key !== "string") continue;
      const descriptor = Object.getOwnPropertyDescriptor(client, key);
      if (!descriptor) continue;
      if (!("value" in descriptor)) {
        entries.push(Object.freeze({ name: key, type: "accessor" }));
        continue;
      }
      const value = descriptor.value;
      const length = getArrayLikeLength(value);
      const type = value === null ? "null" : ArrayBuffer.isView(value) ? value.constructor.name : Array.isArray(value) ? "Array" : typeof value;
      entries.push(Object.freeze(length === null ? { name: key, type } : { name: key, type, length }));
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    return Object.freeze(entries);
  }
  function describePrototypeMethods(client) {
    if (!isRecord(client)) return Object.freeze([]);
    const names = /* @__PURE__ */ new Set();
    let prototype = Object.getPrototypeOf(client);
    let depth = 0;
    while (prototype && prototype !== Object.prototype && depth < 6) {
      for (const name of Object.getOwnPropertyNames(prototype)) {
        if (name === "constructor") continue;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
        if (descriptor && "value" in descriptor && typeof descriptor.value === "function") names.add(name);
      }
      prototype = Object.getPrototypeOf(prototype);
      depth += 1;
    }
    return Object.freeze([...names].sort());
  }
  function createMappingReport(client, adapter) {
    return Object.freeze({
      clientBuild: detectClientBuild(),
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      clientAvailable: isRecord(client),
      resolvedFields: adapter?.getResolvedFields() ?? Object.freeze({}),
      capabilities: adapter?.getCapabilities() ?? new SolanaClientAdapter(null).getCapabilities(),
      properties: describeOwnProperties(client),
      prototypeMethods: describePrototypeMethods(client),
      validationFailures: adapter?.getValidationFailures() ?? Object.freeze(["gameClient is not available"])
    });
  }
  function detectClientBuild() {
    if (typeof document === "undefined") return CURRENT_FIELD_MAP.build;
    for (const script of document.scripts) {
      const source = script.getAttribute("src");
      if (!source || !/\/client\/client\.js(?:\?|$)/.test(source)) continue;
      try {
        const url = new URL(source, document.baseURI);
        return `${url.pathname.split("/").pop() ?? "client.js"}${url.search}`;
      } catch {
        return source;
      }
    }
    return CURRENT_FIELD_MAP.build;
  }
  function cloneReport(report) {
    return structuredClone(report);
  }

  // src/menu-swapper-core.ts
  var LOW_PRIORITY_OFFSET = 2e3;
  var PLAYER_ACTION_OPCODES = /* @__PURE__ */ new Set([639, 499, 27, 387, 185]);
  var NPC_ACTION_OPCODES = /* @__PURE__ */ new Set([242, 209, 309, 852, 793]);
  var PATCH_MARKER = /* @__PURE__ */ Symbol("solanascape-deck-menu-swapper");
  var FALLBACK_MARKER = /* @__PURE__ */ Symbol("solanascape-deck-menu-fallback");
  var RAW_MENU_FIELDS = Object.freeze(["Tz", "Rz", "Sz"]);
  var DEFAULT_MENU_SWAPPER_SETTINGS = Object.freeze({
    enabled: true,
    playerAttack: true,
    npcAttack: true,
    talkTo: false,
    pickpocket: false,
    bank: false,
    trade: false,
    travel: false,
    take: false,
    shopBuy10: true,
    petClickThrough: true
  });
  var MENU_BUILDERS = Object.freeze([
    Object.freeze({
      kind: "player",
      signature: "Walk here @whi@",
      actionOpcodes: PLAYER_ACTION_OPCODES,
      enabled: (settings) => settings.playerAttack
    }),
    Object.freeze({
      kind: "npc",
      signature: "Examine @yel@",
      actionOpcodes: NPC_ACTION_OPCODES,
      enabled: (settings) => settings.npcAttack
    })
  ]);
  function isRecord2(value) {
    return typeof value === "object" && value !== null;
  }
  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function indexValue2(value, index) {
    if (value === null || value === void 0) return void 0;
    return Reflect.get(Object(value), String(index));
  }
  function isAttackOption(value) {
    return typeof value === "string" && /^attack(?:\s|@|$)/i.test(value.trim());
  }
  function actionText(value) {
    if (typeof value !== "string") return "";
    return value.split(/\s+@[a-z0-9]+@/i, 1)[0]?.trim().toLowerCase() ?? "";
  }
  function targetText(value) {
    if (typeof value !== "string") return "";
    const marker = value.match(/\s+@[a-z0-9]+@/i);
    const target = marker ? value.slice((marker.index ?? 0) + marker[0].length) : value;
    return target.replace(/@[a-z0-9]+@/gi, "").trim().toLowerCase();
  }
  function attackOpcodeWithoutPriority(value, actionOpcodes) {
    if (typeof value !== "number" || !Number.isInteger(value)) return null;
    const baseOpcode = value - LOW_PRIORITY_OFFSET;
    return actionOpcodes.has(baseOpcode) ? baseOpcode : null;
  }
  function getFunctionSource(method) {
    try {
      return Function.prototype.toString.call(method);
    } catch {
      return null;
    }
  }
  function walkPrototypeMethods(client, visit) {
    if (!isRecord2(client)) return null;
    let prototype = Object.getPrototypeOf(client);
    for (let depth = 0; prototype && prototype !== Object.prototype && depth < 8; depth += 1) {
      for (const methodName of Object.getOwnPropertyNames(prototype)) {
        if (methodName === "constructor") continue;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);
        if (!descriptor || typeof descriptor.value !== "function") continue;
        const method = descriptor.value;
        const source = getFunctionSource(method);
        if (!source) continue;
        const result = visit(prototype, methodName, descriptor, source);
        if (result) return result;
      }
      prototype = Object.getPrototypeOf(prototype);
    }
    return null;
  }
  function existingMatch(prototype, methodName, descriptor, kind) {
    const metadata = descriptor.value[PATCH_MARKER];
    if (metadata?.kind !== kind) return null;
    return {
      prototype,
      methodName,
      countField: metadata.countField,
      indexedFields: metadata.indexedFields,
      descriptor
    };
  }
  function findMenuBuilder(client, config) {
    return walkPrototypeMethods(client, (prototype, methodName, descriptor, source) => {
      const alreadyPatched = existingMatch(prototype, methodName, descriptor, config.kind);
      if (alreadyPatched) return alreadyPatched;
      if (descriptor.value[PATCH_MARKER]) return null;
      if (!source.includes(config.signature) || !/["']attack["']/i.test(source)) return null;
      const countMatch = source.match(/this\.([A-Za-z_$][\w$]*)\s*>=\s*400/);
      const countField = countMatch?.[1];
      if (!countField) return null;
      const indexedPattern = new RegExp(
        `this\\.([A-Za-z_$][\\w$]*)\\[this\\.${escapeRegExp(countField)}\\]`,
        "g"
      );
      const indexedFields = /* @__PURE__ */ new Set();
      for (const match of source.matchAll(indexedPattern)) {
        if (match[1]) indexedFields.add(match[1]);
      }
      if (indexedFields.size < 2) return null;
      return { prototype, methodName, countField, indexedFields: Object.freeze([...indexedFields]), descriptor };
    });
  }
  function findSceneMenuBuilder(client) {
    return walkPrototypeMethods(client, (prototype, methodName, descriptor, source) => {
      const alreadyPatched = existingMatch(prototype, methodName, descriptor, "scene");
      if (alreadyPatched) return alreadyPatched;
      if (descriptor.value[PATCH_MARKER]) return null;
      if (!source.includes("Examine @cya@") || !source.includes("Take @lre@") || !source.includes("Walk here")) return null;
      const walkMatch = source.match(
        /this\.([A-Za-z_$][\w$]*)\[this\.([A-Za-z_$][\w$]*)\]\s*=\s*["']Walk here["'][\s\S]{0,180}?this\.([A-Za-z_$][\w$]*)\[this\.\2\]\s*=\s*718/
      );
      const optionField = walkMatch?.[1];
      const countField = walkMatch?.[2];
      const opcodeField = walkMatch?.[3];
      if (!optionField || !countField || !opcodeField) return null;
      const indexedPattern = new RegExp(
        `this\\.([A-Za-z_$][\\w$]*)\\[this\\.${escapeRegExp(countField)}\\]`,
        "g"
      );
      const indexedFields = /* @__PURE__ */ new Set();
      for (const match of source.matchAll(indexedPattern)) {
        if (match[1]) indexedFields.add(match[1]);
      }
      if (!indexedFields.has(optionField) || !indexedFields.has(opcodeField) || indexedFields.size < 4) return null;
      return {
        prototype,
        methodName,
        countField,
        indexedFields: Object.freeze([...indexedFields]),
        optionField,
        opcodeField,
        descriptor
      };
    });
  }
  function findShopMenuBuilder(client) {
    return walkPrototypeMethods(client, (prototype, methodName, descriptor, source) => {
      const alreadyPatched = existingMatch(prototype, methodName, descriptor, "shop");
      if (alreadyPatched) return alreadyPatched;
      if (descriptor.value[PATCH_MARKER]) return null;
      if (!source.includes("Buy 10")) return null;
      const countMatch = source.match(/this\.([A-Za-z_$][\w$]*)\s*>=\s*400/);
      const countField = countMatch?.[1];
      if (!countField) return null;
      const buyMatch = source.match(
        /this\.([A-Za-z_$][\w$]*)\[this\.([A-Za-z_$][\w$]*)\]\s*=\s*["']Buy 10\b/
      );
      const optionField = buyMatch?.[1];
      if (!optionField || buyMatch?.[2] !== countField) return null;
      const indexedPattern = new RegExp(
        `this\\.([A-Za-z_$][\\w$]*)\\[this\\.${escapeRegExp(countField)}\\]`,
        "g"
      );
      const indexedFields = /* @__PURE__ */ new Set();
      for (const match of source.matchAll(indexedPattern)) {
        if (match[1]) indexedFields.add(match[1]);
      }
      if (!indexedFields.has(optionField) || indexedFields.size < 2) return null;
      return {
        prototype,
        methodName,
        countField,
        indexedFields: Object.freeze([...indexedFields]),
        optionField,
        descriptor
      };
    });
  }
  function boundedCount(value, fallback = 0) {
    return typeof value === "number" && Number.isInteger(value) ? Math.max(0, Math.min(400, value)) : fallback;
  }
  function moveRowsToEnd(client, fields, indexes, start, end) {
    if (indexes.length === 0) return;
    const selected = new Set(indexes);
    const order = [
      ...Array.from({ length: end - start }, (_, offset) => start + offset).filter((index) => !selected.has(index)),
      ...indexes
    ];
    for (const field of fields) {
      const collection = Reflect.get(client, field);
      if (collection === null || collection === void 0) continue;
      const rows = order.map((index) => indexValue2(collection, index));
      rows.forEach((value, offset) => Reflect.set(Object(collection), String(start + offset), value));
    }
  }
  function moveRowsToStart(client, fields, indexes, start, end) {
    if (indexes.length === 0) return;
    const selected = new Set(indexes);
    const order = [
      ...indexes,
      ...Array.from({ length: end - start }, (_, offset) => start + offset).filter((index) => !selected.has(index))
    ];
    for (const field of fields) {
      const collection = Reflect.get(client, field);
      if (collection === null || collection === void 0) continue;
      const rows = order.map((index) => indexValue2(collection, index));
      rows.forEach((value, offset) => Reflect.set(Object(collection), String(start + offset), value));
    }
  }
  function moveKnownRawRowsToEnd(client, indexes, start, end) {
    moveRowsToEnd(client, RAW_MENU_FIELDS, indexes, start, end);
  }
  function matchingIndexes(client, optionField, start, end, predicate) {
    const options = Reflect.get(client, optionField);
    const indexes = [];
    for (let index = start; index < end; index += 1) {
      if (predicate(actionText(indexValue2(options, index)))) indexes.push(index);
    }
    return indexes;
  }
  function petIndexes(client, optionField, start, end) {
    const options = Reflect.get(client, optionField);
    const indexes = [];
    for (let index = start; index < end; index += 1) {
      const option = indexValue2(options, index);
      const action = actionText(option);
      const target = targetText(option);
      const petAction = /^(?:pick-up|toggle aura|stroke|shoo-away)$/.test(action);
      if (petAction || action === "examine" && /\b(?:pet|drake)\b/.test(target)) indexes.push(index);
    }
    return indexes;
  }
  function prioritizeConfiguredActions(client, match, start, end, settings) {
    const { optionField, opcodeField } = match;
    if (!optionField || !opcodeField || !settings.enabled) return;
    const options = Reflect.get(client, optionField);
    const opcodes = Reflect.get(client, opcodeField);
    if (settings.petClickThrough) {
      moveRowsToStart(client, match.indexedFields, petIndexes(client, optionField, start, end), start, end);
    }
    for (let index = start; index < end; index += 1) {
      const option = indexValue2(options, index);
      const isPlayer = typeof option === "string" && /@whi@/i.test(option);
      const isNpc = typeof option === "string" && /@yel@/i.test(option);
      if (!isAttackOption(option) || !isPlayer && !isNpc) continue;
      const configured = isPlayer ? settings.playerAttack : settings.npcAttack;
      const knownOpcodes = isPlayer ? PLAYER_ACTION_OPCODES : NPC_ACTION_OPCODES;
      if (!configured) continue;
      const baseOpcode = attackOpcodeWithoutPriority(indexValue2(opcodes, index), knownOpcodes);
      if (baseOpcode !== null) Reflect.set(Object(opcodes), String(index), baseOpcode);
    }
    const rules = [
      [settings.talkTo, (action) => action === "talk-to"],
      [settings.travel, (action) => /^(?:enter|open|climb(?:-up|-down)?|quick-.+|travel|charter|pay-fare)$/.test(action)],
      [settings.take, (action) => action === "take"],
      [settings.shopBuy10, (action) => action === "buy 10"],
      [settings.pickpocket, (action) => action === "pickpocket"],
      [settings.trade, (action) => action === "trade" || action === "trade with"],
      [settings.bank, (action) => action === "bank" || action === "banker" || action === "collect"]
    ];
    for (const [enabled, predicate] of rules) {
      if (!enabled) continue;
      const indexes = matchingIndexes(client, optionField, start, end, predicate);
      moveRowsToEnd(client, match.indexedFields, indexes, start, end);
    }
  }
  function prioritizeShopActions(client, match, start, end, settings) {
    const { optionField } = match;
    if (!optionField || !settings.enabled || !settings.shopBuy10) return;
    const indexes = matchingIndexes(client, optionField, start, end, (action) => action === "buy 10");
    moveRowsToEnd(client, match.indexedFields, indexes, start, end);
  }
  function prioritizeRawShopActions(client, settings) {
    if (!settings.enabled || !settings.shopBuy10) return;
    const count = boundedCount(Reflect.get(client, "Jz"));
    if (count <= 1) return;
    const indexes = matchingIndexes(client, "Tz", 0, count, (action) => action === "buy 10");
    moveKnownRawRowsToEnd(client, indexes, 0, count);
  }
  function patchAttackBuilder(match, config, getSettings) {
    const existing = match.descriptor.value;
    if (existing[PATCH_MARKER]) return false;
    const { countField, indexedFields } = match;
    const wrapped = function(...args) {
      const before = isRecord2(this) ? boundedCount(Reflect.get(this, countField)) : 0;
      const result = Reflect.apply(existing, this, args);
      if (!isRecord2(this)) return result;
      const settings = getSettings();
      if (!settings.enabled || !config.enabled(settings)) return result;
      const after = boundedCount(Reflect.get(this, countField), before);
      for (let index = before; index < after; index += 1) {
        const hasAttackOption = indexedFields.some((field) => isAttackOption(indexValue2(Reflect.get(this, field), index)));
        if (!hasAttackOption) continue;
        for (const field of indexedFields) {
          const collection = Reflect.get(this, field);
          const baseOpcode = attackOpcodeWithoutPriority(indexValue2(collection, index), config.actionOpcodes);
          if (baseOpcode !== null) Reflect.set(Object(collection), String(index), baseOpcode);
        }
      }
      return result;
    };
    Object.defineProperty(wrapped, PATCH_MARKER, {
      value: Object.freeze({ kind: config.kind, countField, indexedFields })
    });
    Object.defineProperty(match.prototype, match.methodName, { ...match.descriptor, value: wrapped });
    return true;
  }
  function patchSceneBuilder(match, getSettings) {
    const existing = match.descriptor.value;
    if (existing[PATCH_MARKER]) return false;
    const { countField, indexedFields } = match;
    const wrapped = function(...args) {
      const before = isRecord2(this) ? boundedCount(Reflect.get(this, countField)) : 0;
      const result = Reflect.apply(existing, this, args);
      if (!isRecord2(this)) return result;
      const after = boundedCount(Reflect.get(this, countField), before);
      prioritizeConfiguredActions(this, match, before, after, getSettings());
      return result;
    };
    Object.defineProperty(wrapped, PATCH_MARKER, {
      value: Object.freeze({ kind: "scene", countField, indexedFields })
    });
    Object.defineProperty(match.prototype, match.methodName, { ...match.descriptor, value: wrapped });
    return true;
  }
  function patchShopBuilder(match, getSettings) {
    const existing = match.descriptor.value;
    if (existing[PATCH_MARKER]) return false;
    const { countField, indexedFields } = match;
    const wrapped = function(...args) {
      const before = isRecord2(this) ? boundedCount(Reflect.get(this, countField)) : 0;
      const result = Reflect.apply(existing, this, args);
      if (!isRecord2(this)) return result;
      const after = boundedCount(Reflect.get(this, countField), before);
      prioritizeShopActions(this, match, before, after, getSettings());
      return result;
    };
    Object.defineProperty(wrapped, PATCH_MARKER, {
      value: Object.freeze({ kind: "shop", countField, indexedFields })
    });
    Object.defineProperty(match.prototype, match.methodName, { ...match.descriptor, value: wrapped });
    return true;
  }
  function installRawMenuFallback(client, getSettings) {
    if (!isRecord2(client)) return false;
    const marked = client;
    if (marked[FALLBACK_MARKER]) return true;
    Object.defineProperty(marked, FALLBACK_MARKER, { value: true });
    const tick = () => {
      if (!marked[FALLBACK_MARKER]) return;
      prioritizeRawShopActions(client, getSettings());
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
    return true;
  }
  function installMenuSwapper(client, getSettings = () => DEFAULT_MENU_SWAPPER_SETTINGS) {
    const methodNames = [];
    const fallbackInstalled = installRawMenuFallback(client, getSettings);
    const sceneMatch = findSceneMenuBuilder(client);
    if (sceneMatch) {
      methodNames.push(sceneMatch.methodName);
      patchSceneBuilder(sceneMatch, getSettings);
    }
    const shopMatch = findShopMenuBuilder(client);
    if (shopMatch) {
      methodNames.push(shopMatch.methodName);
      patchShopBuilder(shopMatch, getSettings);
    }
    for (const config of MENU_BUILDERS) {
      const match = findMenuBuilder(client, config);
      if (!match) continue;
      methodNames.push(match.methodName);
      patchAttackBuilder(match, config, getSettings);
    }
    if (methodNames.length === 0 && !fallbackInstalled) {
      return Object.freeze({
        patched: false,
        methodNames: Object.freeze([]),
        sceneMenu: false,
        reason: "Native menu builders were not recognized."
      });
    }
    return Object.freeze({ patched: true, methodNames: Object.freeze(methodNames), sceneMenu: Boolean(sceneMatch) });
  }

  // src/observer.ts
  var ClientObserver = class {
    constructor(pageWindow, slices, intervalMs = 250) {
      this.pageWindow = pageWindow;
      this.slices = slices;
      this.intervalMs = intervalMs;
    }
    pageWindow;
    slices;
    intervalMs;
    adapter = null;
    client = null;
    previous = null;
    timer = null;
    listeners = /* @__PURE__ */ new Set();
    start() {
      if (this.timer !== null) return;
      this.tick();
      this.timer = window.setInterval(() => this.tick(), this.intervalMs);
    }
    stop() {
      if (this.timer !== null) window.clearInterval(this.timer);
      this.timer = null;
    }
    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    getAdapter() {
      return this.adapter;
    }
    getSnapshot() {
      return this.previous;
    }
    getCapabilities() {
      return this.adapter?.getCapabilities() ?? new SolanaClientAdapter(null).getCapabilities();
    }
    tick() {
      const nextClient = this.pageWindow.gameClient ?? null;
      const clientChanged = nextClient !== this.client;
      if (clientChanged) {
        this.client = nextClient;
        this.adapter = nextClient === null ? null : new SolanaClientAdapter(nextClient);
      }
      const at = Date.now();
      const slices = typeof this.slices === "function" ? this.slices() : this.slices;
      const snapshot = this.adapter?.readSnapshot(at, document.visibilityState === "visible", slices) ?? null;
      let activeDeltaMs = 0;
      if (!clientChanged && snapshot?.ingame && snapshot.visible && this.previous?.ingame && this.previous.visible) {
        activeDeltaMs = Math.max(0, Math.min(1e3, snapshot.at - this.previous.at));
      }
      const update = Object.freeze({
        snapshot,
        previous: this.previous,
        capabilities: this.adapter?.getCapabilities() ?? new SolanaClientAdapter(null).getCapabilities(),
        activeDeltaMs,
        clientChanged
      });
      this.previous = snapshot;
      for (const listener of this.listeners) listener(update);
    }
  };

  // src/plugin-manager.ts
  var PluginManager = class {
    plugins = [];
    mounted = false;
    register(plugin) {
      if (this.mounted) throw new Error("Plugins must be registered before mounting.");
      if (this.plugins.some((entry) => entry.id === plugin.id)) throw new Error(`Duplicate plugin id: ${plugin.id}`);
      this.plugins.push(plugin);
    }
    mount(context) {
      if (this.mounted) return;
      for (const plugin of this.plugins) plugin.mount(context);
      this.mounted = true;
    }
    update(update) {
      if (!this.mounted) return;
      for (const plugin of this.plugins) {
        const reasons = plugin.requiredCapabilities.map((capability) => update.capabilities[capability]).filter((status) => !status.available).map((status) => status.reason ?? "Capability unavailable.");
        plugin.onAvailability(reasons.length === 0, Object.freeze(reasons));
        plugin.onUpdate(update);
      }
    }
    requiredSlices() {
      return new Set(this.plugins.flatMap((plugin) => plugin.activeSlices?.() ?? plugin.requiredSlices));
    }
    unmount() {
      for (const plugin of this.plugins) plugin.unmount();
      this.mounted = false;
    }
  };

  // src/plugins/attack-style-hud.ts
  var AttackStyleHudPlugin = class {
    id = "attack-style-hud";
    requiredCapabilities = Object.freeze(["attackStyle"]);
    requiredSlices = Object.freeze([]);
    layer = null;
    hud = null;
    title = null;
    available = false;
    context = null;
    renderedStyle = null;
    resizeBound = () => this.syncToCanvas();
    mount(context) {
      this.context = context;
      const layer = document.createElement("div");
      layer.className = "sl-attack-style-layer";
      layer.hidden = true;
      const hud = document.createElement("div");
      hud.className = "sl-attack-style-hud";
      hud.setAttribute("role", "status");
      hud.setAttribute("aria-label", "Current attack style");
      const title = document.createElement("div");
      title.className = "sl-attack-style-title";
      hud.append(title);
      layer.append(hud);
      context.shadowRoot.append(layer);
      this.layer = layer;
      this.hud = hud;
      this.title = title;
      window.addEventListener("resize", this.resizeBound);
      window.addEventListener("scroll", this.resizeBound, { passive: true });
      this.syncToCanvas();
    }
    onAvailability(available2) {
      this.available = available2;
      if (!available2 && this.layer) this.layer.hidden = true;
    }
    onUpdate(update) {
      if (update.clientChanged) this.syncToCanvas();
      const style = update.snapshot?.ingame ? update.snapshot.attackStyle : null;
      if (!this.layer || !this.title || !this.available || !style || !this.context?.settings.get().showAttackStyle) {
        if (this.layer) this.layer.hidden = true;
        this.renderedStyle = null;
        return;
      }
      if (this.renderedStyle !== style.name) {
        this.title.textContent = style.name;
        this.renderedStyle = style.name;
      }
      this.layer.hidden = false;
    }
    unmount() {
      window.removeEventListener("resize", this.resizeBound);
      window.removeEventListener("scroll", this.resizeBound);
      this.layer?.remove();
      this.layer = null;
      this.hud = null;
      this.title = null;
      this.context = null;
      this.renderedStyle = null;
    }
    syncToCanvas() {
      if (!this.layer) return;
      const canvas = document.querySelector("canvas#canvas");
      const rect = canvas?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        this.layer.hidden = true;
        return;
      }
      this.layer.style.left = `${Math.round(rect.left)}px`;
      this.layer.style.top = `${Math.round(rect.top)}px`;
      this.layer.style.width = `${Math.round(rect.width)}px`;
      this.layer.style.height = `${Math.round(rect.height)}px`;
    }
  };

  // src/plugins/combat-hud.ts
  var CombatHudPlugin = class {
    id = "combat-hud";
    requiredCapabilities = Object.freeze(["opponent"]);
    requiredSlices = Object.freeze([]);
    context = null;
    layer = null;
    opponent = null;
    opponentName = null;
    opponentFill = null;
    opponentLabel = null;
    available = false;
    renderKey = "";
    resizeBound = () => this.syncToCanvas();
    mount(context) {
      this.context = context;
      const layer = document.createElement("div");
      layer.className = "sl-combat-layer";
      layer.hidden = true;
      const scene = document.createElement("div");
      scene.className = "sl-combat-scene";
      const opponent = document.createElement("div");
      opponent.className = "sl-opponent-panel";
      opponent.hidden = true;
      const opponentName = document.createElement("div");
      opponentName.className = "sl-opponent-name";
      const track = document.createElement("div");
      track.className = "sl-opponent-track";
      const opponentFill = document.createElement("div");
      opponentFill.className = "sl-opponent-fill";
      const opponentLabel = document.createElement("span");
      opponentLabel.className = "sl-opponent-label";
      track.append(opponentFill, opponentLabel);
      opponent.append(opponentName, track);
      scene.append(opponent);
      layer.append(scene);
      context.shadowRoot.append(layer);
      this.layer = layer;
      this.opponent = opponent;
      this.opponentName = opponentName;
      this.opponentFill = opponentFill;
      this.opponentLabel = opponentLabel;
      window.addEventListener("resize", this.resizeBound);
      window.addEventListener("scroll", this.resizeBound, { passive: true });
      this.syncToCanvas();
    }
    onAvailability(available2) {
      this.available = available2;
      this.renderKey = "";
      if (!available2 && this.layer) this.layer.hidden = true;
    }
    onUpdate(update) {
      if (update.clientChanged) this.syncToCanvas();
      const snapshot = update.snapshot;
      const settings = this.context?.settings.get();
      const opponent = settings?.showOpponentInfo ? snapshot?.opponent ?? null : null;
      const key = this.available && snapshot?.ingame && opponent ? [opponent.slot, opponent.healthRatio, opponent.healthScale].join("|") : "hidden";
      if (key === this.renderKey) return;
      this.renderKey = key;
      if (key === "hidden" || !opponent) {
        if (this.layer) this.layer.hidden = true;
        return;
      }
      if (this.opponent) this.opponent.hidden = false;
      if (this.opponentName && this.opponentFill && this.opponentLabel) {
        this.opponentName.textContent = opponent.name ?? `NPC ${opponent.id ?? opponent.slot}`;
        this.opponentFill.style.width = `${opponent.healthPercent}%`;
        this.opponentLabel.textContent = `${Math.round(opponent.healthPercent)}%`;
      }
      if (this.layer) this.layer.hidden = false;
    }
    unmount() {
      window.removeEventListener("resize", this.resizeBound);
      window.removeEventListener("scroll", this.resizeBound);
      this.layer?.remove();
      this.context = null;
      this.layer = null;
    }
    syncToCanvas() {
      if (!this.layer) return;
      const rect = document.querySelector("canvas#canvas")?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        this.layer.hidden = true;
        return;
      }
      this.layer.style.left = `${Math.round(rect.left)}px`;
      this.layer.style.top = `${Math.round(rect.top)}px`;
      this.layer.style.setProperty("--sl-canvas-scale-x", String(rect.width / 765));
      this.layer.style.setProperty("--sl-canvas-scale-y", String(rect.height / 503));
    }
  };

  // src/defensive-style-guard.ts
  var tabFieldCache = /* @__PURE__ */ new WeakMap();
  function isRecord3(value) {
    return typeof value === "object" && value !== null;
  }
  function sourceOf(value) {
    if (typeof value !== "function") return null;
    try {
      return Function.prototype.toString.call(value);
    } catch {
      return null;
    }
  }
  function escapeRegExp2(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function methodOnPrototype(prototype, name) {
    for (let current = prototype; current && current !== Object.prototype; current = Object.getPrototypeOf(current)) {
      const descriptor = Object.getOwnPropertyDescriptor(current, name);
      if (typeof descriptor?.value === "function") return descriptor.value;
    }
    return null;
  }
  function resolveCurrentSideTabField(client) {
    if (!isRecord3(client)) return null;
    const prototype = Object.getPrototypeOf(client);
    if (!prototype) return null;
    if (tabFieldCache.has(prototype)) return tabFieldCache.get(prototype) ?? null;
    const publicMethod = methodOnPrototype(prototype, "pluginSetSideTab");
    const publicSource = sourceOf(publicMethod);
    const parameter = publicSource?.match(/^[^(]*\(\s*([A-Za-z_$][\w$]*)/)?.[1];
    if (!publicSource || !parameter) {
      tabFieldCache.set(prototype, null);
      return null;
    }
    const delegateMatch = publicSource.match(new RegExp(`this\\.([A-Za-z_$][\\w$]*)\\(\\s*${escapeRegExp2(parameter)}\\s*\\)`));
    const delegateName = delegateMatch?.[1];
    const delegate = delegateName ? methodOnPrototype(prototype, delegateName) : null;
    const delegateSource = sourceOf(delegate);
    const delegateParameter = delegateSource?.match(/^[^(]*\(\s*([A-Za-z_$][\w$]*)/)?.[1];
    if (!delegateSource || !delegateParameter || !delegateSource.includes("13")) {
      tabFieldCache.set(prototype, null);
      return null;
    }
    const fieldMatch = delegateSource.match(new RegExp(`this\\.([A-Za-z_$][\\w$]*)\\s*=\\s*${escapeRegExp2(delegateParameter)}(?:\\W|$)`));
    const field = fieldMatch?.[1] ?? null;
    tabFieldCache.set(prototype, field);
    return field;
  }
  function readCurrentSideTab(client) {
    if (!isRecord3(client)) return null;
    const field = resolveCurrentSideTabField(client);
    if (!field) return null;
    const value = Reflect.get(client, field);
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 13 ? value : null;
  }

  // src/plugins/defensive-style-guard.ts
  var DefensiveStyleGuardPlugin = class {
    id = "defensive-style-guard";
    requiredCapabilities = Object.freeze(["session"]);
    requiredSlices = Object.freeze([]);
    context = null;
    layer = null;
    blocker = null;
    available = false;
    resizeBound = () => this.syncToCanvas();
    mount(context) {
      this.context = context;
      const layer = document.createElement("div");
      layer.className = "sl-defensive-style-layer";
      layer.hidden = true;
      const scene = document.createElement("div");
      scene.className = "sl-defensive-style-scene";
      const blocker = document.createElement("div");
      blocker.className = "sl-defensive-style-blocker";
      blocker.setAttribute("role", "status");
      blocker.setAttribute("aria-label", "Defensive combat style hidden");
      blocker.title = "Defensive style hidden by Solanascape Deck";
      blocker.addEventListener("contextmenu", (event) => event.preventDefault());
      const cross = document.createElement("span");
      cross.className = "sl-defensive-style-cross";
      const message = document.createElement("span");
      message.className = "sl-defensive-style-message";
      message.textContent = "Defensive style hidden";
      blocker.append(cross, message);
      scene.append(blocker);
      layer.append(scene);
      context.shadowRoot.append(layer);
      this.layer = layer;
      this.blocker = blocker;
      window.addEventListener("resize", this.resizeBound);
      window.addEventListener("scroll", this.resizeBound, { passive: true });
      this.syncToCanvas();
    }
    onAvailability(available2) {
      this.available = available2;
      if (!available2 && this.layer) this.layer.hidden = true;
    }
    onUpdate(update) {
      if (update.clientChanged) this.syncToCanvas();
      const enabled = this.context?.settings.get().hideDefensiveStyle ?? false;
      const currentTab = readCurrentSideTab(this.context?.getClient?.());
      const visible = Boolean(enabled && this.available && update.snapshot?.ingame && currentTab === 0);
      if (this.layer) this.layer.hidden = !visible;
    }
    unmount() {
      window.removeEventListener("resize", this.resizeBound);
      window.removeEventListener("scroll", this.resizeBound);
      this.layer?.remove();
      this.context = null;
      this.layer = null;
      this.blocker = null;
    }
    syncToCanvas() {
      if (!this.layer) return;
      const rect = document.querySelector("canvas#canvas")?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        this.layer.hidden = true;
        return;
      }
      this.layer.style.left = `${Math.round(rect.left)}px`;
      this.layer.style.top = `${Math.round(rect.top)}px`;
      this.layer.style.width = `${Math.round(rect.width)}px`;
      this.layer.style.height = `${Math.round(rect.height)}px`;
      this.layer.style.setProperty("--sl-canvas-scale-x", String(rect.width / 765));
      this.layer.style.setProperty("--sl-canvas-scale-y", String(rect.height / 503));
    }
  };

  // src/audio-alert.ts
  function getAudioContextConstructor() {
    const audioWindow = window;
    return window.AudioContext ?? audioWindow.webkitAudioContext ?? null;
  }
  function createToneBeeper(options) {
    let context = null;
    const duration = options.durationSeconds ?? 0.15;
    const sound = () => {
      if (!context || context.state === "closed") return;
      const start = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(options.frequency, start);
      gain.gain.setValueAtTime(1e-4, start);
      gain.gain.exponentialRampToValueAtTime(options.peakGain, start + 8e-3);
      gain.gain.exponentialRampToValueAtTime(1e-4, start + duration - 0.01);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration);
    };
    return () => {
      try {
        const AudioContextClass = getAudioContextConstructor();
        if (!AudioContextClass) return;
        context ??= new AudioContextClass();
        if (context.state === "suspended") {
          void context.resume().then(sound).catch(() => void 0);
        } else {
          sound();
        }
      } catch {
      }
    };
  }

  // src/plugins/hitpoints-notifier.ts
  var HITPOINTS_SKILL_ID = 3;
  var LOW_HITPOINTS_THRESHOLD = 10;
  var CRITICAL_HITPOINTS_THRESHOLD = 5;
  var PRAYER_ALERT_GAIN = 0.055;
  var HITPOINTS_ALERT_GAIN = PRAYER_ALERT_GAIN * 1.2;
  var HitpointsNotifierPlugin = class {
    id = "hitpoints-notifier";
    requiredCapabilities = Object.freeze(["skills"]);
    requiredSlices = Object.freeze(["skills"]);
    available = false;
    context = null;
    previousHitpoints = null;
    beep;
    criticalBeep;
    constructor(beep = createToneBeeper({ frequency: 440, peakGain: HITPOINTS_ALERT_GAIN }), criticalBeep = createToneBeeper({ frequency: 440, peakGain: HITPOINTS_ALERT_GAIN * 1.25 })) {
      this.beep = beep;
      this.criticalBeep = criticalBeep;
    }
    mount(context) {
      this.context = context;
    }
    onAvailability(available2) {
      this.available = available2;
      if (!available2) this.previousHitpoints = null;
    }
    onUpdate(update) {
      const snapshot = update.snapshot;
      const alertsEnabled = this.context?.settings.get().hitpointsAlerts ?? true;
      const hitpoints = snapshot?.ingame && this.available && alertsEnabled ? snapshot.skills?.[HITPOINTS_SKILL_ID]?.currentLevel ?? null : null;
      if (hitpoints === null || !Number.isFinite(hitpoints)) {
        this.previousHitpoints = null;
        return;
      }
      if (!update.clientChanged && this.previousHitpoints !== null) {
        if (this.previousHitpoints >= CRITICAL_HITPOINTS_THRESHOLD && hitpoints < CRITICAL_HITPOINTS_THRESHOLD) {
          this.criticalBeep();
        } else if (this.previousHitpoints >= LOW_HITPOINTS_THRESHOLD && hitpoints < LOW_HITPOINTS_THRESHOLD) {
          this.beep();
        }
      }
      this.previousHitpoints = hitpoints;
    }
    unmount() {
      this.previousHitpoints = null;
      this.context = null;
    }
  };

  // src/plugins/ground-item-labels.ts
  var GroundItemLabelsPlugin = class {
    id = "ground-item-labels";
    requiredCapabilities = Object.freeze(["groundItems", "projection", "player"]);
    requiredSlices = Object.freeze(["groundItems"]);
    context = null;
    layer = null;
    scene = null;
    items = Object.freeze([]);
    labels = /* @__PURE__ */ new Map();
    available = false;
    ingame = false;
    frameRequest = null;
    scaleX = 1;
    scaleY = 1;
    resizeBound = () => this.syncToCanvas();
    frameBound = () => {
      this.frameRequest = null;
      this.renderFrame();
      this.syncFrameLoop();
    };
    activeSlices() {
      return this.context?.settings.get().showGroundItemLabels ? this.requiredSlices : Object.freeze([]);
    }
    mount(context) {
      this.context = context;
      const layer = document.createElement("div");
      layer.className = "sl-ground-item-layer";
      layer.hidden = true;
      const scene = document.createElement("div");
      scene.className = "sl-ground-item-scene";
      layer.append(scene);
      context.shadowRoot.append(layer);
      this.layer = layer;
      this.scene = scene;
      window.addEventListener("resize", this.resizeBound);
      window.addEventListener("scroll", this.resizeBound, { passive: true });
      this.syncToCanvas();
    }
    onAvailability(available2) {
      this.available = available2;
      if (!available2) this.clear();
      this.syncFrameLoop();
    }
    onUpdate(update) {
      if (update.clientChanged) this.syncToCanvas();
      this.ingame = update.snapshot?.ingame ?? false;
      this.items = update.snapshot?.groundItems ?? Object.freeze([]);
      if (!this.shouldRender()) this.clear();
      this.syncFrameLoop();
    }
    unmount() {
      window.removeEventListener("resize", this.resizeBound);
      window.removeEventListener("scroll", this.resizeBound);
      if (this.frameRequest !== null) window.cancelAnimationFrame(this.frameRequest);
      this.frameRequest = null;
      this.labels.clear();
      this.layer?.remove();
      this.context = null;
      this.layer = null;
      this.scene = null;
      this.items = Object.freeze([]);
    }
    shouldRender() {
      return Boolean(
        this.available && this.ingame && this.items.length > 0 && this.context?.settings.get().showGroundItemLabels && this.context.projectGroundItems
      );
    }
    syncFrameLoop() {
      const shouldRun = this.shouldRender();
      if (shouldRun && this.frameRequest === null) this.frameRequest = window.requestAnimationFrame(this.frameBound);
      if (!shouldRun && this.frameRequest !== null) {
        window.cancelAnimationFrame(this.frameRequest);
        this.frameRequest = null;
      }
    }
    renderFrame() {
      if (!this.shouldRender() || !this.scene || !this.layer) return;
      const projected = this.context?.projectGroundItems?.(this.items) ?? Object.freeze([]);
      const visible = projected.filter((item) => item.point.x >= 4 && item.point.x < 516 && item.point.y >= 4 && item.point.y < 338);
      if (visible.length === 0) {
        this.clear();
        return;
      }
      const used = /* @__PURE__ */ new Set();
      const stackDepth = /* @__PURE__ */ new Map();
      visible.forEach((item, index) => {
        const tileKey = `${item.tile.level}:${item.tile.x}:${item.tile.z}`;
        const depth = stackDepth.get(tileKey) ?? 0;
        stackDepth.set(tileKey, depth + 1);
        const key = `${tileKey}:${item.id}:${index}`;
        used.add(key);
        let label = this.labels.get(key);
        if (!label) {
          label = document.createElement("div");
          label.className = "sl-ground-item-label";
          this.labels.set(key, label);
          this.scene?.append(label);
        }
        const text = this.formatLabel(item);
        if (label.textContent !== text) label.textContent = text;
        label.style.left = `${item.point.x * this.scaleX}px`;
        label.style.top = `${item.point.y * this.scaleY - depth * 15}px`;
      });
      for (const [key, label] of this.labels) {
        if (used.has(key)) continue;
        label.remove();
        this.labels.delete(key);
      }
      this.layer.hidden = false;
    }
    formatLabel(item) {
      const name = item.name ?? `Item ${item.id}`;
      return item.count > 1 ? `${name} (${this.formatStackSize(item.count)})` : name;
    }
    formatStackSize(quantity) {
      if (quantity < 1e4) return quantity.toLocaleString("en-US");
      const suffixes = ["", "K", "M", "B"];
      const power = Math.min(3, Math.floor(Math.log10(quantity) / 3));
      const formatted = (quantity / 10 ** (power * 3)).toLocaleString("en-US", { maximumFractionDigits: 3 });
      const shortened = formatted.length > 4 ? formatted.slice(0, 4) : formatted;
      return `${shortened.endsWith(".") ? shortened.slice(0, -1) : shortened}${suffixes[power]}`;
    }
    clear() {
      for (const label of this.labels.values()) label.remove();
      this.labels.clear();
      if (this.layer) this.layer.hidden = true;
    }
    syncToCanvas() {
      if (!this.layer) return;
      const rect = document.querySelector("canvas#canvas")?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        this.layer.hidden = true;
        return;
      }
      this.layer.style.left = `${Math.round(rect.left)}px`;
      this.layer.style.top = `${Math.round(rect.top)}px`;
      this.layer.style.width = `${Math.round(rect.width)}px`;
      this.layer.style.height = `${Math.round(rect.height)}px`;
      this.scaleX = rect.width / 765;
      this.scaleY = rect.height / 503;
    }
  };

  // src/plugins/prayer-notifier.ts
  var PRAYER_SKILL_ID = 5;
  var LOW_PRAYER_THRESHOLD = 10;
  var CRITICAL_PRAYER_THRESHOLD = 5;
  var PRAYER_ALERT_GAIN2 = 0.055;
  var PrayerNotifierPlugin = class {
    id = "prayer-notifier";
    requiredCapabilities = Object.freeze(["skills"]);
    requiredSlices = Object.freeze(["skills"]);
    available = false;
    context = null;
    previousPrayer = null;
    beep;
    criticalBeep;
    constructor(beep = createToneBeeper({ frequency: 660, peakGain: PRAYER_ALERT_GAIN2 }), criticalBeep = createToneBeeper({ frequency: 660, peakGain: PRAYER_ALERT_GAIN2 * 1.25 })) {
      this.beep = beep;
      this.criticalBeep = criticalBeep;
    }
    mount(context) {
      this.context = context;
    }
    onAvailability(available2) {
      this.available = available2;
      if (!available2) this.previousPrayer = null;
    }
    onUpdate(update) {
      const snapshot = update.snapshot;
      const alertsEnabled = this.context?.settings.get().prayerAlerts ?? true;
      const prayer = snapshot?.ingame && this.available && alertsEnabled ? snapshot.skills?.[PRAYER_SKILL_ID]?.currentLevel ?? null : null;
      if (prayer === null || !Number.isFinite(prayer)) {
        this.previousPrayer = null;
        return;
      }
      if (!update.clientChanged && this.previousPrayer !== null) {
        if (this.previousPrayer >= CRITICAL_PRAYER_THRESHOLD && prayer < CRITICAL_PRAYER_THRESHOLD) {
          this.criticalBeep();
        } else if (this.previousPrayer >= LOW_PRAYER_THRESHOLD && prayer < LOW_PRAYER_THRESHOLD) {
          this.beep();
        }
      }
      this.previousPrayer = prayer;
    }
    unmount() {
      this.previousPrayer = null;
      this.context = null;
    }
  };

  // src/plugins/player-names.ts
  var PlayerNamesPlugin = class {
    id = "player-names";
    requiredCapabilities = Object.freeze(["players", "projection", "player"]);
    requiredSlices = Object.freeze([]);
    context = null;
    layer = null;
    scene = null;
    hasPlayers = false;
    labels = /* @__PURE__ */ new Map();
    available = false;
    ingame = false;
    frameRequest = null;
    scaleX = 1;
    scaleY = 1;
    resizeBound = () => this.syncToCanvas();
    frameBound = () => {
      this.frameRequest = null;
      this.renderFrame();
      this.syncFrameLoop();
    };
    mount(context) {
      this.context = context;
      const layer = document.createElement("div");
      layer.className = "sl-player-name-layer";
      layer.hidden = true;
      const scene = document.createElement("div");
      scene.className = "sl-player-name-scene";
      layer.append(scene);
      context.shadowRoot.append(layer);
      this.layer = layer;
      this.scene = scene;
      window.addEventListener("resize", this.resizeBound);
      window.addEventListener("scroll", this.resizeBound, { passive: true });
      this.syncToCanvas();
    }
    onAvailability(available2) {
      this.available = available2;
      if (!available2) this.clear();
      this.syncFrameLoop();
    }
    onUpdate(update) {
      if (update.clientChanged) this.syncToCanvas();
      this.ingame = update.snapshot?.ingame ?? false;
      if (!this.shouldRender()) this.clear();
      this.syncFrameLoop();
    }
    unmount() {
      window.removeEventListener("resize", this.resizeBound);
      window.removeEventListener("scroll", this.resizeBound);
      if (this.frameRequest !== null) window.cancelAnimationFrame(this.frameRequest);
      this.frameRequest = null;
      this.labels.clear();
      this.layer?.remove();
      this.context = null;
      this.layer = null;
      this.scene = null;
      this.hasPlayers = false;
    }
    shouldRender() {
      return Boolean(
        this.available && this.ingame && this.context?.settings.get().showPlayerNames && this.context.getPlayers && this.context.projectPlayers
      );
    }
    syncFrameLoop() {
      const shouldRun = this.shouldRender();
      if (shouldRun && this.frameRequest === null) this.frameRequest = window.requestAnimationFrame(this.frameBound);
      if (!shouldRun && this.frameRequest !== null) {
        window.cancelAnimationFrame(this.frameRequest);
        this.frameRequest = null;
      }
    }
    renderFrame() {
      if (!this.shouldRender() || !this.scene || !this.layer) return;
      const players = this.context?.getPlayers?.() ?? Object.freeze([]);
      this.hasPlayers = players.length > 0;
      if (!this.hasPlayers) {
        this.clear();
        return;
      }
      const projected = this.context?.projectPlayers?.(players) ?? Object.freeze([]);
      const used = /* @__PURE__ */ new Set();
      let rendered = 0;
      for (const player of projected) {
        if (player.point.x < 4 || player.point.x >= 516 || player.point.y < 4 || player.point.y >= 338) continue;
        if (rendered >= 32) break;
        const key = String(player.slot);
        used.add(key);
        let label = this.labels.get(key);
        if (!label) {
          label = document.createElement("div");
          label.className = player.local ? "sl-player-name-label sl-player-name-local" : "sl-player-name-label";
          label.style.transform = this.labelTransform(player);
          this.labels.set(key, label);
          this.scene?.append(label);
        }
        const text = this.formatLabel(player);
        if (label.textContent !== text) label.textContent = text;
        label.style.transform = this.labelTransform(player);
        rendered += 1;
      }
      if (rendered === 0) {
        this.clear();
        return;
      }
      for (const [key, label] of this.labels) {
        if (used.has(key)) continue;
        label.remove();
        this.labels.delete(key);
      }
      this.layer.hidden = false;
    }
    formatLabel(player) {
      const name = player.name ?? `Player ${player.slot}`;
      return player.combatLevel === null ? name : `${name} level-${player.combatLevel}`;
    }
    labelTransform(player) {
      return `translate3d(${player.point.x * this.scaleX}px, ${player.point.y * this.scaleY}px, 0) translate(-50%, -100%)`;
    }
    clear() {
      for (const label of this.labels.values()) label.remove();
      this.labels.clear();
      if (this.layer) this.layer.hidden = true;
    }
    syncToCanvas() {
      if (!this.layer) return;
      const rect = document.querySelector("canvas#canvas")?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        this.layer.hidden = true;
        return;
      }
      this.layer.style.left = `${Math.round(rect.left)}px`;
      this.layer.style.top = `${Math.round(rect.top)}px`;
      this.layer.style.width = `${Math.round(rect.width)}px`;
      this.layer.style.height = `${Math.round(rect.height)}px`;
      this.scaleX = rect.width / 765;
      this.scaleY = rect.height / 503;
    }
  };

  // src/plugins/tile-overlay.ts
  var SVG_NS = "http://www.w3.org/2000/svg";
  var TileOverlayPlugin = class {
    id = "tile-overlay";
    requiredCapabilities = Object.freeze(["projection", "player"]);
    requiredSlices = Object.freeze([]);
    context = null;
    layer = null;
    svg = null;
    polygons = null;
    available = false;
    ingame = false;
    destinationActive = false;
    frameRequest = null;
    resizeBound = () => this.syncToCanvas();
    frameBound = () => {
      this.frameRequest = null;
      this.renderTiles();
      this.syncFrameLoop();
    };
    mount(context) {
      this.context = context;
      const layer = document.createElement("div");
      layer.className = "sl-tile-layer";
      layer.hidden = true;
      const svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("viewBox", "0 0 765 503");
      svg.setAttribute("preserveAspectRatio", "none");
      svg.setAttribute("aria-hidden", "true");
      const definitions = document.createElementNS(SVG_NS, "defs");
      const clipPath = document.createElementNS(SVG_NS, "clipPath");
      clipPath.id = "sl-scene-clip";
      const clipRect = document.createElementNS(SVG_NS, "rect");
      clipRect.setAttribute("x", "4");
      clipRect.setAttribute("y", "4");
      clipRect.setAttribute("width", "512");
      clipRect.setAttribute("height", "334");
      clipPath.append(clipRect);
      definitions.append(clipPath);
      const polygons = document.createElementNS(SVG_NS, "g");
      polygons.setAttribute("clip-path", "url(#sl-scene-clip)");
      svg.append(definitions, polygons);
      layer.append(svg);
      context.shadowRoot.append(layer);
      this.layer = layer;
      this.svg = svg;
      this.polygons = polygons;
      window.addEventListener("resize", this.resizeBound);
      window.addEventListener("scroll", this.resizeBound, { passive: true });
      this.syncToCanvas();
    }
    onAvailability(available2) {
      this.available = available2;
      if (!available2) {
        this.destinationActive = false;
        if (this.layer) this.layer.hidden = true;
      }
      this.syncFrameLoop();
    }
    onUpdate(update) {
      if (update.clientChanged) this.syncToCanvas();
      this.ingame = update.snapshot?.ingame ?? false;
      this.renderTiles();
      this.syncFrameLoop();
    }
    renderTiles() {
      const showHovered = this.context?.settings.get().showHoveredTile ?? false;
      const showDestination = this.context?.settings.get().showDestinationTile ?? false;
      const hovered = showHovered && this.available && this.ingame ? this.context?.getHoveredTile?.() ?? null : null;
      const destination = showDestination && this.available && this.ingame ? this.context?.getDestinationTile?.() ?? null : null;
      this.destinationActive = destination !== null;
      if (!hovered && !destination) {
        this.polygons?.replaceChildren();
        if (this.layer) this.layer.hidden = true;
        return;
      }
      const polygons = [];
      if (destination) polygons.push(this.createPolygon(destination, "sl-destination-tile"));
      if (hovered) polygons.push(this.createPolygon(hovered, "sl-hovered-tile"));
      this.polygons?.replaceChildren(...polygons);
      if (this.layer) this.layer.hidden = false;
    }
    unmount() {
      window.removeEventListener("resize", this.resizeBound);
      window.removeEventListener("scroll", this.resizeBound);
      if (this.frameRequest !== null) window.cancelAnimationFrame(this.frameRequest);
      this.frameRequest = null;
      this.destinationActive = false;
      this.layer?.remove();
      this.context = null;
      this.layer = null;
      this.svg = null;
      this.polygons = null;
    }
    syncFrameLoop() {
      const settings = this.context?.settings.get();
      const shouldRun = this.available && this.ingame && Boolean(settings?.showHoveredTile || this.destinationActive);
      if (shouldRun && this.frameRequest === null) this.frameRequest = window.requestAnimationFrame(this.frameBound);
      if (!shouldRun && this.frameRequest !== null) {
        window.cancelAnimationFrame(this.frameRequest);
        this.frameRequest = null;
      }
    }
    createPolygon(tile, className) {
      const polygon = document.createElementNS(SVG_NS, "polygon");
      polygon.setAttribute("points", tile.points.map((point) => `${point.x},${point.y}`).join(" "));
      polygon.setAttribute("class", className);
      return polygon;
    }
    syncToCanvas() {
      if (!this.layer) return;
      const rect = document.querySelector("canvas#canvas")?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        this.layer.hidden = true;
        return;
      }
      this.layer.style.left = `${Math.round(rect.left)}px`;
      this.layer.style.top = `${Math.round(rect.top)}px`;
      this.layer.style.width = `${Math.round(rect.width)}px`;
      this.layer.style.height = `${Math.round(rect.height)}px`;
    }
  };

  // src/assets/skill-icons/agility.png
  var agility_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAAXCAYAAAAGAx/kAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAkklEQVQ4ja1USRKAMAgrjP//sh56EIEE6pCTZUlZUmVByP1+34LjNrQK6GKMaAyudzsXhHxextghych2nkYStKGYbPP0bM0Z2bZr7mSE3rfPym/iydauOLjCN/7iN/fRVHYtjbEnAlpBFeDWGxVVG4UVIYFy4bqK2FB5ZYqdZ1KQPglvTSZI1goz+kfiiE5+IREPfak5KG5br4oAAAAASUVORK5CYII=";

  // src/assets/skill-icons/attack.png
  var attack_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAAZCAYAAADE6YVjAAAACXBIWXMAAAsTAAALEwEAmpwYAAABDklEQVRIibXUPW7CMBjG8b9DVcHGDVoxMNIdIcHE1pNkRF3CnC7MnKJjOzGBhJhY4ABVuQUSQu4AduKWD8cfj2QpdiT/9L52IogSIY1ZDOBtPNazSZ6TxARUAiKXAQjWrsvAJM8BKQIgtwHwruQ+4InYAR6IPeCIVAMckOoAVPpOCuBn920NgHUlJvD81LIGLBE/AO62qwA2i08nAHQl5q9ZpQy89F+dAIAH9ZCldbqDo36xmtc4BACgVEmW1vWiwlbzGofmyAswELWgsDL0Pt07A6APvthgvWnrzUPljJwqGfY6UaDkLwAwW27PLQqTBIpzUECECPn18SiztCFPValLIKQ5PIT/G7jfomv5Bb/Jj6VDeD1ZAAAAAElFTkSuQmCC";

  // src/assets/skill-icons/cooking.png
  var cooking_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABMAAAAVCAYAAACkCdXRAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA/UlEQVQ4ja2TMQ7CMAxF7bZMTJwAiZGNtRMHYEXiRNyAOyCxcgCmrt0YK3ECJiQkVJkhuHUTO4GKP6WN8/xtJwiBkPo1YbhvywtGut2v3dd8tlSOEFoJs1Q2hvdJXEKZ1IAR6m5CuBanOEsDZWwCNl4fsmzoWBEWvNyVUzVksWq7dblu1ZjN9hU6k0AJkfKBDBLO3N05Vo+oSx3C5wEK/we7bOo8cBiWGZ3mcBBWqVY8+htc4jc9k/0SMCS/TzFX+hAIMw30q86nCQAg/eUFVBc3rMIKaOrcLJUP+zJhDGSlJxsZgCYLuD88AYBwcDXGDMK9msHV6IE/08QreAMPxGPuMw+cGQAAAABJRU5ErkJggg==";

  // src/assets/skill-icons/crafting.png
  var crafting_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAWCAYAAADafVyIAAAACXBIWXMAAAsTAAALEwEAmpwYAAABHElEQVRIiaVVSQ7DIAw0qIdG7Ysi5R/5SC5Jr+mlH+k/KvVHlXqjB+IYjA2BjhQpC55h8BIDTTAufnZGXZkG6ItDgWlZAADgsa7ZOIvkY3+Bsb8Iu8sDhbQ4y1+0ingh43isRWvP96dKhI4mFvKg2M1Bm4gELsISQ/lAeNEwgakokRLQoZD5nIj/Ng9nAAC4v76qkHSETMS4sb/uF76bh87NQ+fShPrnablF35Iq8tByIq8L73lfFJpKOy5OrkNxQOQxqeYkw5Ij58nMV5cMwUFMHgKdhI5KEPsgJKdSpDKVIbtJGkgnF8OLU/jUTu4RjG0nrbf/kG/EkZAwTTUcqfO4uaSZtP/R0vlyrJEwXtuc8MusJa/aRf38L+EHjXSgfRACfegAAAAASUVORK5CYII=";

  // src/assets/skill-icons/defence.png
  var defence_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABEAAAATCAYAAAB2pebxAAAACXBIWXMAAAsTAAALEwEAmpwYAAAArElEQVQ4jc2SMQrCQBBF30gukUIi3ilFwDpVSGeVOpVdSGUtWHgqsfAYayEbTXZmQdwiv1pmh8f8PyMgjj+VAZSHKvjYFfugti3yoNbWDRuNrAEAHvenPYmlU99P72PXmX3qJL9qPZBZJrfL1Wz8zgdgOI9pJ0lvxx+dvxNtxdrBrcdOKoiT2GpjausGcCKfkrhlsJp8sB4AIPOWOEgDKBAbZAEMyBtk2VkCAF6bnCp3zjtc7AAAAABJRU5ErkJggg==";

  // src/assets/skill-icons/farming.png
  var farming_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAAXCAYAAAD+4+QTAAAACXBIWXMAAAsTAAALEwEAmpwYAAACAElEQVRIiaWVz2sTQRTHP7NtU7CSVKGFYkFEvHvzVNR/QWLZRfBQSOk1eNGAJzFURAPFQ0ggt6KI/4PtoQX/AcGTiIJoTdpdEqTCZjxM9sdkd9bd+oVll5l57zPv7XszgsISMn1cCqNFUecvnjwE4GjohzPWnxOara4RlBMiZOD8wePtxOzW5gYA7U7PCMoJeSTNqRLSse9mzBcGCJn2ZEFm486ib1PIQjbqNT5/PwZg6epbAHaeWlg/fsX86PazceNAzVZ3slDfWQA4LSnn376q8Tv3x/wGbt5YY//DQVokEWAw8hMLAPqDPoAG0OY/raUHHo9kXFrk5LiP63m8fvOOeLjBBhy7SqVcxvXWQ+O50Rf84QKr5+a4fP3apIyTmjhTadna3JgCRVGOS4usXloB4NT9GTo4GvphnwRrp3vGUi8pQIp2p8eVlQuTui9Wjo16jWary2DkJ+wtfakUzVaXiwszOHa1CCMEtTs9XM/TQJbJoFIuF4YEUukO/qeQKRAVzf9JpT6oVmMkwJlSlqZMyNmlF40BosKdVrx00xSk2bGrOHYV1/MU8l+7iffJ0vkZ5ivLxj65d/tWOL77fi/ccOyATEZTpFca9RoHhx+nzi7VkBmQ4ooA+ilc6MfPV5ZzrEpeEzmuyihlr3ZeAsmza/vZcyMgJyQdqCv7Xv8LamroAuJZ05UAAAAASUVORK5CYII=";

  // src/assets/skill-icons/firemaking.png
  var firemaking_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABcAAAAXCAYAAADgKtSgAAAACXBIWXMAAAsTAAALEwEAmpwYAAABJElEQVRIiaWTMRKCQAxFNyg2WHsHvIGcwRkqZyg8HoUzlHIGjwAVF6C3YsZYrLiETbKgv2Kz2Zef7GLMYgEuz7WK1qWvK8DAQ4D5vpwvOOcBdRWvKqCMhR4Ywa5AyJAH1x2m5cACpXzPue8QcO7WrimY64gdi+/QxbS9ubbuU3Lo1PSROR5eotO6is35MqAxCKxzzSEnLT/iXDc9rZmWwzfW9JEHmuZP74NQOIjUwZLOgr9/e+XfdXuNgx19BGhHs8MuB7yfNtjlNsbF62r33ZPiHnwKGtdFticgKU7BFg4O7qvIErK+PZ5sjBcCUPc6PAx0YGMCzv8rggB2fvxhDqDlzs8Fn2KRJQQYHonTVtuUQNO41gmM8/7VHVdkPL/oQn8TwhuBAc0W+JckpwAAAABJRU5ErkJggg==";

  // src/assets/skill-icons/fishing.png
  var fishing_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAXCAYAAAARIY8tAAAACXBIWXMAAAsTAAALEwEAmpwYAAABaElEQVRIiZVVy42EMAy1R/QBooCtYM/bAQdGtMGJuXKaNkaaw3TAmQooAEEl2UM2xHaczz4JiTj2s/NiDEIWaHS7wXwsAHGKEQH8fH+x9bJuJEm6AObgiJZ1i5JS+7Ju0A19QP15va8kKKuXBLlTSR+X0CYJZEQTPhpiPnbdDffLXvHAsotL+UnJCgn/A3oig1XeSYN2Aj0mcwI04zQxy3Oeo96ab4FEtjIZ7Ag0O92PSKQTH+d+vX9eb7ViF+N8Ewmszs95NgC8Oyj5ce7Q1O211w09KyQhkb80/vHYtSN1ZE3dBifMJIgnkuQSTd3+yRVtUw4qT4rcEwM4iav0NPR7VGdJ7ocbjbXAXK/HuoiSuztxstB9tMMplEDiOHelUotu6NmIpns3AINuUyM/zl2QG/QP76jMsPTjtxvuZpweZOzGRjeacXokRzvpIsN+PlzveGWyayRumjElGQeXS0PRl1z+IwrxC+Dz0lSP/fQKAAAAAElFTkSuQmCC";

  // src/assets/skill-icons/fletching.png
  var fletching_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAAZCAYAAADE6YVjAAAACXBIWXMAAAsTAAALEwEAmpwYAAABAUlEQVRIie2VOw7CMBBE1yhI5AgJV4iUKqU5ER2iCdR0dJyIlFSRcgZyBJAoTLEY57P4s0nJSGki289je2cBJkko/OxaTAHEW+E1kgkZAuxuGJA+oMjTDoiGReEQo6xKoJEtxBKhjwttiA3RAC0EqI/FviO/m+tJqCJPLQAcU8oVAACcqmeoEwTc6jtA3f2vRpt9bXawvJ7DlkfA2qMuhNofjso8BHcdBQP8xv0Bf8CMAPOezfueFYCTShlbAN2i4h3RN1boCOjHelYlGClEjNgkxrsySToENLIlwtCtiJ5AA7j6mcK6AQ1jnSOHbTxK7YpzVADOHm8W5AI8FdQTSL0BWTuj4i4hosQAAAAASUVORK5CYII=";

  // src/assets/skill-icons/herblore.png
  var herblore_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAARCAYAAAAougcOAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA20lEQVQ4ja1UQQ4DIQgE08v+ywf0IfucPqQP6L/2VnsQBRSUTTrJJkZgRmZRhFvAwuuC4ao7AsfJ6derhIUeFhmvG4ncG3OtHC1unAQLfCg/c1h20VC7IagaLWJ0ImCIuTkLpNpm+wysBJZx5k36NCSUcWvVtK9qiId42a6x7UFoiZbnWJfcwoDX0XxU02TgePvnaLieXz+YkTpZ2LIkCAgAAKQ+01H/o+h8BVNb/FVICABMN16PnoT1b0yrBgGA6caXOgibkTShXNi+XT2kFLZvl0EeEPEFI8QSP/6gVAe2szK8AAAAAElFTkSuQmCC";

  // src/assets/skill-icons/hitpoints.png
  var hitpoints_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABcAAAAUCAYAAABmvqYOAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA5klEQVQ4jdWUzQ3CMAyF7ahCTMAC3NigB0ZA7MMA7IMYgUM36I0FOgGqqoQDcn6d2JQT79RWL99rojwjeKGDqhyW32Q/xsbnubTtb/miAL0ct4X/+nh5r4dz4FrIvTf+eeg2lQCHXXt7QWm4hXH6BPTLzAYAoDPlwu/VL3PyTsdlOLNGh50VPavhmoCf4JL+HJ4WRS+6jrmoSIaqOk6mal4nh552Gmzzb3LFvrhEof5+tgBQU6narWsmg5PBxQdwIVowA+cDOEngClwO0IAb8BBAQ4iGkxYswMuAWBJYAQ8BvOpgAIA39sxkps3OLfwAAAAASUVORK5CYII=";

  // src/assets/skill-icons/magic.png
  var magic_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAAXCAYAAAD+4+QTAAAACXBIWXMAAAsTAAALEwEAmpwYAAABSElEQVRIia2VTWrDMBCFP1Um5A45SCGQk3TRZTcl2RQKOUCg0E1DN1120ZMUAjmIjxAogqAunFh/Hnlc+sAYI3ue39ObkUEF49Nnb3TfdWjUxWfn7u7slPoaEljM3gBoYzJn/RQ1N/JSatGC9+r6H0mCCoCWx7BwtU4Jwa7yL2MlCaECopJYhQydZQMkSq8nWJaRdAS5itZtaN2mfy5DUEexJ8lmXwrXrTOjca6ma5RAaVmhJLblv5Ap8SZcdaT7Ug+LuhlF9JbJRAKJLsZXNdvVPPvO+HCBkYpuV3M+jy8iwcfXEwCHfZjKu++f8EI0tZu8N+KNv799HiRYrs8c9pblOqRrdzwBdjBxBowf8z4ni4s/3L3WZ5mzOpIaxgjgogS0A3HiBHYW8KbpekKXJhXBwPFcpGuKdT1pUTht5qyz9UdqCXlK/AJz52oEjwgyUgAAAABJRU5ErkJggg==";

  // src/assets/skill-icons/mining.png
  var mining_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABcAAAAXCAYAAADgKtSgAAAACXBIWXMAAAsTAAALEwEAmpwYAAABBUlEQVRIia2VMRaDMAiGIc/z2As4eyOndHXqcbp163teoF4oHdIkBAFNlTGED/iDiGAaBvk8oB33i7Zgk/di0GOeWRJeRDwncAwaTLOSBGAcegAAeC1rTpAzUzANomZ1kuAlQUCk4G273GL7UhKaIMFdXW1A+7GiX+ps8h5ey0pkyZpjODoBtAutg8RypaI28Dj08Hk/zVvO9BrgZFyi2E18m0Z4DU4Pp01XgxwymPr5OB+sfA8sW7PmOngrT7ePi1XTz/poITtwCm4dV1OWc2AVGsG3oO9zPXby9xzXcSdfPmfKJLLU49Zu213jJPBVOuM1YP5PqLbi9eBcebn4rxSJUcd/AcIVnwRRTMf8AAAAAElFTkSuQmCC";

  // src/assets/skill-icons/prayer.png
  var prayer_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABcAAAAXCAYAAADgKtSgAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA7ElEQVRIic2VMQoCMRRE54sX8AAiiDZa7g1shG2svJhYeZAFvUNKtdhFEA/gEWIR48b1J/t/sbhTJZC8mQwJAVQiq1uvAN+fV6sxGHSUpDfwZhWyasTJd4c9AKAwR+kWCZysB3s5g/b0/+qcLJfaq04fP8GQh9Ydp+T7z7P128DSFykEpqCb7eozPt8e7Jo8WwczS+Re3qU1ZagYHACW0zEAYDJa/CaPXTW/KQVmkjfljNruc2VKAMAsmwdQtnNOcZPKlEmoAF6bcAYOzEO9On1EguRAM70kNdBxcoXIFuak+olU8F59c0rpKnkBwQNfW79ODloAAAAASUVORK5CYII=";

  // src/assets/skill-icons/ranged.png
  var ranged_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABcAAAAXCAYAAADgKtSgAAAACXBIWXMAAAsTAAALEwEAmpwYAAABcklEQVRIia1VO04DQQx9jhQp29ATroC01ZaLaOhyCfp0aJvdtKFB6ei5BAdASUkViTNARwsShSlG3rHnsxkkLE3jsd/zbzwEAAAxwIRIiGMdkLZNeAPEfbvA/eFbOTrQvl0knaxtLhCmEVw75kDTJELgcUQfXeSj9BIGI9INA+b7XUA6ElTcDRvu24pdmnJg7MRW23XDJvKZeScmieLn6m7Uxc2Lm9nUSzxst8re2cxCR2fkUsxPiwV+Pb6rrFSOaRdiBw4Vkb0X4JuzT3Oj6x1EXp6BjdiLa/bpjCGN8s1yuqa+CJqXanKRWAIPHNuFBJmyaPEl8qVIPf9YVwDu5OX5Cder2+IpmgC3tZSI/zqmCXDiak2QY0sxNUUxWQDugEUuD+d4az8ClzxBuJ8UeAnwaQIg2oo2raZeGuCvR0buM5GXPN/vpsAtiWSRB04T6Oef3S3VmgqAvX2845myc14ODOh1bSjLnEsl/Or+XfxP9Auzw/psRne8NgAAAABJRU5ErkJggg==";

  // src/assets/skill-icons/runecraft.png
  var runecraft_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAAZCAYAAADE6YVjAAAACXBIWXMAAAsTAAALEwEAmpwYAAABjklEQVRIib2WQYrCMBSG/3QUvMIws/UM4i1cuNA7iAuh6BFaArMY5g510YW3EM/gQgqKVxBEMwtNm/eatMkI8+9K8t73/vfSpkCwhAqNiEIBm+FbMEiEAx4abW8AlFe8J4QCQkEe7Xq0ZrS9YX/vMkC13qROW/Kf7y8AwGy+qO0w1p4guysLhCbngP29i3h3KZ+PpzNWyxgAkKTSCmMQoczkOolLfI3CKpAxEwo4ns5lEh2sJQc9J7jaX82q4wJoJakkCcxWNWk6GSNb5wpQojYTW3t45dxZmyLbHLh49dydS9PJGIBQ5D2xudBVx7sL4t2ldJWk0gkrigN5JpDPj3dr0GoZE5gc9AisCfCEKDGbLxqPqo+K4lADZOscgBKt7dLSFWsHek7TydhavSnjzRTKdmqK4vCsyA5wSbsAyEyUSFJJbJsV8mPsC2BOKkc8ia8TvY9/uxruAgrL1jnkoId+dC0/kuaaLbkHhMK0k350BWDeJ+7kAZAH6JWb8V/u+EAJtRl21F9+i4JBoRG/zhrh3Gga7MAAAAAASUVORK5CYII=";

  // src/assets/skill-icons/slayer.png
  var slayer_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABcAAAAYCAYAAAARfGZ1AAAACXBIWXMAAAsTAAALEwEAmpwYAAAB4UlEQVRIiaWVv2vCQBTHvxf8Q5SCexenuBRK9yKJju0QnCulqdRJqZaiszq0o0akeyl0iZNL90JR/xFfh3iX+5ET0S8cJrnL5737vneR4WQxSq+JKTOnQRhdnJ8BAL5//owAB8IZfX064u7yagsA4GAuPYCDIyQH2pvS4cjEFhncDQvi+gRb1CB65t2wsIMfXdAEXKtWAAC3Nx/KTFIHFX6U5wDw9n6t3Ce7kTsqM3N1gazw4R4AsNmsxLPJdA6zk5IdaHBGcTQ0oGW/LsBcm80Kk+lcy9wKT8GuF6RPmWOAAaD38oo4GqLs17WZ1HfHBh50mmBsf0lcL0AcDZHuVi1oTgcvZmMFwLtDz5poqyQTAyj7dcrIPF3keoFiC6AWUAYz5uzdXc42cff0DABotHqoVSuigBzM1W+HVjizFXLQaRqBjJd3WRNtsZiNd8VVfGfUbz9SHI3EICLxy5X0fzqyFEcjks9JpmGL2djwnVugnwPu+6DTFN3DAwjPl79rAECpmM+0AEj85zboQfl7rheIzjEy50H0liTaiqGrVMyLncrdY+2WfeKBXS8wgsmnVvwX6i0lb1OHZqns1wW43w7RaPXUb4stgKzl71p4z9fzdTIYIGZ8Fa2pGSJmX5/0+j/DvxuHtPiegAAAAABJRU5ErkJggg==";

  // src/assets/skill-icons/smithing.png
  var smithing_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABMAAAATCAYAAAByUDbMAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA/0lEQVQ4jZ2TsQ2DMBBFv5GnoEmUPqKizhQpImWNVNRUWSMSRaZITYXSI2hYwymM4c4+wORLLvB9P3/OtgKUAZNR+FMaAB5FAQB4liUp+Zv4CjdVgDIORoF0TpL1cWAiGfMsRde3q7A8S+GnZ7Cub0fT/L2m6/3GgGKyPbLtsECe7PsJzC5d17fT8OsOGJVs63ddXfvmuhlY39b0flXsWwHK0MV1MwDAJtD6+NXQS4a6GYwEdZtJl1ZzA5VR9NiP58sIq0QQACS2QIcs6aQF2JJ4L10yeq+CFXtAx8NpmpPepgCbQQ7ig5aAHown8pNJUAqMewERzReTRa0KZJP9AERRdnL+cUxlAAAAAElFTkSuQmCC";

  // src/assets/skill-icons/strength.png
  var strength_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAUCAYAAACEYr13AAAACXBIWXMAAAsTAAALEwEAmpwYAAAA0klEQVQ4jd2TsRHDIAxFvxgoE+QuXbxEBmABV9SusoAH8BIuPRkpbAXpAz7X/hUH0teTAEFTkss6SzvmiOwlb8sIAHh9vuasNgtnyQDwfj6wLeOxZ8kqA8kaOM0rAGCaV6Q4ODM2CbayKsXhb8JikuAPvIlSMI0lCYpupUnWhA2VhIaIJjon27lIi6BnZJP3680SgCz+rn1gioOryObmYfRJWi0oAb0sb2IrWYpCnKUaIrfB+EX7sw682ZoH01idEjANwJ/rokHdRvmVlwl6uoHBDzONbM5v5rB8AAAAAElFTkSuQmCC";

  // src/assets/skill-icons/thieving.png
  var thieving_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAANCAYAAABcrsXuAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAXElEQVQ4jb2TSRIAEAwEjf//mZs1Q0LoI0m6KgsCBYn/MRLESveF98JG4inoRXgnqCLIAqm353FRl2hhzo+7AA/RIGGzuXsnM/Hl13YV3+s7WaGRrxfGsE3aO5nJm/QeEdrdmVQAAAAASUVORK5CYII=";

  // src/assets/skill-icons/woodcutting.png
  var woodcutting_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAAWCAYAAADNX8xBAAAACXBIWXMAAAsTAAALEwEAmpwYAAABFklEQVQ4jY2UvQ3CMBCFnw0FgS0YgRKJLj2UDMEEDMAEDEEJfTokSkZgC34aMAW5+M6+w3lSJMf2++7ZjuOgygW9nxRc5rAg1cbhufrkwzVZJMxbEFONHpY5bEiWrOZzfsm8BSGzurwmsGQ/r+8DqY7JDnBgK28tJxWHVUefwF0YlkzFsSYAtUtPTdfyOs4gy+tYvGeJyHSaPcR7Op7KA8BzHzeNAFy8j9pdX/sptLssr8R6Pukm84RUcD2f4HC5M0dwnhrxQTeJL4PaVET61LsWE0oTMB28AQC78wuFu8YrSUlIrl7HT4qQvFAvEKWxIL1Bt/egOMcA/ftD6mMKSD8xANguRiZMTaRBaHkRlpS3EpUlN/0LEcdwMi1GCCkAAAAASUVORK5CYII=";

  // src/skill-assets.ts
  var SKILL_ICONS = Object.freeze([
    attack_default,
    defence_default,
    strength_default,
    hitpoints_default,
    ranged_default,
    prayer_default,
    magic_default,
    cooking_default,
    woodcutting_default,
    fletching_default,
    fishing_default,
    firemaking_default,
    crafting_default,
    smithing_default,
    mining_default,
    herblore_default,
    agility_default,
    thieving_default,
    slayer_default,
    farming_default,
    runecraft_default
  ]);
  var SKILL_COLORS = Object.freeze([
    "rgb(155,32,7)",
    "rgb(98,119,190)",
    "rgb(4,149,90)",
    "rgb(131,126,126)",
    "rgb(109,144,23)",
    "rgb(159,147,35)",
    "rgb(50,80,193)",
    "rgb(112,35,134)",
    "rgb(52,140,37)",
    "rgb(3,141,125)",
    "rgb(106,132,164)",
    "rgb(189,120,25)",
    "rgb(151,110,77)",
    "rgb(108,107,82)",
    "rgb(93,143,167)",
    "rgb(7,133,9)",
    "rgb(58,60,137)",
    "rgb(108,52,87)",
    "rgb(100,100,100)",
    "rgb(101,152,63)",
    "rgb(170,141,26)"
  ]);

  // src/plugins/xp-tracker.ts
  var numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  var SVG_NS2 = "http://www.w3.org/2000/svg";
  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== void 0) element.textContent = text;
    return element;
  }
  var XpTrackerPlugin = class {
    id = "xp-drops-controls";
    requiredCapabilities = Object.freeze(["skills"]);
    requiredSlices = Object.freeze(["skills"]);
    context = null;
    dropLayer = null;
    dropLane = null;
    globeLane = null;
    globes = /* @__PURE__ */ new Map();
    available = false;
    resizeBound = () => this.syncPlacement();
    mount(context) {
      this.context = context;
      this.buildOverlay(context);
      window.addEventListener("resize", this.resizeBound);
      window.addEventListener("scroll", this.resizeBound, { passive: true });
      this.syncPlacement();
    }
    onAvailability(available2) {
      this.available = available2;
    }
    onUpdate(update) {
      this.emitXpDrops(update);
      this.pruneXpGlobes(Date.now());
      if (update.clientChanged) this.syncPlacement();
    }
    unmount() {
      window.removeEventListener("resize", this.resizeBound);
      window.removeEventListener("scroll", this.resizeBound);
      this.dropLayer?.remove();
      this.dropLayer = null;
      this.dropLane = null;
      this.globeLane = null;
      this.globes.clear();
      this.context = null;
    }
    resetSession() {
      this.dropLane?.replaceChildren();
      this.clearXpGlobes();
    }
    buildOverlay(context) {
      const dropLayer = createElement("div", "sl-xp-drop-layer");
      const scene = createElement("div", "sl-xp-scene");
      const dropLane = createElement("div", "sl-xp-drop-lane");
      dropLane.setAttribute("aria-hidden", "true");
      const globeLane = createElement("div", "sl-xp-globe-lane");
      scene.append(dropLane, globeLane);
      dropLayer.append(scene);
      context.shadowRoot.append(dropLayer);
      this.dropLayer = dropLayer;
      this.dropLane = dropLane;
      this.globeLane = globeLane;
    }
    emitXpDrops(update) {
      if (!this.dropLane || !this.globeLane || !this.context) return;
      const settings = this.context.settings.get();
      if (!settings.showXpDrops && !settings.showXpGlobes) return;
      const current = update.snapshot;
      const previous = update.previous;
      if (update.clientChanged || !current?.visible || !current.ingame || !current.skills || !previous?.ingame || !previous.skills || current.username !== null && previous.username !== null && current.username !== previous.username) return;
      for (const skill of current.skills) {
        const before = previous.skills[skill.id];
        if (!before) continue;
        const delta = Math.floor(skill.xp - before.xp);
        if (delta > 0 && delta < 1e8) {
          if (settings.showXpDrops) this.addXpDrop(skill, delta);
          if (settings.showXpGlobes) this.addOrUpdateXpGlobe(skill);
        }
      }
    }
    addXpDrop(skill, delta) {
      if (!this.dropLane) return;
      while (this.dropLane.childElementCount >= 6) this.dropLane.firstElementChild?.remove();
      const drop = createElement("div", "sl-xp-drop");
      const icon = createElement("img", "sl-xp-drop-icon");
      icon.src = SKILL_ICONS[skill.id] ?? "";
      icon.alt = "";
      drop.setAttribute("aria-label", `${skill.name}, plus ${numberFormatter.format(delta)} XP`);
      drop.append(
        icon,
        createElement("span", "sl-xp-drop-value", `+${numberFormatter.format(delta)} xp`)
      );
      this.dropLane.append(drop);
      window.setTimeout(() => drop.remove(), 1850);
    }
    addOrUpdateXpGlobe(skill) {
      if (!this.globeLane) return;
      const now = Date.now();
      let active = this.globes.get(skill.id);
      if (!active) {
        const globe = createElement("div", "sl-xp-globe");
        const progressSvg = document.createElementNS(SVG_NS2, "svg");
        progressSvg.setAttribute("class", "sl-xp-globe-svg");
        progressSvg.setAttribute("viewBox", "-3 -3 46 46");
        progressSvg.setAttribute("aria-hidden", "true");
        const background = document.createElementNS(SVG_NS2, "circle");
        background.setAttribute("class", "sl-xp-globe-background");
        background.setAttribute("cx", "20");
        background.setAttribute("cy", "20");
        background.setAttribute("r", "20");
        const track = document.createElementNS(SVG_NS2, "circle");
        track.setAttribute("class", "sl-xp-globe-track");
        track.setAttribute("cx", "20");
        track.setAttribute("cy", "20");
        track.setAttribute("r", "20");
        const progressArc2 = document.createElementNS(SVG_NS2, "circle");
        progressArc2.setAttribute("class", "sl-xp-globe-progress");
        progressArc2.setAttribute("cx", "20");
        progressArc2.setAttribute("cy", "20");
        progressArc2.setAttribute("r", "20");
        progressArc2.setAttribute("pathLength", "100");
        progressArc2.setAttribute("transform", "rotate(-90 20 20)");
        progressSvg.append(background, track, progressArc2);
        const icon2 = createElement("img", "sl-xp-globe-icon");
        icon2.alt = "";
        const tooltip2 = createElement("div", "sl-xp-globe-tooltip");
        globe.append(progressSvg, icon2, tooltip2);
        this.globeLane.append(globe);
        active = { element: globe, fadeAt: now + 4250, expiresAt: now + 5e3, updatedAt: now };
        this.globes.set(skill.id, active);
      }
      const progress = xpProgress(skill.xp, skill.baseLevel);
      const icon = active.element.querySelector(".sl-xp-globe-icon");
      if (icon) icon.src = SKILL_ICONS[skill.id] ?? "";
      const progressArc = active.element.querySelector(".sl-xp-globe-progress");
      if (progressArc) progressArc.setAttribute("stroke-dasharray", `${progress.ratio * 100} 100`);
      active.element.setAttribute("aria-label", `${skill.name}, level ${skill.baseLevel}`);
      const tooltip = active.element.querySelector(".sl-xp-globe-tooltip");
      if (tooltip) {
        tooltip.replaceChildren(
          this.createTooltipRow(skill.name, String(skill.baseLevel)),
          this.createTooltipRow("Current XP:", numberFormatter.format(Math.floor(skill.xp)), true),
          this.createTooltipRow(
            progress.nextLevelXp === null ? "Status:" : "XP left:",
            progress.nextLevelXp === null ? "Max level" : numberFormatter.format(progress.remaining),
            true
          )
        );
      }
      active.element.classList.remove("sl-xp-globe-fading");
      active.fadeAt = now + 4250;
      active.expiresAt = now + 5e3;
      active.updatedAt = now;
      if (this.globes.size > 5) {
        const oldest = [...this.globes.entries()].sort((left, right) => left[1].updatedAt - right[1].updatedAt)[0];
        if (oldest) this.removeXpGlobe(oldest[0]);
      }
    }
    createTooltipRow(label, value, accent = false) {
      const row = createElement("div", "sl-xp-tooltip-row");
      row.append(
        createElement("span", accent ? "sl-xp-tooltip-label" : void 0, label),
        createElement("span", void 0, value)
      );
      return row;
    }
    pruneXpGlobes(now) {
      for (const [skillId, globe] of this.globes) {
        if (globe.element.matches(":hover")) {
          globe.element.classList.remove("sl-xp-globe-fading");
          globe.fadeAt = now + 4250;
          globe.expiresAt = now + 5e3;
        } else if (globe.fadeAt <= now) {
          globe.element.classList.add("sl-xp-globe-fading");
        }
        if (globe.expiresAt <= now) this.removeXpGlobe(skillId);
      }
    }
    removeXpGlobe(skillId) {
      this.globes.get(skillId)?.element.remove();
      this.globes.delete(skillId);
    }
    clearXpGlobes() {
      this.globeLane?.replaceChildren();
      this.globes.clear();
    }
    syncPlacement() {
      if (!this.dropLayer || !this.context) return;
      const rect = document.querySelector("canvas#canvas")?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        this.dropLayer.hidden = true;
        return;
      }
      const settings = this.context.settings.get();
      this.dropLayer.hidden = !settings.showXpDrops && !settings.showXpGlobes;
      this.dropLayer.style.left = `${Math.round(rect.left)}px`;
      this.dropLayer.style.top = `${Math.round(rect.top)}px`;
      this.dropLayer.style.width = `${Math.round(rect.width)}px`;
      this.dropLayer.style.height = `${Math.round(rect.height)}px`;
      this.dropLayer.style.setProperty("--sl-canvas-scale-x", String(rect.width / 765));
      this.dropLayer.style.setProperty("--sl-canvas-scale-y", String(rect.height / 503));
    }
  };

  // src/storage.ts
  var JsonStorage = class {
    constructor(storage, prefix = "solanascape-deck:", fallbackPrefixes = Object.freeze(["solanalite:"])) {
      this.storage = storage;
      this.prefix = prefix;
      this.fallbackPrefixes = fallbackPrefixes;
    }
    storage;
    prefix;
    fallbackPrefixes;
    read(key) {
      for (const prefix of [this.prefix, ...this.fallbackPrefixes]) {
        try {
          const raw = this.storage.getItem(prefix + key);
          if (raw !== null) return JSON.parse(raw);
        } catch {
          return null;
        }
      }
      return null;
    }
    write(key, value) {
      try {
        this.storage.setItem(this.prefix + key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    }
    remove(key) {
      try {
        this.storage.removeItem(this.prefix + key);
        return true;
      } catch {
        return false;
      }
    }
  };
  var DEFAULT_SETTINGS = Object.freeze({
    version: 13,
    panelX: null,
    panelY: null,
    collapsed: true,
    showAllSkills: false,
    showXpDrops: true,
    showXpGlobes: true,
    placement: "canvas",
    showOpponentInfo: true,
    showHoveredTile: false,
    showDestinationTile: true,
    showGroundItemLabels: true,
    showPlayerNames: true,
    showClueLocator: true,
    showAttackStyle: true,
    hideDefensiveStyle: false,
    hitpointsAlerts: true,
    prayerAlerts: true,
    menuSwapperEnabled: true,
    menuPlayerAttack: true,
    menuNpcAttack: true,
    menuPickpocket: false,
    menuShopBuy10: true,
    menuPetClickThrough: true
  });
  var BOOLEAN_KEYS = Object.freeze([
    "collapsed",
    "showAllSkills",
    "showXpDrops",
    "showXpGlobes",
    "showOpponentInfo",
    "showHoveredTile",
    "showDestinationTile",
    "showGroundItemLabels",
    "showPlayerNames",
    "showClueLocator",
    "showAttackStyle",
    "hideDefensiveStyle",
    "hitpointsAlerts",
    "prayerAlerts",
    "menuSwapperEnabled",
    "menuPlayerAttack",
    "menuNpcAttack",
    "menuPickpocket",
    "menuShopBuy10",
    "menuPetClickThrough"
  ]);
  function validCoordinate(value) {
    return value === null || typeof value === "number" && Number.isFinite(value);
  }
  function validateCurrent(value) {
    if (typeof value !== "object" || value === null) return null;
    const candidate = value;
    if (candidate.version !== 13 || !validCoordinate(candidate.panelX) || !validCoordinate(candidate.panelY) || candidate.placement !== "canvas" && candidate.placement !== "floating" || BOOLEAN_KEYS.some((key) => typeof candidate[key] !== "boolean")) return null;
    return Object.freeze({ ...DEFAULT_SETTINGS, ...candidate, version: 13 });
  }
  function migrateLegacy(value) {
    if (typeof value !== "object" || value === null) return null;
    const candidate = value;
    const version = candidate.version;
    if (typeof version !== "number" || version < 1 || version > 12) return null;
    const migrated = { ...DEFAULT_SETTINGS };
    for (const key of BOOLEAN_KEYS) {
      if (typeof candidate[key] === "boolean") migrated[key] = candidate[key];
    }
    if (validCoordinate(candidate.panelX)) migrated.panelX = candidate.panelX;
    if (validCoordinate(candidate.panelY)) migrated.panelY = candidate.panelY;
    if (candidate.placement === "canvas" || candidate.placement === "floating") migrated.placement = candidate.placement;
    migrated.version = 13;
    return Object.freeze(migrated);
  }
  var SettingsStore = class {
    constructor(storage) {
      this.storage = storage;
      this.value = validateCurrent(storage.read("settings:v13")) ?? migrateLegacy(storage.read("settings:v12")) ?? migrateLegacy(storage.read("settings:v11")) ?? migrateLegacy(storage.read("settings:v10")) ?? migrateLegacy(storage.read("settings:v9")) ?? migrateLegacy(storage.read("settings:v8")) ?? migrateLegacy(storage.read("settings:v7")) ?? migrateLegacy(storage.read("settings:v6")) ?? migrateLegacy(storage.read("settings:v5")) ?? migrateLegacy(storage.read("settings:v4")) ?? migrateLegacy(storage.read("settings:v3")) ?? migrateLegacy(storage.read("settings:v2")) ?? migrateLegacy(storage.read("settings:v1")) ?? DEFAULT_SETTINGS;
      this.storage.write("settings:v13", this.value);
    }
    storage;
    value;
    get() {
      return this.value;
    }
    update(patch) {
      this.value = Object.freeze({ ...this.value, ...patch, version: 13 });
      this.storage.write("settings:v13", this.value);
      return this.value;
    }
    reset() {
      this.value = DEFAULT_SETTINGS;
      this.storage.write("settings:v13", this.value);
      return this.value;
    }
  };

  // src/ui/deck-settings.ts
  var CATEGORIES = Object.freeze([
    { id: "xp", label: "XP" },
    { id: "combat", label: "Combat" },
    { id: "tiles", label: "Tiles" },
    { id: "tools", label: "Tools" },
    { id: "menu", label: "Menu Swaps" }
  ]);
  function createElement2(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== void 0) element.textContent = text;
    return element;
  }
  function section(title) {
    return createElement2("h3", "deck-section-title", title);
  }
  function formatTile(tile) {
    return tile ? `${tile.x}, ${tile.z}, ${tile.level}` : "Unknown";
  }
  function distanceBetween(a, b) {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
  }
  function directionToTarget(player, target) {
    const eastWest = target.x > player.x ? "east" : target.x < player.x ? "west" : "";
    const northSouth = target.z > player.z ? "north" : target.z < player.z ? "south" : "";
    return [northSouth, eastWest].filter(Boolean).join("-") || "here";
  }
  function parseTileTarget(value) {
    const match = value.match(/(\d{3,5})\D+(\d{3,5})(?:\D+(\d))?/);
    if (!match) return null;
    const x = Number(match[1]);
    const z = Number(match[2]);
    const level = match[3] === void 0 ? 0 : Number(match[3]);
    return Number.isFinite(x) && Number.isFinite(z) && Number.isFinite(level) ? { x, z, level } : null;
  }
  function findRecentTileTarget(snapshot) {
    for (const message of snapshot?.chat ?? []) {
      const target = parseTileTarget(`${message.sender ?? ""} ${message.text}`);
      if (target) return target;
    }
    return null;
  }
  function findRecentClueText(snapshot) {
    return (snapshot?.chat ?? []).map((message) => message.text.trim()).filter((text) => /\b(clue|dig|search|coordinate|degrees?|north|south|east|west)\b/i.test(text)).slice(0, 3);
  }
  function createDeckSettingsUi(context) {
    const layer = createElement2("div", "deck-settings-layer");
    layer.hidden = true;
    const scene = createElement2("div", "deck-settings-scene");
    const gear = createElement2("button", "deck-settings-gear");
    gear.type = "button";
    gear.title = "Solanascape Deck settings";
    gear.setAttribute("aria-label", "Open Solanascape Deck settings");
    gear.setAttribute("aria-expanded", "false");
    const backdrop = createElement2("div", "deck-modal-backdrop");
    backdrop.hidden = true;
    const modal = createElement2("section", "deck-modal");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Solanascape Deck settings");
    const titlebar = createElement2("header", "deck-modal-titlebar");
    const title = createElement2("div", "deck-modal-title", "Solanascape Deck");
    const close = createElement2("button", "deck-modal-close");
    close.type = "button";
    close.title = "Close";
    close.setAttribute("aria-label", "Close settings");
    titlebar.append(title, close);
    const body = createElement2("div", "deck-modal-body");
    const navigation = createElement2("nav", "deck-category-nav");
    navigation.setAttribute("aria-label", "Settings categories");
    const content = createElement2("main", "deck-settings-content");
    const panels = /* @__PURE__ */ new Map();
    const tabs = /* @__PURE__ */ new Map();
    const checkboxes = /* @__PURE__ */ new Map();
    let activeCategory = "xp";
    let menuStatus = null;
    const addPanel = (id) => {
      const panel = createElement2("div", "deck-category-panel");
      panel.dataset.category = id;
      panel.hidden = id !== activeCategory;
      panels.set(id, panel);
      content.append(panel);
      return panel;
    };
    const activate = (id) => {
      activeCategory = id;
      tabs.forEach((button, category) => button.setAttribute("aria-pressed", String(category === id)));
      panels.forEach((panel, category) => {
        panel.hidden = category !== id;
      });
    };
    CATEGORIES.forEach(({ id, label }) => {
      const tab = createElement2("button", "deck-category-button", label);
      tab.type = "button";
      tab.dataset.category = id;
      tab.setAttribute("aria-pressed", String(id === activeCategory));
      tab.addEventListener("click", () => activate(id));
      tabs.set(id, tab);
      navigation.append(tab);
      addPanel(id);
    });
    const copyDiagnostics = createElement2("button", "deck-category-button deck-diagnostics-copy", "Diagnostics");
    copyDiagnostics.type = "button";
    copyDiagnostics.title = "Copy redacted client diagnostics";
    copyDiagnostics.addEventListener("click", () => {
      const payload = JSON.stringify(context.getMappingReport(), null, 2);
      if (!navigator.clipboard?.writeText) {
        copyDiagnostics.textContent = "Unavailable";
        window.setTimeout(() => {
          copyDiagnostics.textContent = "Diagnostics";
        }, 1500);
        return;
      }
      void navigator.clipboard.writeText(payload).then(
        () => {
          copyDiagnostics.textContent = "Copied!";
          window.setTimeout(() => {
            copyDiagnostics.textContent = "Diagnostics";
          }, 1500);
        },
        () => {
          copyDiagnostics.textContent = "Copy failed";
          window.setTimeout(() => {
            copyDiagnostics.textContent = "Diagnostics";
          }, 1500);
        }
      );
    });
    navigation.append(copyDiagnostics);
    const syncCheckboxes = () => {
      const settings = context.settings.get();
      checkboxes.forEach((entries, key) => entries.forEach((checkbox) => {
        checkbox.checked = Boolean(settings[key]);
      }));
    };
    const addToggle = (panel, key, label, description) => {
      const row = createElement2("label", "deck-setting-row");
      const copy = createElement2("span", "deck-setting-copy");
      copy.append(createElement2("span", "deck-setting-name", label), createElement2("span", "deck-setting-description", description));
      const input = createElement2("input");
      input.type = "checkbox";
      input.checked = Boolean(context.settings.get()[key]);
      input.addEventListener("change", () => {
        context.settings.update({ [key]: input.checked });
        checkboxes.get(key)?.forEach((entry) => {
          entry.checked = input.checked;
        });
      });
      const sprite = createElement2("span", "deck-checkbox");
      sprite.setAttribute("aria-hidden", "true");
      row.append(copy, input, sprite);
      panel.append(row);
      checkboxes.set(key, [...checkboxes.get(key) ?? [], input]);
    };
    const addButton = (panel, label, description, action) => {
      const row = createElement2("div", "deck-setting-row deck-action-row");
      const copy = createElement2("span", "deck-setting-copy");
      copy.append(createElement2("span", "deck-setting-name", label), createElement2("span", "deck-setting-description", description));
      const button = createElement2("button", "deck-stone-button", label);
      button.type = "button";
      button.addEventListener("click", action);
      row.append(copy, button);
      panel.append(row);
    };
    const addReadout = (panel, text) => {
      const readout = createElement2("div", "deck-readout", text);
      panel.append(readout);
      return readout;
    };
    const xp = panels.get("xp");
    xp.append(section("Experience"));
    addToggle(xp, "showXpDrops", "XP drops", "Show skill icons and XP gains beside the scene.");
    addToggle(xp, "showXpGlobes", "XP globes", "Show temporary skill progress globes after gains.");
    addButton(xp, "Clear", "Clear active XP drops and globes.", () => context.resetXpSession());
    const combat = panels.get("combat");
    combat.append(section("Combat overlays"));
    addToggle(combat, "showOpponentInfo", "Opponent health", "Show the current opponent's approximate health.");
    addToggle(combat, "showAttackStyle", "Attack style", "Display the selected combat style.");
    addToggle(combat, "hideDefensiveStyle", "Hide defensive style", "Block the defensive style while the combat tab is open.");
    combat.append(section("Threshold alerts"));
    addToggle(combat, "hitpointsAlerts", "Low Hitpoints", "Beep once below 10 HP and again below 5 HP.");
    addToggle(combat, "prayerAlerts", "Low Prayer", "Beep once below 10 Prayer and again below 5 Prayer.");
    const tiles = panels.get("tiles");
    tiles.append(section("Tile indicators"));
    addToggle(tiles, "showHoveredTile", "Hovered tile", "Shade the tile under the game cursor.");
    addToggle(tiles, "showDestinationTile", "Destination tile", "Shade your destination until it is reached.");
    addToggle(tiles, "showGroundItemLabels", "Ground item names", "Show names and quantities above nearby ground items.");
    addToggle(tiles, "showPlayerNames", "Player names", "Show names above nearby players.");
    const tools = panels.get("tools");
    tools.append(section("Clue solver"));
    const clueHelpReadout = addReadout(tools, "Recent clue-like chat text will appear here.");
    addToggle(tools, "showClueLocator", "Enable clue locator", "Read recent chat only while this locator is enabled.");
    const clueInputRow = createElement2("div", "deck-setting-row deck-input-row");
    const clueInputCopy = createElement2("span", "deck-setting-copy");
    clueInputCopy.append(createElement2("span", "deck-setting-name", "Target tile"), createElement2("span", "deck-setting-description", "Paste x,z or x z level coordinates."));
    const clueInput = createElement2("input", "deck-text-input");
    clueInput.type = "text";
    clueInput.inputMode = "numeric";
    clueInput.placeholder = "3200, 3200";
    clueInputRow.append(clueInputCopy, clueInput);
    tools.append(clueInputRow);
    const clueReadout = addReadout(tools, "Enter a target tile or refresh after a coordinate appears in chat.");
    addButton(tools, "Refresh", "Refresh clue text and coordinate data from the latest client snapshot.", () => updateToolsText());
    const menu = panels.get("menu");
    menu.append(section("Menu Swapper"));
    const menuStatusElement = createElement2("div", "deck-hook-status", "Waiting for game client");
    menu.append(menuStatusElement);
    addToggle(menu, "menuSwapperEnabled", "Enable menu swaps", "Master switch for native left-click priorities.");
    menu.append(section("Attack options"));
    addToggle(menu, "menuPlayerAttack", "Player Attack", "Prioritize native Attack on players.");
    addToggle(menu, "menuNpcAttack", "NPC Attack", "Prioritize native Attack on NPCs.");
    menu.append(section("Interaction priority"));
    addToggle(menu, "menuShopBuy10", "Shop Buy 10", "Prioritize Buy 10 in shop item menus.");
    addToggle(menu, "menuPetClickThrough", "Pet click-through", "Make Walk here win over pet interaction options.");
    addToggle(menu, "menuPickpocket", "Pickpocket", "Prioritize Pickpocket over Talk-to.");
    function updateToolsText() {
      const snapshot = context.getSnapshot();
      const settings = context.settings.get();
      if (!snapshot?.ingame) {
        clueHelpReadout.textContent = "Waiting for an in-game snapshot.";
        clueReadout.textContent = "Waiting for an in-game snapshot.";
        return;
      }
      if (!settings.showClueLocator) {
        clueHelpReadout.textContent = "Clue helper is disabled.";
        clueReadout.textContent = "Clue locator is disabled.";
        return;
      }
      const clueText = findRecentClueText(snapshot);
      clueHelpReadout.textContent = clueText.length ? `Recent: ${clueText.join(" | ")}` : "No recent clue text found in chat.";
      const playerTile = snapshot.player?.tile ?? null;
      const chatTarget = findRecentTileTarget(snapshot);
      if (!clueInput.value.trim() && chatTarget) clueInput.value = formatTile(chatTarget);
      const target = parseTileTarget(clueInput.value) ?? chatTarget;
      if (!playerTile) {
        clueReadout.textContent = `Player tile: ${formatTile(playerTile)}. Target: ${formatTile(target)}.`;
      } else if (!target) {
        clueReadout.textContent = `Player tile: ${formatTile(playerTile)}. Enter a target tile to locate it.`;
      } else {
        clueReadout.textContent = `Player: ${formatTile(playerTile)} - Target: ${formatTile(target)} - ${distanceBetween(playerTile, target)} tiles ${directionToTarget(playerTile, target)}.`;
      }
    }
    const updateDynamicText = () => {
      syncCheckboxes();
      updateToolsText();
      if (menuStatus) {
        menuStatusElement.textContent = menuStatus.patched ? menuStatus.sceneMenu ? "Scene menu swaps active" : "Attack swaps active" : menuStatus.reason ?? "Menu hook unavailable";
        menuStatusElement.classList.toggle("deck-live", menuStatus.patched);
      }
    };
    body.append(navigation, content);
    modal.append(titlebar, body);
    backdrop.append(modal);
    scene.append(gear, backdrop);
    layer.append(scene);
    context.shadowRoot.append(layer);
    const setOpen = (open) => {
      backdrop.hidden = !open;
      gear.setAttribute("aria-expanded", String(open));
      if (open) updateDynamicText();
    };
    gear.addEventListener("click", () => setOpen(backdrop.hidden !== false));
    close.addEventListener("click", () => setOpen(false));
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) setOpen(false);
    });
    const syncPlacement = () => {
      const rect = document.querySelector("canvas#canvas")?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        layer.hidden = true;
        return;
      }
      layer.hidden = false;
      layer.style.left = `${Math.round(rect.left)}px`;
      layer.style.top = `${Math.round(rect.top)}px`;
      layer.style.width = `${Math.round(rect.width)}px`;
      layer.style.height = `${Math.round(rect.height)}px`;
    };
    syncPlacement();
    const placementTimer = window.setInterval(syncPlacement, 500);
    window.addEventListener("resize", syncPlacement, { passive: true });
    window.addEventListener("scroll", syncPlacement, { passive: true });
    return Object.freeze({
      element: layer,
      setMenuStatus(result) {
        menuStatus = result;
        updateDynamicText();
      },
      destroy() {
        window.clearInterval(placementTimer);
        window.removeEventListener("resize", syncPlacement);
        window.removeEventListener("scroll", syncPlacement);
        layer.remove();
      }
    });
  }

  // src/assets/runescape.ttf
  var runescape_default = "data:font/ttf;base64,AAEAAAANAIAAAwBQRkZUTYKTMdgAAFfIAAAAHEdERUYAJwD7AABXoAAAACZPUy8yZMn1mgAAAVgAAABgY21hcOZyMWcAAAUMAAABgmdhc3D//wADAABXmAAAAAhnbHlma9Y9OwAACDwAAENwaGVhZArMSMoAAADcAAAANmhoZWEGgwCWAAABFAAAACRobXR4cYAtgAAAAbgAAANUbG9jYavSvOYAAAaQAAABrG1heHAA5gBMAAABOAAAACBuYW1lBMKgZAAAS6wAAAmEcG9zdC9fbvsAAFUwAAACZwABAAAAAQAAdbvSBV8PPPUACwQAAAAAAM4YuOoAAAAA2pRL4wAA/4ADAAOAAAAACAACAAAAAAAAAAEAAAOA/4AAAANAAAD9AAMAAAEAAAAAAAAAAAAAAAAAAADVAAEAAADVAEoAEAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAgFsAZAABQAEAgACAAAA/8ACAAIAAAACAAAzAMwAAAAABAAAAAAAAACAAAAPAAAACgAAAAAAAAAARlNUUgAAACAhIgMA/4AAAAOAAIAAAAH7AAAAAAGAAoAAAAAgAAEAAAAAAAAAAACAAAAAwAAAAMAAQAFAAEADQABAAgAAQALAAEACwABAAQAAQAEAAEABAAAAAkAAQAHAAAABAABAAYAAQADAAEABgABAAgAAQAGAAEACAABAAcAAQAHAAEABwABAAgAAQAHAAEACAABAAgAAQADAAEABAAAAAYAAAAIAAEABgAAAAgAAAANAAEACAABAAcAAQAHAAEABwABAAYAAQAGAAEACAABAAcAAQADAAAABwABAAcAAQAGAAEACQABAAgAAQAIAAEABwABAAgAAQAHAAEABwABAAUAAAAIAAEABwABAAkAAQAHAAEABwABAAcAAQAFAAEABgABAAUAAAAIAAEACQABAAQAAQAHAAEABwABAAYAAQAHAAEABwABAAYAAQAHAAEABwABAAMAAQAGAAEABgABAAMAAQAJAAEABwABAAcAAQAHAAEABwABAAUAAQAHAAEABQABAAcAAQAHAAEABwABAAcAAQAHAAEABwABAAUAAAADAAEABQAAAAsAAQADAAAAAwABAAcAAQAJAAAACAABAAcAAQADAAEACAABAAcAAQALAAEABgABAAcAAQAIAAEABQABAAsAAQAGAAEABgABA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AHUAbgBlAFMAYwBhAHAAZQAgAEMAaABhAHQAIAAnADAANyAaAMQA+QAgAGkAcwAgAGIAYQBzAGUAZAAgAG8AbgAgIBoAxAD6AFIAdQBuAGUAUwBjAGEAcABlACAAQwBoAGEAdCAaAMQA+QAgAGIAeQAgIBoAxAD6AFcAbwBsAGYAaQBlAE0AYQByAGkAbyAaAMQA+QAgACgAaAB0AHQAcAA6AC8ALwBmAG8AbgB0AHMAdAByAHUAYwB0AC4AYwBvAG0ALwBmAG8AbgB0AHMAdAByAHUAYwB0AG8AcgBzAC8AdwBvAGwAZgBpAGUAbQBhAHIAaQBvACkAAENvcHlyaWdodCBXb2xmaWVNYXJpbyAyMDEzCuKAnFJ1bmVTY2FwZSBDaGF0ICcwN+KAnSBpcyBiYXNlZCBvbiDigJxSdW5lU2NhcGUgQ2hhdOKAnSBieSDigJxXb2xmaWVNYXJpb+KAnSAoaHR0cDovL2ZvbnRzdHJ1Y3QuY29tL2ZvbnRzdHJ1Y3RvcnMvd29sZmllbWFyaW8pAABSAHUAbgBlAFMAYwBhAHAAZQAAUnVuZVNjYXBlAABSAGUAZwB1AGwAYQByAABSZWd1bGFyAABGAG8AbgB0AEYAbwByAGcAZQAgADIALgAwACAAOgAgAFIAdQBuAGUAUwBjAGEAcABlACAAOgAgADEANQAtADMALQAyADAAMgAwAABGb250Rm9yZ2UgMi4wIDogUnVuZVNjYXBlIDogMTUtMy0yMDIwAABSAHUAbgBlAFMAYwBhAHAAZQAAUnVuZVNjYXBlAABWAGUAcgBzAGkAbwBuACAAMQAuADAAAFZlcnNpb24gMS4wAABSAHUAbgBlAFMAYwBhAHAAZQAAUnVuZVNjYXBlAABGAG8AbgB0AFMAdAByAHUAYwB0ACAAaQBzACAAYQAgAHQAcgBhAGQAZQBtAGEAcgBrACAAbwBmACAARgBTAEkAIABGAG8AbgB0AFMAaABvAHAAIABJAG4AdABlAHIAbgBhAHQAaQBvAG4AYQBsACAARwBtAGIASAAARm9udFN0cnVjdCBpcyBhIHRyYWRlbWFyayBvZiBGU0kgRm9udFNob3AgSW50ZXJuYXRpb25hbCBHbWJIAABoAHQAdABwADoALwAvAGYAbwBuAHQAcwB0AHIAdQBjAHQALgBjAG8AbQAAaHR0cDovL2ZvbnRzdHJ1Y3QuY29tAABXAG8AbABmAGkAZQBNAGEAcgBpAG8AAFdvbGZpZU1hcmlvACAaAMQA+gBSAHUAbgBlAFMAYwBhAHAAZQAgAEMAaABhAHQAIAAnADAANyAaAMQA+QAgAHcAYQBzACAAYgB1AGkAbAB0ACAAdwBpAHQAaAAgAEYAbwBuAHQAUwB0AHIAdQBjAHQACiAaAMQA+gBSAHUAbgBlAFMAYwBhAHAAZQAgAEMAaABhAHQAIAAnADAANyAaAMQA+QAgAGkAcwAgAGIAYQBzAGUAZAAgAG8AbgAgIBoAxAD6AFIAdQBuAGUAUwBjAGEAcABlACAAQwBoAGEAdCAaAMQA+QAgAGIAeQAgIBoAxAD6AFcAbwBsAGYAaQBlAE0AYQByAGkAbyAaAMQA+QAgACgAaAB0AHQAcAA6AC8ALwBmAG8AbgB0AHMAdAByAHUAYwB0AC4AYwBvAG0ALwBmAG8AbgB0AHMAdAByAHUAYwB0AG8AcgBzAC8AdwBvAGwAZgBpAGUAbQBhAHIAaQBvACkAAOKAnFJ1bmVTY2FwZSBDaGF0ICcwN+KAnSB3YXMgYnVpbHQgd2l0aCBGb250U3RydWN0CuKAnFJ1bmVTY2FwZSBDaGF0ICcwN+KAnSBpcyBiYXNlZCBvbiDigJxSdW5lU2NhcGUgQ2hhdOKAnSBieSDigJxXb2xmaWVNYXJpb+KAnSAoaHR0cDovL2ZvbnRzdHJ1Y3QuY29tL2ZvbnRzdHJ1Y3RvcnMvd29sZmllbWFyaW8pAABoAHQAdABwADoALwAvAHcAdwB3AC4AZgBvAG4AdABzAGgAbwBwAC4AYwBvAG0AAGh0dHA6Ly93d3cuZm9udHNob3AuY29tAABoAHQAdABwADoALwAvAGYAbwBuAHQAcwB0AHIAdQBjAHQALgBjAG8AbQAvAGYAbwBuAHQAcwB0AHIAdQBjAHQAaQBvAG4AcwAvAHMAaABvAHcALwA4ADUANQA1ADcAMwAAaHR0cDovL2ZvbnRzdHJ1Y3QuY29tL2ZvbnRzdHJ1Y3Rpb25zL3Nob3cvODU1NTczAABDAHIAZQBhAHQAaQB2AGUAIABDAG8AbQBtAG8AbgBzACAAQQB0AHQAcgBpAGIAdQB0AGkAbwBuACAATgBvAG4ALQBjAG8AbQBtAGUAcgBjAGkAYQBsACAAUwBoAGEAcgBlACAAQQBsAGkAawBlAABDcmVhdGl2ZSBDb21tb25zIEF0dHJpYnV0aW9uIE5vbi1jb21tZXJjaWFsIFNoYXJlIEFsaWtlAABGAGkAdgBlACAAYgBpAGcAIABxAHUAYQBjAGsAaQBuAGcAIAB6AGUAcABoAHkAcgBzACAAagBvAGwAdAAgAG0AeQAgAHcAYQB4ACAAYgBlAGQAAEZpdmUgYmlnIHF1YWNraW5nIHplcGh5cnMgam9sdCBteSB3YXggYmVkAAACAAAAAAAAAAAAMwAAAAAAAAAAAAAAAAAAAAAAAAAAANUAAAECAQMAAwAEAAUABgAHAAgACQAKAAsADAANAA4ADwAQABEAEgATABQAFQAWABcAGAAZABoAGwAcAB0AHgAfACAAIQAiACMAJAAlACYAJwAoACkAKgArACwALQAuAC8AMAAxADIAMwA0ADUANgA3ADgAOQA6ADsAPAA9AD4APwBAAEEAQgBDAEQARQBGAEcASABJAEoASwBMAE0ATgBPAFAAUQBSAFMAVABVAFYAVwBYAFkAWgBbAFwAXQBeAF8AYABhAQQAowCEAIUAvQCWAOgAhgCOAIsAnQCpAKQBBQCKANoAgwCTAQYBBwCNAJcAiADDAN4BCACeAKoA9QD0APYAogCtAMkAxwCuAGIAYwCQAGQAywBlAMgAygDPAMwAzQDOAOkAZgDTANAA0QCvAGcA8ACRANYA1ADVAGgA6wDtAIkAagBpAGsAbQBsAG4AoABvAHEAcAByAHMAdQB0AHYAdwDqAHgAegB5AHsAfQB8ALgAoQB/AH4AgACBAOwA7gC6ALAAsQC7AQkBCgELAQwBDQEOAQ8BEAERARIBEwEUALMAqwEVAIwGZ2x5cGgxBmdseXBoMgd1bmkwMEEwB3VuaTAwQUQHdW5pMDBCMgd1bmkwMEIzB3VuaTAwQjkHdW5pMDE4MAd1bmkwMTgxB3VuaTAxODIHdW5pMDE4Mwd1bmkwMTg0B3VuaTAxODUHdW5pMDE4Ngd1bmkwMTg3B3VuaTAxODgHdW5pMDE4OQd1bmkwMThBB3VuaTAxOEIERXVybwAAAAAB//8AAgABAAAADAAAABYAHgACAAEAAQDUAAEABAAAAAIAAAABAAAAAQAAAAAAAAABAAAAANnmLQoAAAAAzhi46gAAAADalEvj";

  // src/assets/runescape_small.ttf
  var runescape_small_default = "data:font/ttf;base64,AAEAAAANAIAAAwBQRkZUTW2mQKEAAE2gAAAAHEdERUYAJwD7AABNeAAAACZPUy8yY5b0rgAAAVgAAABgY21hcOaFMY0AAAUMAAABkmdhc3D//wADAABNcAAAAAhnbHlme67gmgAACEwAADvYaGVhZAaGuOEAAADcAAAANmhoZWEFwwHWAAABFAAAACRobXR4RkAtwAAAAbgAAANUbG9jYb0bzGIAAAagAAABrG1heHAA5ABEAAABOAAAACBuYW1lK2qdMgAARCQAAAbhcG9zdKEEjpAAAEsIAAACaAABAAAAAQAAj4dul18PPPUACwQAAAAAANIzurIAAAAA0jO6sgAA/8ADAALAAAAACAACAAAAAAAAAAEAAALA/8AAAANAAAD+AAMAAAEAAAAAAAAAAAAAAAAAAADVAAEAAADVAEIADgAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAgFAAZAABQAEAgACAAAA/+ACAAIAAAACAAAzAMwAAAAABAAAAAAAAACAAAAPAAAACgAAAAAAAAAARlNUUgAAAA0hIgKA/8AAAALAAEAAAAH7AAAAAAFAAgAAAAAgAAEAgAAAAAAAAAAAAAAAwAAAAMAAQAFAAEACQABAAcAAQALAAEABwAAAAQAAQADAAEAAwAAAAcAAQAHAAEABAABAAUAAQADAAEABAABAAcAAQAEAAEABwABAAYAAQAFAAEABgABAAcAAQAGAAEABwABAAcAAQADAAEABAABAAYAAQAGAAEABgABAAYAAAAKAAEABwABAAcAAQAHAAEABwABAAUAAQAFAAEABwABAAcAAQADAAEABgABAAYAAQAFAAEACAABAAcAAQAHAAEABwABAAcAAQAHAAEABwABAAUAAAAHAAEABwABAAkAAQAHAAEABQAAAAcAAQAEAAEABAAAAAQAAAAHAAEABwABAAQAAQAGAAEABgABAAUAAQAGAAEABgABAAUAAQAGAAEABgABAAMAAQAFAAEABQABAAMAAQAHAAEABgABAAYAAQAGAAEABgABAAUAAQAGAAEABAABAAYAAQAHAAEABwABAAcAAQAGAAEABgABAAMAAAADAAEAAwAAAAgAAQADAAAAAwABAAcAAQAHAAEACAABAAcAAQADAAEACAABAAUAAQAKAAEABgABAAcAAQAHAAEABAABAAoAAQAEAAEABQABA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AGMAYQBwAGUAIABTAG0AYQBsAGwAAFJ1bmVTY2FwZSBTbWFsbAAAVgBlAHIAcwBpAG8AbgAgADEALgAwAABWZXJzaW9uIDEuMAAAUgB1AG4AZQBTAGMAYQBwAGUALQBTAG0AYQBsAGwAAFJ1bmVTY2FwZS1TbWFsbAAARgBvAG4AdABTAHQAcgB1AGMAdAAgAGkAcwAgAGEAIAB0AHIAYQBkAGUAbQBhAHIAawAgAG8AZgAgAEYAUwBJACAARgBvAG4AdABTAGgAbwBwACAASQBuAHQAZQByAG4AYQB0AGkAbwBuAGEAbAAgAEcAbQBiAEgAAEZvbnRTdHJ1Y3QgaXMgYSB0cmFkZW1hcmsgb2YgRlNJIEZvbnRTaG9wIEludGVybmF0aW9uYWwgR21iSAAAaAB0AHQAcAA6AC8ALwBmAG8AbgB0AHMAdAByAHUAYwB0AC4AYwBvAG0AAGh0dHA6Ly9mb250c3RydWN0LmNvbQAAVwBvAGwAZgBpAGUATQBhAHIAaQBvAABXb2xmaWVNYXJpbwAgHABSAHUAbgBlAFMAYwBhAHAAZQAgAFMAbQBhAGwAbCAdACAAdwBhAHMAIABiAHUAaQBsAHQAIAB3AGkAdABoACAARgBvAG4AdABTAHQAcgB1AGMAdAAKAADSUnVuZVNjYXBlIFNtYWxs0yB3YXMgYnVpbHQgd2l0aCBGb250U3RydWN0CgAAaAB0AHQAcAA6AC8ALwB3AHcAdwAuAGYAbwBuAHQAcwBoAG8AcAAuAGMAbwBtAABodHRwOi8vd3d3LmZvbnRzaG9wLmNvbQAAaAB0AHQAcAA6AC8ALwBmAG8AbgB0AHMAdAByAHUAYwB0AC4AYwBvAG0ALwBmAG8AbgB0AHMAdAByAHUAYwB0AGkAbwBuAHMALwBzAGgAbwB3AC8AMgAxADcAMwA2ADIAAGh0dHA6Ly9mb250c3RydWN0LmNvbS9mb250c3RydWN0aW9ucy9zaG93LzIxNzM2MgAAQwByAGUAYQB0AGkAdgBlACAAQwBvAG0AbQBvAG4AcwAgAEEAdAB0AHIAaQBiAHUAdABpAG8AbgAgAE4AbwBuAC0AYwBvAG0AbQBlAHIAYwBpAGEAbAAgAFMAaABhAHIAZQAgAEEAbABpAGsAZQAAQ3JlYXRpdmUgQ29tbW9ucyBBdHRyaWJ1dGlvbiBOb24tY29tbWVyY2lhbCBTaGFyZSBBbGlrZQAAaAB0AHQAcAA6AC8ALwBjAHIAZQBhAHQAaQB2AGUAYwBvAG0AbQBvAG4AcwAuAG8AcgBnAC8AbABpAGMAZQBuAHMAZQBzAC8AYgB5AC0AbgBjAC0AcwBhAC8AMwAuADAALwAAaHR0cDovL2NyZWF0aXZlY29tbW9ucy5vcmcvbGljZW5zZXMvYnktbmMtc2EvMy4wLwAARgBpAHYAZQAgAGIAaQBnACAAcQB1AGEAYwBrAGkAbgBnACAAegBlAHAAaAB5AHIAcwAgAGoAbwBsAHQAIABtAHkAIAB3AGEAeAAgAGIAZQBkAABGaXZlIGJpZyBxdWFja2luZyB6ZXBoeXJzIGpvbHQgbXkgd2F4IGJlZAAAAAAAAgAAAAAAAAAAADMAAAAAAAAAAAAAAAAAAAAAAAAAAADVAAABAgEDAAMABAAFAAYABwAIAAkACgALAAwADQAOAA8AEAARABIAEwAUABUAFgAXABgAGQAaABsAHAAdAB4AHwAgACEAIgAjACQAJQAmACcAKAApACoAKwAsAC0ALgAvADAAMQAyADMANAA1ADYANwA4ADkAOgA7ADwAPQA+AD8AQABBAEIAQwBEAEUARgBHAEgASQBKAEsATABNAE4ATwBQAFEAUgBTAFQAVQBWAFcAWABZAFoAWwBcAF0AXgBfAGAAYQEEAKMAhACFAL0AlgDoAIYAjgCLAJ0AqQCkAQUAigDaAIMAkwEGAQcAjQCXAIgAwwDeAQgAngCqAPUA9AD2AKIArQDJAMcArgBiAGMAkABkAMsAZQDIAMoAzwDMAM0AzgDpAGYA0wDQANEArwBnAPAAkQDWANQA1QBoAOsA7QCJAGoAaQBrAG0AbABuAKAAbwBxAHAAcgBzAHUAdAB2AHcA6gB4AHoAeQB7AH0AfAC4AKEAfwB+AIAAgQDsAO4AugCwALEAuwEJAQoBCwEMAQ0BDgEPARABEQESARMBFACzAKsBFQCMBmdseXBoMQd1bmkwMDBEB3VuaTAwQTAHdW5pMDBBRAd1bmkwMEIyB3VuaTAwQjMHdW5pMDBCOQd1bmkwMTgwB3VuaTAxODEHdW5pMDE4Mgd1bmkwMTgzB3VuaTAxODQHdW5pMDE4NQd1bmkwMTg2B3VuaTAxODcHdW5pMDE4OAd1bmkwMTg5B3VuaTAxOEEHdW5pMDE4QgRFdXJvAAAAAf//AAIAAQAAAAwAAAAWAB4AAgABAAEA1AABAAQAAAACAAAAAQAAAAEAAAAAAAAAAQAAAADSBBQFAAAAAMlucfoAAAAA0jO6oQ==";

  // src/ui/osrs-assets.ts
  var OSRS_UI_ASSETS = Object.freeze({
    background: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFgAAAA8CAYAAADi8H14AAAEbElEQVR4XuXbwa5UNxCE4ftMJFuirFB4/wciMpKR7zdtu+3jcyYRi3/j6arqLi4jkODj29cvP67yz19/vPD97z+3aD0yORnMyKJPxqvO1Z0/oiPaY/zcY3uHG5xBj17mKuZk0CPrV2fqzp8K1qglO1cxOIMeq5k9zMmiT8bP2Z8F+xiRmTNsBb1q5tWCzcmijzjf06QLzmDgCnpdLbbFrAx6RGQ0Hz7M6BkZtoJehVPlFszLoo9kZpcKjhbwbRUzTnwtiJlZ9NkhVbDBp2gz2mJPFmzmLvpmeUvB+lvsiXLNPIEZGd5esMWeKNi8k5g14+UvGtFxhlxBb7N7O2Qx7w7MHPFowfqaO9ohi5l3YnbES8EOaJpFnwizR3tkcY8ncIeW6XewZln0abHMCDVZ3OMJ3KFlWLBGK+hVscgINau4yxO4Q+WlYIW76FuwyAg1O7jL07S7fCrYwV08uGCREWqu4E7v4sOHE3isRfZQdxX3ege3F2yJPSznFO72NLcWbIkjLKaW49sO7vckqYJXFq2zFjgiW4hzK+j1FNOCXXS2bJ2xxB5ZX/130OsJtgruLdt+bpERM78I99hBHzNOUL23C44Wq+8W2aPn08N8f5F2MWeH6qP3pYJ7phYZ0eqz9HJ838GsGep7HCnYOcuMilU/Q93MdxXzZqjvMSzY4YiexgKiEtSOUBt5R29ZzJuhvsfxgtWNjlU3Qm1UZvQmo8/MHKFWas7lggundCNanUWO6Gnc5co+0uYcKbiyojVrhNqCha2in5kj1OrZ5hwpWF1W73wPdRUPa99m6JXdR020R5tzuWA14rw4L87PGBUZvbWYHaFm5Dss2OEINeL8CLWr+pbo2AzmR6gp9AoubBfsvDif4YTHFcyPUFPolVvmjxfs3CqnfHbwFnG+EhVcNVsFO5vRPM3OTt6ze1ur6xa8g0HvYncvdSvansfRgiuGPo37rOw00/T+hKK2ckvB4iJ3Y/7KDiNNW+5/qmBxsVU81IPNW83uzZkjZhXeUnDFBbNYrIebE6HnKcy57V/2ZDH/BGaMUDti9NPb46XggkvcjflX0X+E2h7R75QMv33B2fydcgs/v4N9dIEncIer6D9CbUvvez5L+BNccIkncIer6D9CbcFyjxZccZG7MDdCTY+V2VbTYrG3FVxwmTswU5w/TZtlqTsFV99Uwa3gLswT50eszldNwULFvSJa3/9NwdkddjStzkJF/1lWuuCewSnMilAjzmd1VWuZEau+SwVnTXcxK0JNRu+c1DnLlBXPynLBqwFZ9J+xondWyoxlyopfy0vBmo3Q7Ap6Z8jqzZIyY6GS9ZJPBUeGMzTcRd8VZh5mSZmx0F4Xamf8KlhTjWdovIOepzBHyoy3Rx2oyzAtOHobYcAq+rmDn0WZo88izOhlqcvw8p/BDYjeWqLPDFlB/15Gy8zDz8WMXpa6DMOCe7ShvXeDsnjUKGOWk5mpc95olposywV7YO8zg7Lon0Wf6uVbRJnzzlP3/Aux15JCo6IzvQAAAABJRU5ErkJggg==",
    checkbox: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAAAf0lEQVR4XmNgAAPG/5RhqCHdFRH/V/TGkYVBeqGGMaIIkoJh+lAMQphMPIYZBjcIZgOIzcvLTRRG14diELpiQpgog6SlpbFikgxC14yO6WsQuiZceIgZhK6YEKadQUUpgWR7DaQXxSCYYaRgmD64QciGkYph+hkgAMYhFzMwAAAe3fYcBB666gAAAABJRU5ErkJggg==",
    checkboxChecked: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAAApklEQVR4XqXPsQ2DMBAF0KNGTOBBMgI1HRVVJkiVHaLsgcSQoCP+xGds8W2MvmSj+8+yyL6a9V488nmP6/ydqqJdjzXmZ0nQM9Bf5gPsgHCD7ruupRL3DBQPpyL+0z0FOedOAfJYeg6KgRRSBYWInikIpRyCXEJaQDmHUJAOhVgKuYTCQQVyCEJBTE7Q6zmYpzHB07RrIGAlQe+AQqw06Mtv4VAbkQ13/AuHap1QkAAAAABJRU5ErkJggg==",
    wrench: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABUAAAAVCAYAAACpF6WWAAABsUlEQVR4Xq2U7StDURjA57vykmlEjSLkpbzWQhPNVqNNSwjbWpZGQz4gtZBPSknywSff/JnHfofn3nOv3V20D7/de+5zz2/Pec5zbiAQaFKNp/rz8VRS7w8H6u0+78nrbU49V/bUy+2+vgqPVzuam3Ja5TOLthQhgbvTDR2sHKc016V1C8bETHh2cZhU54WEKmxGVSI6YUvJBCFB4TS3qpHxZTGp6WhrtuD50e6KKm4tqe21iFqOjDql/LMpNZFsTWEo2GLFESONzg3/TeolFMj2R6bUx/1i+Xv5ptQt7OsJampKmWjWkPtyLm6NEXZ3tmp6u9odQpHGF8frSyVLNocrGYoQTOFgOKR335EpPail2ZhjaYKfkI3ylBL8j1B2PzI5YEs5JUjPsnYNvYRfpYmrk+q7IiTLVGzaKeW4IZX61ROCNDwyjuZeer62VPpU2sZLiExEwLLBU/pXoa+U5hchAreQJXsJIbk86ZTyhULqzlCkfkJPKRtlZggcANldU/grKfWU9qBuAjImZBKzumZuEAk0/tRYvy1lsgQ4v3xsuYeFmSGdgR8IJ0bCtrTRfAKP5fHYWPQoJAAAAABJRU5ErkJggg==",
    wrenchHovered: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABUAAAAVCAYAAACpF6WWAAABc0lEQVR4Xq3UzUsCQRiAcbsHfZBhUVBBUVAE9olUGIaxYaEhUpGlSB4sZKFLEUhGpyCIiA6duvVnTj4Lsx+z47oLHh49rPz2nXV2YrHYgOh/nY+1lTmrVHI+dLsbi3bprSVhpFdFrZT2opnUsshlknb57LqvorHpq3S0Lc6PU6J+ti+emwUH5c5AXHRXLuz4GhsZtKsW96zpAO9rhnh/vOiNqjdwg4n4kI3eXh5ER3UgmJxSop+tshflmamQbtkqODsVt3qo56KhLBNwcnzYanpi1APSU+NEjwLoQGJCCZIbXJhJhEfDgjxT0K/2lR5VpwwDSvS7XXFQ3go2cpgJJeLOvM4Go1HBZuVQmJ1Af16rflT+y1HBQDQKKFE2PbXu8npUgmzsXqCcsCvK0cVpo06oQ1VMxgnlQTn22J+8JUGgG1XhF/PUi3KYsGT3j3jwQbFcpiNATqjftxsHBeQiF4jXTcZbwjd7kEm6Bfj30XDQfvcPGs7ksDxZ60EAAAAASUVORK5CYII=",
    close: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAXCAYAAAAV1F8QAAAA4UlEQVR4Xr2UMQ7CMBAEk5/xB2pq/kDBH1JTwxugpuYP/MTRYVm2z3vOniOx0lbZvZHOsafppzlge6X7zZw5fJ+Xxj4YNSOGHtdDZRA0RPdx0Agrubp2+LUcUaHqSUb3XCAZ8L6dwud+BqXYkW+SQbC2UxQtSHIs1gePYAYkKa8CQXouYRuQpLwSPWzLeMVd4TvB2AFJ8sMGIEk8bAdE9BcQD9kBG//zHLDxu+SAca9Dz8Rd8rx3+PyI1wFDSlhbHHrv+iBQqHoIYvRsEAgr5Z+H6OKdg6Ahuh8PGJuV7tUzVjYAxJwK2sd2AAAAAElFTkSuQmCC",
    closeHovered: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAXCAYAAAAV1F8QAAAA80lEQVR4Xr2UwQ3CMAxF2+1YgCEYAa4swQTdAAmxAZy5cENikCLXspI4P43tSnzJl/JfnmTaDMOSccbjjearc8b5cztV45OZzuDSdNkVA4qNmHlcvE57VFZhlrqaB2wtIpDmcT8goOCoI32XKJfQvJ9HADFDv0lPy2omA5Hk+zovk0DuynMka0gkaRVakstyCZJ1JJK0En1Yb/CKV1OuxjpOicQnC0okNtlGCeUvIptko8wnCcrir7dDFv9gaeSj7cjiV1AukWuoIYtfqkgiF2vNKJGWAaDgkMQsEhkoq5Qrz3nAchnNukRi5vkPxmON5sozfvsw8Uowb302AAAAAElFTkSuQmCC",
    button: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAeCAYAAACc7RhZAAAEAElEQVR4XuWZwWrcQBBE/TG5Bf9B8CGwBwf2YMMeYsjF+Avy/7ChBG95rpmRCLltFhqpZ7qqu6tHwsIPD/o9fv1y/R/MPX/6ZfP3x8td21IA1EnQz7fL9Xx+3ux0+n59fT1v9z+eTzf/cnnZ7ttPHPHsBwffjMOYztX78YOLz759cuGTNz0hwCcRfDRQCQAFuqjcv7//2vZmPmskbjvCrLBZJza44Flrn3jEYaA+BTch+tgHGAsQISwCTeSKwu0/PX3bzPEtzB6GeGK9t8rpeJqncU5IbHgcEMBNU2gIAPaUYiSwnziKcuI0sOJoTGLZpyaOt2vqGuElT9fomgYBHMTEnYQCeTRyP/PhsZgUteIwphtw0Y730W7f04eH3PAMArDhSVkANwI5R7V934PzadjDJK5jm5OaZj64FiB7PEbxBwEC6GMaQ00Ka0HaD0fi+sjucRjDJMGEg3U/Gt0gPjniM3XiECF7gwA0Q5K8VSEhgYvmLd4+axQP7x7HHsYiEssbnzX7zsHw2D88ARBSAMbUvO8C7FMEe0wXziOMY4y1cFjzOA81+wSYaxCgg3Nl+l7rabTvYjpmxWEMe7mao3k7Bt+15tovP2wpwOpFxBpxnph9Cpm9kFYcxhDrPT8G5qMx++Rwfq8tBSC4k8zeASHjxdQ+9zTEWmzFsYeh+Y6d5e46mb7FwwYBUCebnhCqckVZSNuniVzBmXPGYUzXgXA+BavciOea6cGciRsEIIhAgiFmQqz73r4bcmxsxWGM452/Y12rY8nj/ODc4yAAQZ3kXx+BbnjGYYxPjTk6dpa76/yrR4BGMYAhThEcr8R1MfaJRUCS08wRxqKZwzXMOOw7Fg73lrhBgAAI5JgADhFXjhZFtu8mKA7cisOYbpQmWphZbnCumR7cW+IGAQiyWtwHENVIBLHjvOfkPaUZhzGzeO/TsOu0T07E6X6wQYAAY/wpTCACcB9y9khmvwtuoWYcxjh+xsVazALhk8cCkJfvgNggAKr572UXwynoZtonOT7T3ONoTON6f5U75unH6CExfOxN3wEkJRnTcBExFCS+fZLm3oXscRhj0WOupeNdHz45XB+1ZJ34QQAK60nk3qo6sQXAd7Ks+4tvxWEMhcf4IvVQVnnxEY3HzH1kHb6pAJ4YjacIinMRNNJ+Txjj0ZpxGJN1f/dbMOIsUvuuNbW3EOwPAmCedghJypUkJG+/haEYEh9hOr4bneHbd81Zo3GefewmAMYGigGO+c0dZflWbz+xxoOJrTiM4R7r/fjBBc++ffLAZbwbx4b/DyTAyqJeN9OFukhOUDg4URR7hGGNiTF59vdyY5wIBKAXN39r3L9+HO7Rls3n56Nxz+ae/wAEpQZnW6KnlAAAAABJRU5ErkJggg==",
    border: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABsAAAAbCAYAAACN1PRVAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAaElEQVR4nGNgYGD8Tz/MwPjfWEeF5pgB2bLkMDeaYWNsljHQACSPWkYNkDyygtHX2WzUMpJA8mgwUgMkjwYj1YORn5+ffiUI/6hlZILkkReMyTRsXfHz8yMsozWGWwZm0KgVDDMfZAcAf6Cosyff1O8AAAAASUVORK5CYII="
  });

  // src/ui/styles.ts
  var SOLANASCAPE_DECK_STYLES = `
@font-face {
  font-family: "Solanascape Deck RuneScape";
  src: url("${runescape_default}") format("truetype");
  font-display: block;
}

@font-face {
  font-family: "Solanascape Deck RuneScape Small";
  src: url("${runescape_small_default}") format("truetype");
  font-display: block;
}

:host {
  all: initial;
  --rl-brand: rgb(220, 138, 0);
  --rl-panel: rgba(70, 61, 50, .88);
  --rl-overlay: rgba(70, 61, 50, .612);
  --rl-dark: rgb(30, 30, 30);
  --rl-darker: rgb(23, 23, 23);
  --rl-medium: rgb(77, 77, 77);
  --rl-text: rgb(198, 198, 198);
  --rl-progress: rgb(82, 161, 82);
  color-scheme: dark;
  font-family: 'RS Plain 12', 'RuneScape', Arial, sans-serif;
  pointer-events: none;
  position: fixed;
  inset: 0;
  z-index: 2147483000;
}

*, *::before, *::after { box-sizing: border-box; }

.sl-panel {
  background: var(--rl-panel);
  border: 1px solid rgba(56, 49, 40, .96);
  border-radius: 0;
  box-shadow: inset 0 0 0 1px rgba(84, 73, 60, .96), 0 3px 9px rgba(0, 0, 0, .65);
  color: white;
  left: auto;
  max-height: min(78vh, 720px);
  min-width: 310px;
  overflow: hidden;
  pointer-events: auto;
  position: fixed;
  right: 24px;
  top: 96px;
  width: 350px;
}
.sl-panel.sl-docked { box-shadow: inset 0 0 0 1px rgba(84, 73, 60, .96), 0 2px 5px rgba(0, 0, 0, .58); }
.sl-panel.sl-collapsed { width: 360px; min-width: 320px; }
.sl-panel.sl-collapsed .sl-body { display: none; }
.sl-panel:not(.sl-collapsed) .sl-compact-summary { display: none; }
.sl-panel.sl-lite-panel { max-height: none; min-width: 0; overflow: visible; width: 220px; }
.sl-lite-panel .sl-titlebar { cursor: default; min-height: 32px; padding-block: 3px; }
.sl-lite-panel .sl-icon-button { font-size: 11px; width: 42px; }
.sl-lite-menu { background: rgba(23, 23, 23, .98); border: 1px solid rgba(56, 49, 40, .96); box-shadow: 0 3px 8px rgba(0,0,0,.7); }
.sl-lite-menu[hidden] { display: none; }
.sl-diagnostics-button { margin: 0 5px 5px; width: calc(100% - 10px); }

.sl-titlebar {
  align-items: center;
  background: rgba(0, 0, 0, .16);
  border-bottom: 1px solid rgba(35, 30, 25, .9);
  cursor: grab;
  display: flex;
  gap: 7px;
  min-height: 36px;
  padding: 5px 6px 5px 8px;
  touch-action: none;
  user-select: none;
}
.sl-titlebar:active { cursor: grabbing; }
.sl-panel.sl-docked .sl-titlebar, .sl-panel.sl-docked .sl-titlebar:active { cursor: default; }
.sl-brand { color: white; font-size: 16px; font-weight: 700; text-shadow: 1px 1px #000; }
.sl-status-dot { background: var(--rl-brand); box-shadow: 1px 1px #000; height: 6px; transform: rotate(45deg); width: 6px; }
.sl-status-dot.sl-ready { background: rgb(55, 240, 70); }
.sl-compact-summary { color: var(--rl-text); display: flex; font-size: 13px; gap: 7px; margin-left: 4px; text-shadow: 1px 1px #000; }
.sl-compact-xp { color: var(--rl-brand); }
.sl-compact-time::before { color: #8f867b; content: "\xB7"; margin-right: 7px; }
.sl-title-spacer { flex: 1; }

.sl-icon-button, .sl-button {
  appearance: none;
  background: var(--rl-dark);
  border: 1px solid var(--rl-darker);
  border-radius: 0;
  box-shadow: inset 0 0 0 1px var(--rl-medium);
  color: var(--rl-text);
  cursor: pointer;
  font: inherit;
  text-shadow: 1px 1px #000;
}
.sl-icon-button { height: 25px; line-height: 20px; padding: 0; width: 27px; }
.sl-button { font-size: 12px; padding: 4px 7px; }
.sl-icon-button:hover, .sl-button:hover { background: rgb(60, 60, 60); color: white; }
.sl-button.sl-danger { color: rgb(230, 90, 80); }
.sl-button.sl-confirm { background: rgb(100, 30, 25); color: white; }

.sl-body { max-height: calc(min(78vh, 720px) - 36px); overflow: auto; }
.sl-summary { border-bottom: 1px solid rgba(35, 30, 25, .8); display: grid; gap: 4px 12px; grid-template-columns: 1fr auto; padding: 9px 8px; }
.sl-summary-label { color: var(--rl-text); font-size: 12px; }
.sl-summary-value { color: white; font-size: 13px; text-align: right; text-shadow: 1px 1px #000; }
.sl-summary-value.sl-accent { color: var(--rl-brand); }
.sl-message { color: var(--rl-text); font-size: 13px; line-height: 1.35; padding: 14px 9px; text-align: center; text-shadow: 1px 1px #000; }

.sl-skill-list { display: flex; flex-direction: column; }
.sl-skill { border-bottom: 1px solid rgba(35, 30, 25, .72); display: grid; gap: 4px 8px; grid-template-columns: minmax(90px, 1fr) auto auto; padding: 7px 8px; }
.sl-skill:last-child { border-bottom: 0; }
.sl-skill-name { color: white; font-size: 13px; text-shadow: 1px 1px #000; }
.sl-skill-level { color: var(--rl-text); font-size: 12px; margin-left: 5px; }
.sl-skill-gained { color: var(--rl-brand); font-size: 13px; text-align: right; text-shadow: 1px 1px #000; }
.sl-skill-rate { color: white; font-size: 12px; text-align: right; text-shadow: 1px 1px #000; }
.sl-progress-track { background: rgba(255, 255, 255, .5); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .45); grid-column: 1 / 4; height: 12px; overflow: hidden; }
.sl-progress-fill { background: var(--rl-progress); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .08); height: 100%; min-width: 0; }
.sl-skill-meta { color: var(--rl-text); font-size: 11px; grid-column: 1 / 4; text-shadow: 1px 1px #000; }

.sl-toolbar { align-items: center; background: rgba(0, 0, 0, .12); border-top: 1px solid rgba(35, 30, 25, .8); display: flex; flex-wrap: wrap; gap: 5px; padding: 6px; }
.sl-toolbar-status { color: var(--rl-text); flex: 1; font-size: 11px; min-width: 82px; text-shadow: 1px 1px #000; }

.sl-overlay-menu { background: rgba(23, 23, 23, .98); border-top: 1px solid rgba(84, 73, 60, .9); display: grid; gap: 1px; grid-template-columns: 1fr 1fr; padding: 5px; }
.sl-overlay-menu[hidden] { display: none; }
.sl-overlay-toggle { align-items: center; appearance: none; background: rgb(30, 30, 30); border: 1px solid rgb(23, 23, 23); box-shadow: inset 0 0 0 1px rgb(77, 77, 77); color: var(--rl-text); cursor: pointer; display: flex; font: inherit; font-size: 12px; gap: 6px; min-height: 27px; padding: 4px 6px; text-align: left; text-shadow: 1px 1px #000; }
.sl-overlay-toggle::before { border: 1px solid #7d7469; color: #44e35e; content: ""; display: inline-grid; height: 12px; place-items: center; width: 12px; }
.sl-overlay-toggle.sl-enabled { color: white; }
.sl-overlay-toggle.sl-enabled::before { content: "\u2713"; font-family: Arial, sans-serif; font-size: 11px; line-height: 10px; }
.sl-overlay-toggle:hover { background: rgb(60, 60, 60); }
.sl-zoom-controls { display: grid; gap: 3px; grid-column: 1 / -1; grid-template-columns: 1fr 1fr 1fr; padding-top: 3px; }
.sl-zoom-controls .sl-button:disabled { color: #706a63; cursor: default; opacity: .72; }

.sl-xp-drop-layer, .sl-attack-style-layer, .sl-tile-layer, .sl-combat-layer, .sl-ground-item-layer, .sl-player-name-layer { contain: layout paint; overflow: hidden; pointer-events: none; position: fixed; }
.sl-xp-scene { height: 503px; position: absolute; transform: scale(var(--sl-canvas-scale-x, 1), var(--sl-canvas-scale-y, 1)); transform-origin: left top; width: 765px; }
.sl-xp-drop-lane { align-items: flex-end; display: flex; flex-direction: column; gap: 1px; position: absolute; right: 253px; top: 72px; }
.sl-xp-drop { align-items: center; animation: sl-xp-drop 1.75s cubic-bezier(.2, .72, .35, 1) forwards; color: white; display: flex; filter: drop-shadow(1px 1px #000); font-family: "Solanascape Deck RuneScape Small", sans-serif; font-kerning: none; font-size: 9px; gap: 2px; line-height: 10px; text-rendering: optimizeSpeed; white-space: nowrap; }
.sl-xp-drop-icon { height: 10px; image-rendering: pixelated; object-fit: contain; width: 10px; }
.sl-xp-drop-value { color: #ff981f; }
@keyframes sl-xp-drop {
  0% { opacity: 0; transform: translateY(4px); }
  12% { opacity: .96; transform: translateY(0); }
  72% { opacity: .9; }
  100% { opacity: 0; transform: translateY(-7px); }
}
.sl-xp-globe-lane { display: flex; gap: 4px; left: 260px; position: absolute; top: 9px; transform: translateX(-50%); }
.sl-xp-globe { background: transparent; border: 0; border-radius: 50%; box-shadow: none; box-sizing: border-box; height: 23px; opacity: 1; pointer-events: auto; position: relative; transition: opacity .75s linear; width: 23px; }
.sl-xp-globe-fading { opacity: 0; }
.sl-xp-globe-svg { height: 23px; inset: 0; overflow: visible; position: absolute; shape-rendering: geometricPrecision; width: 23px; }
.sl-xp-globe-background { fill: rgba(128,128,128,.5); transition: fill .12s linear; }
.sl-xp-globe-track { fill: none; stroke: #000; stroke-width: 5; }
.sl-xp-globe-progress { fill: none; stroke: #ffd42a; stroke-linecap: butt; stroke-width: 2; }
.sl-xp-globe-icon { height: 12px; image-rendering: pixelated; left: 5.5px; object-fit: contain; position: absolute; top: 5.5px; width: 12px; z-index: 1; }
.sl-xp-globe:hover .sl-xp-globe-background { fill: rgba(0,0,0,.706); }
.sl-xp-globe-tooltip { background: rgba(54, 48, 41, .46); border: 1px solid rgba(24,20,17,.68); box-shadow: inset 0 0 0 1px rgba(102,90,75,.28), 1px 1px 2px rgba(0,0,0,.48); color: white; display: none; font-family: "Solanascape Deck RuneScape Small", sans-serif; font-kerning: none; font-size: 8px; left: 50%; line-height: 9px; min-width: 79px; padding: 3px 4px; position: absolute; text-rendering: optimizeSpeed; text-shadow: 1px 1px #000; top: 24px; transform: translateX(-50%); white-space: nowrap; z-index: 2; }
.sl-xp-globe:hover .sl-xp-globe-tooltip { display: block; }
.sl-xp-tooltip-row { display: flex; gap: 6px; justify-content: space-between; }
.sl-xp-tooltip-label { color: #ff981f; }

.sl-attack-style-hud {
  background: var(--rl-overlay);
  border: 1px solid rgba(56, 49, 40, .86);
  box-shadow: inset 0 0 0 1px rgba(84, 73, 60, .86);
  color: white;
  min-width: 65px;
  padding: 2px 3px;
  position: absolute;
  right: 34%;
  bottom: 34%;
  text-align: center;
  text-shadow: 1px 1px #000;
}
.sl-attack-style-title { font-size: 8px; line-height: 9px; }

.sl-defensive-style-layer { contain: layout paint; overflow: hidden; pointer-events: none; position: fixed; }
.sl-defensive-style-layer[hidden] { display: none; }
.sl-defensive-style-scene { height: 503px; position: absolute; transform: scale(var(--sl-canvas-scale-x, 1), var(--sl-canvas-scale-y, 1)); transform-origin: left top; width: 765px; }
.sl-defensive-style-blocker {
  align-items: center;
  background: rgba(63, 57, 47, .97);
  border: 1px solid rgba(31, 27, 22, .95);
  box-shadow: inset 0 0 0 1px rgba(103, 91, 71, .72);
  color: #ffff00;
  cursor: not-allowed;
  display: flex;
  font-family: "Solanascape Deck RuneScape Small", sans-serif;
  font-size: 10px;
  gap: 7px;
  height: 44px;
  left: 557px;
  padding: 3px 6px;
  pointer-events: auto;
  position: absolute;
  text-shadow: 1px 1px #000;
  top: 397px;
  width: 182px;
}
.sl-defensive-style-cross { height: 30px; position: relative; width: 58px; }
.sl-defensive-style-cross::before,
.sl-defensive-style-cross::after { background: #120f0b; content: ""; height: 3px; left: 4px; position: absolute; top: 14px; width: 50px; }
.sl-defensive-style-cross::before { transform: rotate(37deg); }
.sl-defensive-style-cross::after { transform: rotate(-37deg); }
.sl-defensive-style-message { flex: 1; text-align: center; }

.sl-tile-layer svg { display: block; height: 100%; width: 100%; }
.sl-hovered-tile { fill: rgba(255, 255, 255, .12); shape-rendering: geometricPrecision; stroke: none; }
.sl-destination-tile { fill: rgba(0, 210, 255, .16); shape-rendering: geometricPrecision; stroke: none; }

.sl-ground-item-scene { height: 100%; position: absolute; width: 100%; }
.sl-player-name-scene { height: 100%; position: absolute; width: 100%; }
.sl-ground-item-label {
  color: #fff;
  /* RuneLite uses this TTF at Java2D size 16. Its browser glyph metrics render
     at roughly twice that visual height, so 8 CSS px is the matching scale. */
  font: 8px/8px "Solanascape Deck RuneScape Small", sans-serif;
  font-kerning: none;
  left: 0;
  position: absolute;
  text-rendering: optimizeSpeed;
  text-shadow: 1px 1px #000;
  top: 0;
  transition: transform 120ms linear;
  white-space: nowrap;
  will-change: transform;
}
.sl-player-name-label {
  color: #fffd7a;
  font: 8px/8px "Solanascape Deck RuneScape Small", sans-serif;
  font-kerning: none;
  left: 0;
  position: absolute;
  text-rendering: optimizeSpeed;
  text-shadow: 1px 1px #000;
  top: 0;
  transition: none;
  transform: translate(-50%, -100%);
  white-space: nowrap;
  will-change: transform;
}
.sl-player-name-local { color: #73ff7b; }

.sl-combat-layer { height: 503px; width: 765px; }
.sl-combat-scene { height: 503px; position: absolute; transform: scale(var(--sl-canvas-scale-x, 1), var(--sl-canvas-scale-y, 1)); transform-origin: left top; width: 765px; }
.sl-opponent-panel { background: var(--rl-overlay); border: 1px solid rgba(56, 49, 40, .92); box-shadow: inset 0 0 0 1px rgba(84, 73, 60, .9), 1px 2px 3px rgba(0,0,0,.65); left: 24px; min-height: 26px; padding: 2px 3px 3px; position: absolute; top: 8px; width: 97px; }
.sl-opponent-panel[hidden] { display: none; }
.sl-opponent-name { color: white; font-size: 10px; line-height: 12px; overflow: hidden; text-align: center; text-overflow: ellipsis; text-shadow: 1px 1px #000; white-space: nowrap; }
.sl-opponent-track { background: rgba(102, 15, 16, .9); border: 1px solid rgba(0,0,0,.65); height: 10px; overflow: hidden; position: relative; }
.sl-opponent-fill { background: rgba(0, 146, 54, .92); height: 100%; transition: width .18s linear; }
.sl-opponent-label { color: white; font-family: Arial, sans-serif; font-size: 8px; inset: 0; line-height: 8px; position: absolute; text-align: center; text-shadow: 1px 1px #000; }

@media (max-width: 600px) {
  .sl-panel, .sl-panel.sl-collapsed { max-height: 62vh; min-width: 280px; right: 8px; top: 70px; width: min(350px, calc(100vw - 16px)); }
  .sl-attack-style-hud { right: 33%; bottom: 34%; min-width: 53px; }
  .sl-overlay-menu { grid-template-columns: 1fr; }
}
.sl-panel.sl-lite-panel { min-width: 0; width: 220px; }

/* Unified Solanascape Deck settings interface. The frame, buttons, wrench,
   close control, and checkboxes use authentic OSRS sprites. */
.deck-settings-layer {
  contain: layout paint;
  overflow: hidden;
  pointer-events: none;
  position: fixed;
}
.deck-settings-layer[hidden] { display: none; }
.deck-settings-scene {
  height: 100%;
  position: absolute;
  width: 100%;
}
.deck-settings-gear {
  appearance: none;
  background: url("${OSRS_UI_ASSETS.wrench}") center / 21px 21px no-repeat;
  border: 0;
  cursor: pointer;
  height: 21px;
  image-rendering: pixelated;
  padding: 0;
  pointer-events: auto;
  position: absolute;
  right: 8px;
  top: 5px;
  width: 21px;
}
.deck-settings-gear:hover,
.deck-settings-gear[aria-expanded="true"] { background-image: url("${OSRS_UI_ASSETS.wrenchHovered}"); }
.deck-modal-backdrop {
  align-items: center;
  background: rgba(0, 0, 0, .52);
  display: flex;
  height: 100%;
  justify-content: center;
  left: 0;
  pointer-events: auto;
  position: absolute;
  top: 0;
  width: 100%;
}
.deck-modal-backdrop[hidden] { display: none; }
.deck-modal {
  background: #403a30 url("${OSRS_UI_ASSETS.background}") repeat;
  border: 9px solid transparent;
  border-image: url("${OSRS_UI_ASSETS.border}") 9 repeat;
  color: white;
  display: grid;
  font-family: "Solanascape Deck RuneScape Small", sans-serif;
  font-size: 11px;
  grid-template-rows: 24px 1fr;
  height: min(302px, calc(100% - 16px));
  image-rendering: pixelated;
  overflow: hidden;
  text-shadow: 1px 1px #000;
  width: min(486px, calc(100% - 16px));
}
.deck-modal-titlebar {
  align-items: center;
  background: rgba(22, 20, 17, .36);
  border-bottom: 1px solid rgba(14, 13, 11, .72);
  display: flex;
  margin: -5px -5px 0;
  min-width: 0;
  padding-left: 8px;
}
.deck-modal-title {
  color: #ff981f;
  flex: 1;
  font-size: 13px;
  text-align: center;
}
.deck-modal-close {
  appearance: none;
  background: url("${OSRS_UI_ASSETS.close}") center / 26px 23px no-repeat;
  border: 0;
  cursor: pointer;
  height: 23px;
  margin-right: 1px;
  padding: 0;
  width: 26px;
}
.deck-modal-close:hover { background-image: url("${OSRS_UI_ASSETS.closeHovered}"); }
.deck-modal-body {
  display: grid;
  grid-template-columns: 76px 1fr;
  min-height: 0;
}
.deck-category-nav {
  border-right: 1px solid rgba(24, 21, 17, .7);
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 3px 3px 3px 0;
}
.deck-category-button,
.deck-stone-button {
  appearance: none;
  background: url("${OSRS_UI_ASSETS.button}") center / 100% 100% no-repeat;
  border: 0;
  color: #ff981f;
  cursor: pointer;
  font: 11px "Solanascape Deck RuneScape Small", sans-serif;
  min-height: 24px;
  padding: 1px 4px;
  text-shadow: 1px 1px #000;
}
.deck-category-button:hover,
.deck-category-button[aria-pressed="true"],
.deck-stone-button:hover { color: #fff; filter: brightness(1.15); }
.deck-settings-content {
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 2px 4px 5px;
  scrollbar-color: #786b55 #211d17;
  scrollbar-width: thin;
}
.deck-settings-content::-webkit-scrollbar { width: 12px; }
.deck-settings-content::-webkit-scrollbar-track { background: #211d17; border-left: 1px solid #0f0d0b; }
.deck-settings-content::-webkit-scrollbar-thumb { background: #786b55; border: 2px solid #211d17; }
.deck-category-panel[hidden] { display: none; }
.deck-section-title {
  background: rgba(21, 19, 16, .26);
  border-bottom: 1px solid rgba(39, 34, 27, .72);
  color: white;
  font-size: 11px;
  font-weight: 400;
  line-height: 18px;
  margin: 1px 0;
  text-align: center;
}
.deck-setting-row {
  align-items: center;
  border-bottom: 1px solid rgba(55, 48, 39, .38);
  cursor: pointer;
  display: flex;
  gap: 6px;
  min-height: 29px;
  padding: 2px 4px;
}
.deck-setting-row[hidden] { display: none; }
.deck-setting-row:hover { background: rgba(255, 255, 255, .035); }
.deck-setting-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.deck-setting-name { color: #ff981f; font-size: 11px; line-height: 12px; }
.deck-setting-description { color: #d0c8b8; font-size: 9px; line-height: 10px; }
.deck-setting-row input[type="checkbox"] { height: 1px; opacity: 0; position: absolute; width: 1px; }
.deck-input-row { cursor: default; }
.deck-checkbox {
  background: url("${OSRS_UI_ASSETS.checkbox}") center / 16px 16px no-repeat;
  flex: 0 0 16px;
  height: 16px;
  width: 16px;
}
.deck-setting-row input:checked + .deck-checkbox { background-image: url("${OSRS_UI_ASSETS.checkboxChecked}"); }
.deck-setting-row input:focus-visible + .deck-checkbox { filter: brightness(1.4); }
.deck-action-row { cursor: default; }
.deck-stone-button { flex: 0 0 72px; min-height: 23px; }
.deck-text-input {
  background: rgba(14, 13, 11, .5);
  border: 1px solid rgba(94, 82, 65, .72);
  color: white;
  flex: 0 0 116px;
  font: 11px "Solanascape Deck RuneScape Small", sans-serif;
  min-width: 0;
  padding: 3px 4px;
  text-shadow: 1px 1px #000;
}
.deck-text-input::placeholder { color: #8f8676; }
.deck-overview { color: #d8d1c4; line-height: 1.25; padding: 5px 8px 8px; text-align: center; }
.deck-overview p { margin: 4px 0 0; }
.deck-overview-title { color: #ff981f; font-size: 14px; }
.deck-hook-status,
.deck-readout {
  background: rgba(14, 13, 11, .35);
  border: 1px solid rgba(94, 82, 65, .62);
  color: #d0c8b8;
  line-height: 1.25;
  margin: 3px;
  padding: 3px 5px;
  text-align: center;
}
.deck-hook-status.deck-live { color: #56e76a; }
`;

  // src/ui/root.ts
  function createUiRoot(documentRef = document) {
    const existing = documentRef.getElementById("solanascape-deck-root");
    existing?.remove();
    const host = documentRef.createElement("div");
    host.id = "solanascape-deck-root";
    host.setAttribute("data-solanascape-deck", "v1");
    const shadowRoot = host.attachShadow({ mode: "open" });
    const style = documentRef.createElement("style");
    style.textContent = SOLANASCAPE_DECK_STYLES;
    shadowRoot.append(style);
    (documentRef.body ?? documentRef.documentElement).append(host);
    return Object.freeze({ host, shadowRoot, destroy: () => host.remove() });
  }

  // src/main.ts
  function cloneCapabilities(capabilities) {
    return structuredClone(capabilities);
  }
  function menuSettings(settings) {
    return Object.freeze({
      enabled: settings.menuSwapperEnabled,
      playerAttack: settings.menuPlayerAttack,
      npcAttack: settings.menuNpcAttack,
      talkTo: false,
      pickpocket: settings.menuPickpocket,
      bank: false,
      trade: false,
      travel: false,
      take: false,
      shopBuy10: settings.menuShopBuy10,
      petClickThrough: settings.menuPetClickThrough
    });
  }
  function migrateStandaloneMenuSettings(store, storage, hadDeckSettings) {
    if (hadDeckSettings) return;
    try {
      const raw = storage.getItem("solanascape-deck.menu-swapper.settings.v1") ?? storage.getItem("solanalite.menu-swapper.settings.v1");
      if (!raw) return;
      const legacy = JSON.parse(raw);
      const boolean = (key, fallback) => typeof legacy[key] === "boolean" ? legacy[key] : fallback;
      store.update({
        menuSwapperEnabled: boolean("enabled", true),
        menuPlayerAttack: boolean("playerAttack", true),
        menuNpcAttack: boolean("npcAttack", true),
        menuPickpocket: boolean("pickpocket", false),
        menuShopBuy10: boolean("shopBuy10", true),
        menuPetClickThrough: boolean("petClickThrough", true)
      });
    } catch {
    }
  }
  function migrateLegacyDeckSettings(storage) {
    if (storage.getItem("solanascape-deck:settings:v12") !== null) return;
    for (const version of [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]) {
      const key = `settings:v${version}`;
      const legacy = storage.getItem(`solanalite:${key}`);
      if (legacy === null) continue;
      storage.setItem(`solanascape-deck:${key}`, legacy);
      return;
    }
  }
  function bootstrap() {
    const pageWindow = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
    if (pageWindow.SolanascapeDeck) return;
    const ui = createUiRoot();
    const hadDeckSettings = window.localStorage.getItem("solanascape-deck:settings:v12") !== null || window.localStorage.getItem("solanascape-deck:settings:v11") !== null || window.localStorage.getItem("solanascape-deck:settings:v10") !== null || window.localStorage.getItem("solanalite:settings:v12") !== null || window.localStorage.getItem("solanalite:settings:v11") !== null || window.localStorage.getItem("solanalite:settings:v10") !== null || window.localStorage.getItem("solanalite:settings:v9") !== null || window.localStorage.getItem("solanalite:settings:v8") !== null || window.localStorage.getItem("solanalite:settings:v7") !== null;
    migrateLegacyDeckSettings(window.localStorage);
    const settings = new SettingsStore(new JsonStorage(window.localStorage));
    migrateStandaloneMenuSettings(settings, window.localStorage, hadDeckSettings);
    const plugins = new PluginManager();
    const attackStyleHud = new AttackStyleHudPlugin();
    const xpTracker = new XpTrackerPlugin();
    const combatHud = new CombatHudPlugin();
    const defensiveStyleGuard = new DefensiveStyleGuardPlugin();
    const hitpointsNotifier = new HitpointsNotifierPlugin();
    const groundItemLabels = new GroundItemLabelsPlugin();
    const prayerNotifier = new PrayerNotifierPlugin();
    const playerNames = new PlayerNamesPlugin();
    const tileOverlay = new TileOverlayPlugin();
    plugins.register(attackStyleHud);
    plugins.register(combatHud);
    plugins.register(defensiveStyleGuard);
    plugins.register(hitpointsNotifier);
    plugins.register(groundItemLabels);
    plugins.register(playerNames);
    plugins.register(prayerNotifier);
    plugins.register(tileOverlay);
    plugins.register(xpTracker);
    const observer = new ClientObserver(pageWindow, () => {
      const slices = new Set(plugins.requiredSlices());
      const currentSettings = settings.get();
      if (currentSettings.showClueLocator) slices.add("chat");
      return slices;
    });
    plugins.mount({
      shadowRoot: ui.shadowRoot,
      settings,
      getClient: () => pageWindow.gameClient,
      getHoveredTile: () => observer.getAdapter()?.readProjectedTiles()[0] ?? null,
      getDestinationTile: () => observer.getAdapter()?.readProjectedDestinationTile() ?? null,
      getPlayers: () => observer.getAdapter()?.readPlayers() ?? Object.freeze([]),
      projectGroundItems: (items) => observer.getAdapter()?.projectGroundItems(items) ?? Object.freeze([]),
      projectPlayers: (players) => observer.getAdapter()?.projectPlayers(players) ?? Object.freeze([]),
      getMappingReport: () => createMappingReport(pageWindow.gameClient, observer.getAdapter())
    });
    const deckSettings = createDeckSettingsUi({
      shadowRoot: ui.shadowRoot,
      settings,
      getCapabilities: () => observer.getCapabilities(),
      getSnapshot: () => observer.getSnapshot(),
      getMappingReport: () => createMappingReport(pageWindow.gameClient, observer.getAdapter()),
      resetXpSession: () => xpTracker.resetSession()
    });
    const installMenu = () => {
      deckSettings.setMenuStatus(installMenuSwapper(pageWindow.gameClient, () => menuSettings(settings.get())));
    };
    installMenu();
    observer.subscribe((update) => {
      if (update.clientChanged) installMenu();
      plugins.update(update);
    });
    const facade = Object.freeze({
      version: "2.2.0",
      getCapabilities: () => cloneCapabilities(observer.getCapabilities()),
      getMappingReport: () => cloneReport(createMappingReport(pageWindow.gameClient, observer.getAdapter())),
      resetXpSession: () => xpTracker.resetSession()
    });
    Object.defineProperty(pageWindow, "SolanascapeDeck", {
      configurable: true,
      enumerable: false,
      value: facade,
      writable: false
    });
    observer.start();
  }
  if (document.documentElement) {
    bootstrap();
  } else {
    window.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  }
})();
