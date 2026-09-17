/* Static game data: stations, products, upgrades, tuning constants. */
(function (FAB) {
  'use strict';

  FAB.TUNE = {
    startMoney: 900,
    startRep: 50,
    dayLength: 50,          // real seconds per in-game day
    baseOverhead: 180,      // rent + consumables, billed nightly
    overheadGrowth: 0.06,   // the landlord does not stay still
    wagePerOperator: 110,
    powerPerMachineLevel: 45,
    tapWork: 4,             // work units for a mistimed tap
    goodWork: 9,
    perfectWork: 16,
    tapLock: 0.09,          // seconds between scored taps on one machine
    zoneWidth: 0.17,        // width of the green band, 0..1
    startQuality: 55,
    perfectQuality: 1.6,
    missQuality: -1.2,
    autoQualityPull: 58,    // unattended machines drift toward merely acceptable
    autoQualityRate: 0.08,
    latePenalty: 0.6,       // pay multiplier on a late delivery
    boardSize: 4
  };

  // Each station is one process step. Order here is the order jobs travel in.
  FAB.STATIONS = [
    { key: 'cut',    name: 'Plasma Table',  icon: '⚡', color: '#58c7ff', baseRate: 5.0, unlockLevel: 1, markerSpeed: 0.62 },
    { key: 'bend',   name: 'Press Brake',   icon: '⤵', color: '#ffd166', baseRate: 4.5, unlockLevel: 2, markerSpeed: 0.70 },
    { key: 'weld',   name: 'MIG Bay',       icon: '☀', color: '#ff8a1f', baseRate: 4.0, unlockLevel: 1, markerSpeed: 0.80 },
    { key: 'finish', name: 'Grind & Paint', icon: '✨', color: '#4ade80', baseRate: 6.0, unlockLevel: 3, markerSpeed: 0.90 },
    { key: 'laser',  name: 'Tube Laser',    icon: '◎', color: '#a78bfa', baseRate: 8.0, unlockLevel: 6, markerSpeed: 1.05 },
    { key: 'mill',   name: 'CNC Mill',      icon: '⚙', color: '#2dd4bf', baseRate: 3.2, unlockLevel: 8, markerSpeed: 0.55 },
    { key: 'coat',   name: 'Powder Coat',   icon: '❖', color: '#fb7185', baseRate: 5.5, unlockLevel: 9, markerSpeed: 0.75 }
  ];

  FAB.STATION_BY_KEY = {};
  FAB.STATIONS.forEach(function (s) { FAB.STATION_BY_KEY[s.key] = s; });

  // ops: [stationKey, workUnits]. pay is the base ticket before rep/quality.
  FAB.PRODUCTS = [
    { key: 'bracket',  name: 'Weld Bracket',      level: 1, pay: 230,  days: 2, xp: 14,
      ops: [['cut', 150], ['weld', 200]] },
    { key: 'gusset',   name: 'Gusset Set',        level: 1, pay: 280,  days: 2, xp: 16,
      ops: [['cut', 238], ['weld', 175]] },
    { key: 'plate',    name: 'Base Plate Pack',   level: 2, pay: 400,  days: 2, xp: 20,
      ops: [['cut', 325], ['bend', 225]] },
    { key: 'handrail', name: 'Handrail Section',  level: 3, pay: 700,  days: 3, xp: 26,
      ops: [['cut', 300], ['bend', 275], ['weld', 375], ['finish', 200]] },
    { key: 'frame',    name: 'Machine Base',      level: 4, pay: 1020, days: 3, xp: 34,
      ops: [['cut', 500], ['weld', 650], ['finish', 300]] },
    { key: 'stringer', name: 'Stair Stringers',   level: 5, pay: 1550, days: 4, xp: 46,
      ops: [['cut', 650], ['bend', 475], ['weld', 525], ['finish', 350]] },
    { key: 'chassis',  name: 'Trailer Chassis',   level: 6, pay: 2700, days: 5, xp: 70,
      ops: [['cut', 850], ['bend', 550], ['weld', 1075], ['finish', 550]] },
    { key: 'hopper',   name: 'Conveyor Hopper',   level: 7, pay: 3400, days: 5, xp: 88,
      ops: [['cut', 750], ['bend', 975], ['weld', 825], ['finish', 675]] },
    { key: 'tuberack', name: 'Tube Frame Rack',   level: 6, pay: 2900, days: 4, xp: 100,
      ops: [['laser', 520], ['bend', 360], ['weld', 420]] },
    { key: 'fixture',  name: 'Fixture Plate',     level: 8, pay: 4200, days: 4, xp: 145,
      ops: [['cut', 320], ['mill', 760], ['finish', 280]] },
    { key: 'manifold', name: 'Manifold Block',    level: 9, pay: 5000, days: 4, xp: 175,
      ops: [['mill', 980], ['finish', 320]] },
    { key: 'skid',     name: 'Skid Base',         level: 9, pay: 7200, days: 5, xp: 230,
      ops: [['laser', 640], ['bend', 420], ['weld', 760], ['coat', 480]] },
    { key: 'mezz',     name: 'Mezzanine Kit',     level: 11, pay: 10500, days: 6, xp: 300,
      ops: [['laser', 940], ['bend', 720], ['weld', 980], ['coat', 640]] },
    { key: 'robocell', name: 'Robot Cell',        level: 12, pay: 15000, days: 6, xp: 400,
      ops: [['laser', 1050], ['mill', 880], ['bend', 640], ['weld', 980], ['coat', 760]] }
  ];

  FAB.PRODUCT_BY_KEY = {};
  FAB.PRODUCTS.forEach(function (p) { FAB.PRODUCT_BY_KEY[p.key] = p; });

  // Shop-wide upgrades. cost() and effect are read by game.js.
  FAB.SHOP_UPGRADES = [
    {
      key: 'rack',
      name: 'Steel Rack',
      desc: 'Hold one more job on the floor at a time.',
      max: 6,
      cost: function (n) { return Math.round(600 * Math.pow(1.85, n)); },
      apply: function (g) { g.wipMax += 1; }
    },
    {
      key: 'coffee',
      name: 'Coffee Pot',
      desc: '+20% work from every tap.',
      max: 5,
      cost: function (n) { return Math.round(450 * Math.pow(2.0, n)); },
      apply: function (g) { g.tapMult += 0.2; }
    },
    {
      key: 'marketing',
      name: 'Shop Sign',
      desc: '+12% on every ticket you invoice.',
      max: 5,
      cost: function (n) { return Math.round(800 * Math.pow(2.1, n)); },
      apply: function (g) { g.payMult += 0.12; }
    },
    {
      key: 'jigs',
      name: 'Weld Jigs',
      desc: 'Jobs start at higher quality.',
      max: 4,
      cost: function (n) { return Math.round(700 * Math.pow(2.0, n)); },
      apply: function (g) { g.qualityBonus += 6; }
    }
  ];

  // XP needed to reach the next shop level.
  FAB.xpForLevel = function (level) {
    // Steep early so unlocks feel earned, flatter later so the heavy work
    // tiers are reachable inside a single run.
    var growth = level <= 5 ? 1.7 : 1.48;
    return Math.round(110 * Math.pow(1.7, Math.min(level, 5) - 1) *
                      Math.pow(growth, Math.max(0, level - 5)));
  };

  /* ---- Prestige: sell up and open a bigger shop ----
     Blueprints are the permanent currency. They carry a passive pay bonus and
     buy perks that persist across relocations. */
  FAB.PRESTIGE = {
    currency: 'Blueprints',
    minLevel: 9,              // every station is unlocked by here
    scale: 12000,             // earnings per blueprint, before the square root
    passivePayPerBlueprint: 0.02
  };

  // Blueprints earned by relocating right now, from this run's takings.
  FAB.blueprintsFor = function (runEarned) {
    return Math.floor(Math.sqrt(Math.max(0, runEarned) / FAB.PRESTIGE.scale));
  };

  /* Permanent perks. apply() runs once per level when a new run is set up,
     so effects stack naturally with the level count. */
  FAB.PERKS = [
    {
      key: 'capital',
      name: 'Seed Capital',
      desc: 'Open each new shop with more cash in the account.',
      max: 5,
      cost: function (n) { return [1, 2, 4, 7, 11][n]; },
      detail: function (n) { return '+' + (2000 * n).toLocaleString('en-US') + ' starting cash'; },
      apply: function (g) { g.money += 2000; }
    },
    {
      key: 'tooling',
      name: 'Tooling Library',
      desc: 'Every machine starts a level higher.',
      max: 3,
      cost: function (n) { return [2, 4, 7][n]; },
      detail: function (n) { return 'machines start at level ' + (1 + n); },
      apply: function (g) { g.stations.forEach(function (st) { st.level += 1; }); }
    },
    {
      key: 'union',
      name: 'Union Hall',
      desc: 'Hired operators work faster.',
      max: 5,
      cost: function (n) { return [2, 4, 7, 11, 16][n]; },
      detail: function (n) { return '+' + (20 * n) + '% operator speed'; },
      apply: function (g) { g.operatorMult += 0.20; }
    },
    {
      key: 'master',
      name: 'Master Fabricator',
      desc: 'Unattended machines hold a higher standard.',
      max: 4,
      cost: function (n) { return [3, 6, 10, 15][n]; },
      detail: function (n) { return 'auto quality floor ' + (58 + 6 * n); },
      apply: function (g) { g.autoQualityPull += 6; }
    },
    {
      key: 'standing',
      name: 'Standing Orders',
      desc: 'Every ticket on the board is worth more.',
      max: 5,
      cost: function (n) { return [2, 4, 7, 11, 16][n]; },
      detail: function (n) { return '+' + (8 * n) + '% ticket pay'; },
      apply: function (g) { g.payMult += 0.08; }
    },
    {
      key: 'school',
      name: 'Trade School',
      desc: 'Your crew learns faster, so the shop levels faster.',
      max: 4,
      cost: function (n) { return [2, 5, 9, 14][n]; },
      detail: function (n) { return '+' + (20 * n) + '% XP'; },
      apply: function (g) { g.xpMult += 0.20; }
    },
    {
      key: 'lean',
      name: 'Lean Layout',
      desc: 'Room for another job on the floor from day one.',
      max: 3,
      cost: function (n) { return [3, 7, 12][n]; },
      detail: function (n) { return '+' + n + ' rack slots'; },
      apply: function (g) { g.wipMax += 1; }
    },
    {
      key: 'records',
      name: 'Shop Records',
      desc: 'Your track record opens the next shop further up the ladder.',
      max: 4,
      cost: function (n) { return [3, 6, 11, 18][n]; },
      detail: function (n) { return 'new shops start at level ' + (1 + n); },
      apply: function (g) { g.level += 1; }
    },
    {
      key: 'ledger',
      name: 'Reputation Ledger',
      desc: 'Your name travels with you to the new shop.',
      max: 3,
      cost: function (n) { return [2, 5, 9][n]; },
      detail: function (n) { return '+' + (8 * n) + ' starting reputation'; },
      apply: function (g) { g.rep += 8; }
    }
  ];

  FAB.PERK_BY_KEY = {};
  FAB.PERKS.forEach(function (p) { FAB.PERK_BY_KEY[p.key] = p; });

  FAB.machineCost = function (level) {
    return Math.round(520 * Math.pow(1.8, level - 1));
  };

  FAB.operatorCost = function (count) {
    return Math.round(900 * Math.pow(2.15, count));
  };

})(window.FAB = window.FAB || {});
