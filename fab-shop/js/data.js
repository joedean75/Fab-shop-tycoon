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
    { key: 'finish', name: 'Grind & Paint', icon: '✨', color: '#4ade80', baseRate: 6.0, unlockLevel: 3, markerSpeed: 0.90 }
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
      ops: [['cut', 750], ['bend', 975], ['weld', 825], ['finish', 675]] }
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
    return Math.round(110 * Math.pow(1.7, level - 1));
  };

  FAB.machineCost = function (level) {
    return Math.round(520 * Math.pow(1.8, level - 1));
  };

  FAB.operatorCost = function (count) {
    return Math.round(900 * Math.pow(2.15, count));
  };

})(window.FAB = window.FAB || {});
