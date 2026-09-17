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
    boardSize: 4,

    /* Night shift: the crew keeps working while the app is closed.

       Measured in in-game days, not real hours, because a day here is 50
       seconds - eight real hours of machine time would be some 300 days of
       output and would trivialise the game. An hour away buys about a day and
       a half of operator work, capped at six days, and only where an operator
       is actually stationed.

       The calendar deliberately does NOT advance either: otherwise a night
       away would bill hundreds of days of overhead and blow every deadline,
       punishing absence instead of rewarding it. */
    offlineWorkPerSecond: 0.02,   // machine-seconds earned per real second away
    offlineMaxDays: 6,            // ceiling, in in-game days of machine time
    offlineMinSeconds: 60,

    /* Something turns up at the shop. Fired at day close, never two days
       running, and never before the player has a shop worth disrupting. */
    eventChance: 0.38,
    eventCooldownDays: 2,
    eventMinDay: 3
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

  /* ---- Things that turn up ----
     Each event may carry a context (usually a station), a body of text, and
     up to three choices. A choice may cost money, and is offered greyed out
     when it cannot be afforded. Effects that last are expressed as modifiers
     with a lifetime in days, applied by game.js.

     Costs scale with shop level so a callout fee still stings at level 10. */

  function scaled(g, base) {
    return Math.round(base * (1 + 0.45 * (g.level - 1)) / 5) * 5;
  }

  FAB.EVENTS = [
    {
      key: 'breakdown',
      title: 'Machine down',
      weight: 12,
      when: function (g) { return FAB.runningStations(g).length > 0; },
      context: function (g) { return { station: FAB.pickStation(g, true) }; },
      body: function (g, ctx) {
        return 'The ' + ctx.station.name + ' threw a fault mid-cut and shut itself down. ' +
               'The service company can be here within the hour, at a price.';
      },
      choices: [
        {
          label: 'Pay the callout',
          cost: function (g) { return scaled(g, 380); },
          detail: function () { return 'back running immediately'; },
          apply: function () { /* paying is the whole effect */ }
        },
        {
          label: 'Fix it yourself',
          detail: function () { return 'machine down for 2 days'; },
          apply: function (g, ctx) { FAB.addModifier(g, 'down', 2, { station: ctx.station.key }); }
        }
      ]
    },
    {
      key: 'sick',
      title: 'Short-handed',
      weight: 10,
      when: function (g) { return FAB.staffedStations(g).length > 0; },
      context: function (g) { return { station: FAB.pickStation(g, false, true) }; },
      body: function (g, ctx) {
        return 'One of your hands on the ' + ctx.station.name + ' called in sick. ' +
               'Nothing to be done about it.';
      },
      choices: [
        {
          label: 'Cover the shift yourself',
          detail: function () { return 'one operator down for 2 days'; },
          apply: function (g, ctx) { FAB.addModifier(g, 'short', 2, { station: ctx.station.key }); }
        }
      ]
    },
    {
      key: 'apprentice',
      title: 'Apprentice turns up',
      weight: 9,
      when: function (g) { return g.level >= 3; },
      context: function (g) { return { station: FAB.pickStation(g) }; },
      body: function (g, ctx) {
        return 'A kid from the trade school wants shop hours on the ' + ctx.station.name +
               '. Keen, unpaid, and only here for the week.';
      },
      choices: [
        {
          label: 'Put them on the floor',
          detail: function () { return 'an extra hand for 4 days'; },
          apply: function (g, ctx) { FAB.addModifier(g, 'helper', 4, { station: ctx.station.key }); }
        },
        {
          label: 'Not this week',
          detail: function () { return 'no change'; },
          apply: function () {}
        }
      ]
    },
    {
      key: 'steel',
      title: 'Steel price spike',
      weight: 10,
      body: function () {
        return 'The mill put plate up overnight. Your supplier will hold last month\u2019s ' +
               'price if you buy a skid now.';
      },
      choices: [
        {
          label: 'Stock up now',
          cost: function (g) { return scaled(g, 600); },
          detail: function () { return 'no surcharge'; },
          apply: function () {}
        },
        {
          label: 'Ride it out',
          detail: function () { return 'higher overhead for 3 days'; },
          apply: function (g) { FAB.addModifier(g, 'surcharge', 3, { amount: scaled(g, 260) }); }
        }
      ]
    },
    {
      key: 'walkin',
      title: 'Walk-in job',
      weight: 11,
      body: function (g) {
        return 'Someone reverses a trailer up to the door with a cracked hitch. ' +
               'Twenty minutes of welding, cash in hand.';
      },
      choices: [
        {
          label: 'Take care of it',
          detail: function (g) { return '+' + FAB.money(scaled(g, 320)) + ' and a little goodwill'; },
          apply: function (g) { g.money += scaled(g, 320); g.rep = Math.min(100, g.rep + 1); }
        },
        {
          label: 'Too busy',
          detail: function () { return 'no change'; },
          apply: function () {}
        }
      ]
    },
    {
      key: 'inspector',
      title: 'Inspector calls',
      weight: 8,
      when: function (g) { return g.level >= 4; },
      body: function (g) {
        return 'A client\u2019s inspector wants to see the shop and pull a few of your ' +
               'finished parts at random.';
      },
      choices: [
        {
          label: 'Show them around',
          detail: function (g) {
            return g.rep >= 70 ? 'your work speaks for itself' : 'your recent work is uneven';
          },
          apply: function (g) {
            if (g.rep >= 70) g.rep = Math.min(100, g.rep + 4);
            else g.rep = Math.max(0, g.rep - 3);
          }
        }
      ]
    },
    {
      key: 'scrap',
      title: 'Scrap merchant',
      weight: 10,
      body: function () {
        return 'The scrap lorry is in the yard. The offcut bins have been filling up ' +
               'for weeks.';
      },
      choices: [
        {
          label: 'Weigh it in',
          detail: function (g) { return '+' + FAB.money(scaled(g, 210)); },
          apply: function (g) { g.money += scaled(g, 210); }
        }
      ]
    },
    {
      key: 'referral',
      title: 'Word gets around',
      weight: 8,
      when: function (g) { return g.rep >= 55; },
      body: function () {
        return 'A customer you did right by has been talking about the shop to ' +
               'somebody with money to spend.';
      },
      choices: [
        {
          label: 'Good news',
          detail: function () { return '+3 reputation'; },
          apply: function (g) { g.rep = Math.min(100, g.rep + 3); }
        }
      ]
    },
    {
      key: 'auction',
      title: 'Tooling auction',
      weight: 8,
      when: function (g) { return g.level >= 5 && FAB.runningStations(g).length > 0; },
      context: function (g) { return { station: FAB.pickStation(g) }; },
      body: function (g, ctx) {
        return 'A shop two towns over is closing down. Their ' + ctx.station.name +
               ' tooling is going cheap, and it would fit yours.';
      },
      choices: [
        {
          label: 'Bid on it',
          cost: function (g) { return scaled(g, 900); },
          detail: function (ctx) { return 'that machine gains a level'; },
          apply: function (g, ctx) {
            var st = FAB.station(ctx.station.key);
            if (st) {
              st.level += 1;
              st.slots.length = FAB.slotCount(st);
              for (var i = 0; i < st.slots.length; i++) {
                if (st.slots[i] === undefined) st.slots[i] = null;
              }
            }
          }
        },
        {
          label: 'Let it go',
          detail: function () { return 'no change'; },
          apply: function () {}
        }
      ]
    },
    {
      key: 'hotjob',
      title: 'A favour asked',
      weight: 10,
      when: function (g) { return FAB.availableProducts(g).length > 0; },
      context: function (g) {
        var pool = FAB.availableProducts(g);
        return { product: pool[Math.floor(Math.random() * pool.length)] };
      },
      body: function (g, ctx) {
        return 'A regular needs a ' + ctx.product.name.toLowerCase() +
               ' faster than anyone sensible would promise. They will pay for it.';
      },
      choices: [
        {
          label: 'Say yes',
          detail: function (g) {
            return g.jobs.length < g.wipMax
              ? 'straight onto the floor, tight deadline'
              : 'floor is full - it goes top of the board';
          },
          apply: function (g, ctx) { FAB.addRushJob(g, ctx.product); }
        },
        {
          label: 'Turn it down',
          detail: function () { return 'no change'; },
          apply: function () {}
        }
      ]
    }
  ];

  FAB.EVENT_BY_KEY = {};
  FAB.EVENTS.forEach(function (e) { FAB.EVENT_BY_KEY[e.key] = e; });

  FAB.PERK_BY_KEY = {};
  FAB.PERKS.forEach(function (p) { FAB.PERK_BY_KEY[p.key] = p; });

  FAB.machineCost = function (level) {
    return Math.round(520 * Math.pow(1.8, level - 1));
  };

  FAB.operatorCost = function (count) {
    return Math.round(900 * Math.pow(2.15, count));
  };

})(window.FAB = window.FAB || {});
