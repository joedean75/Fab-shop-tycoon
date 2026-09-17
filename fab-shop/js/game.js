/* Simulation core. Holds all state, advances time, resolves taps.
   The UI layer never mutates state directly - it calls these functions and
   drains FAB.events for anything worth animating. */
(function (FAB) {
  'use strict';

  var T = FAB.TUNE;
  var SAVE_KEY = 'fabshop.save.v1';
  var uid = 0;

  FAB.events = [];

  var silent = false;      // set while simulating time the player did not watch
  var opsAdvanced = 0;     // operations finished during that simulation

  function emit(type, payload) {
    if (silent && (type === 'toast' || type === 'money')) return;
    payload = payload || {};
    payload.type = type;
    FAB.events.push(payload);
  }

  function rand(min, max) { return min + Math.random() * (max - min); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* ---------- construction ---------- */

  function makeStation(def) {
    return {
      key: def.key,
      level: 1,
      operators: 0,
      slots: [null],
      marker: Math.random(),
      dir: 1,
      zone: rand(0.1, 0.9 - T.zoneWidth),
      lock: 0
    };
  }

  /* A run is everything a relocation wipes. Meta is what survives it:
     blueprints, the perks they bought, and lifetime records. */
  function startRun(meta) {
    meta = meta || {};
    var g = {
      money: T.startMoney,
      day: 1,
      dayTime: 0,
      rep: T.startRep,
      level: 1,
      xp: 0,
      wipMax: 3,
      tapMult: 1,
      payMult: 1,
      qualityBonus: 0,
      operatorMult: 1,
      xpMult: 1,
      autoQualityPull: T.autoQualityPull,
      stations: FAB.STATIONS.map(makeStation),
      jobs: [],
      board: [],
      upgrades: {},
      ledger: { revenue: 0, jobs: 0, late: 0 },
      runEarned: 0,
      // --- meta ---
      blueprints: meta.blueprints || 0,
      blueprintsTotal: meta.blueprintsTotal || 0,
      perks: meta.perks || {},
      runs: meta.runs || 0,
      stats: meta.stats || { completed: 0, late: 0, earned: 0, bestDay: 0, bestRun: 0 }
    };
    FAB.game = g;
    applyPerks(g);
    restockBoard();
    return g;
  }

  /* Perks are written as a single level's worth of effect, applied once per
     level owned - so buying one mid-run and rebuilding a run both go through
     the same code path. */
  function applyPerk(g, key, times) {
    var def = FAB.PERK_BY_KEY[key];
    if (!def) return;
    for (var i = 0; i < times; i++) def.apply(g);
  }

  function applyPerks(g) {
    Object.keys(g.perks || {}).forEach(function (key) {
      applyPerk(g, key, g.perks[key]);
    });
    // Passive bonus rides on blueprints ever earned, so spending them on
    // perks never makes you worse off.
    g.payMult += g.blueprintsTotal * FAB.PRESTIGE.passivePayPerBlueprint;
  }

  FAB.newGame = function () { return startRun(null); };
  FAB.startRun = startRun;

  /* ---------- lookups ---------- */

  function station(key) {
    var list = FAB.game.stations;
    for (var i = 0; i < list.length; i++) { if (list[i].key === key) return list[i]; }
    return null;
  }
  FAB.station = station;

  FAB.stationDef = function (key) { return FAB.STATION_BY_KEY[key]; };

  FAB.isStationUnlocked = function (key) {
    return FAB.game.level >= FAB.STATION_BY_KEY[key].unlockLevel;
  };

  FAB.slotCount = function (st) { return 1 + Math.floor((st.level - 1) / 2); };
  FAB.rateMult = function (st) { return 1 + 0.35 * (st.level - 1); };     // operator output
  FAB.tapMultFor = function (st) { return 1 + 0.2 * (st.level - 1); };    // hand work
  FAB.repMult = function () { return 0.85 + FAB.game.rep / 100 * 0.3; };
  FAB.activeJobCount = function () { return FAB.game.jobs.length; };
  FAB.xpNeeded = function () { return FAB.xpForLevel(FAB.game.level); };

  /* ---------- order board ---------- */

  function availableProducts() {
    return FAB.PRODUCTS.filter(function (p) {
      if (p.level > FAB.game.level) return false;
      // Never post work the shop physically cannot route yet.
      return p.ops.every(function (op) { return FAB.isStationUnlocked(op[0]); });
    });
  }

  function makeOffer() {
    var pool = availableProducts();
    // Weight toward the newest unlocked work so the board keeps moving up.
    var product = Math.random() < 0.6 && pool.length > 2
      ? pool[Math.floor(rand(pool.length / 2, pool.length))]
      : pick(pool);
    var rush = Math.random() < 0.22;
    var pay = product.pay * rand(0.9, 1.15) * FAB.repMult() * FAB.game.payMult;
    if (rush) pay *= 1.45;
    return {
      uid: 'o' + (++uid),
      product: product.key,
      pay: Math.round(pay / 5) * 5,
      due: FAB.game.day + (rush ? Math.max(1, product.days - 1) : product.days),
      rush: rush
    };
  }

  function restockBoard() {
    var size = T.boardSize + (FAB.game.rep >= 70 ? 1 : 0);
    FAB.game.board = [];
    for (var i = 0; i < size; i++) FAB.game.board.push(makeOffer());
  }
  FAB.restockBoard = restockBoard;

  FAB.acceptOrder = function (offerUid) {
    var g = FAB.game;
    if (g.jobs.length >= g.wipMax) {
      emit('toast', { text: 'Floor is full - ship something first.', tone: 'bad' });
      return false;
    }
    var idx = g.board.findIndex(function (o) { return o.uid === offerUid; });
    if (idx < 0) return false;
    var offer = g.board.splice(idx, 1)[0];
    var product = FAB.PRODUCT_BY_KEY[offer.product];
    g.jobs.push({
      uid: 'j' + (++uid),
      product: product.key,
      pay: offer.pay,
      due: offer.due,
      rush: offer.rush,
      opIndex: 0,
      progress: 0,
      quality: clamp(T.startQuality + g.qualityBonus, 0, 100),
      at: null   // station key while being worked, null while racked
    });
    emit('toast', { text: 'Took on ' + product.name + '.' });
    emit('dirty');
    return true;
  };

  /* ---------- job helpers ---------- */

  function currentOp(job) {
    return FAB.PRODUCT_BY_KEY[job.product].ops[job.opIndex];
  }

  FAB.currentOp = currentOp;
  FAB.jobProduct = function (job) { return FAB.PRODUCT_BY_KEY[job.product]; };

  function freeSlotIndex(st) {
    var count = FAB.slotCount(st);
    for (var i = 0; i < count; i++) {
      if (!st.slots[i]) return i;
    }
    return -1;
  }

  // Pull racked jobs onto any machine that has room for them.
  function routeJobs() {
    var g = FAB.game;
    for (var i = 0; i < g.jobs.length; i++) {
      var job = g.jobs[i];
      if (job.at) continue;
      var st = station(currentOp(job)[0]);
      if (!st || !FAB.isStationUnlocked(st.key)) continue;
      var slot = freeSlotIndex(st);
      if (slot < 0) continue;
      st.slots[slot] = job.uid;
      job.at = st.key;
      job.progress = 0;
    }
  }

  function jobByUid(id) {
    var list = FAB.game.jobs;
    for (var i = 0; i < list.length; i++) { if (list[i].uid === id) return list[i]; }
    return null;
  }
  FAB.jobByUid = jobByUid;

  function clearSlot(st, job) {
    for (var i = 0; i < st.slots.length; i++) {
      if (st.slots[i] === job.uid) st.slots[i] = null;
    }
  }

  function advanceJob(job) {
    if (silent) opsAdvanced += 1;
    var st = station(job.at);
    clearSlot(st, job);
    job.at = null;
    job.progress = 0;
    job.opIndex += 1;
    if (job.opIndex >= FAB.jobProduct(job).ops.length) {
      shipJob(job);
    } else {
      emit('toast', { text: FAB.jobProduct(job).name + ' -> ' + FAB.STATION_BY_KEY[currentOp(job)[0]].name });
    }
  }

  function shipJob(job) {
    var g = FAB.game;
    var product = FAB.jobProduct(job);
    var late = g.day > job.due;
    var qualityMult = 0.8 + job.quality / 100 * 0.45;
    var payout = Math.round(job.pay * qualityMult * (late ? T.latePenalty : 1));

    g.money += payout;
    g.ledger.revenue += payout;
    g.ledger.jobs += 1;
    g.stats.completed += 1;
    g.stats.earned += payout;
    g.runEarned += payout;
    if (g.runEarned > g.stats.bestRun) g.stats.bestRun = g.runEarned;

    if (late) {
      g.ledger.late += 1;
      g.stats.late += 1;
      g.rep = clamp(g.rep - 5, 0, 100);
    } else if (job.quality >= 88) {
      g.rep = clamp(g.rep + 1, 0, 100);
    } else if (job.quality >= 74) {
      g.rep = clamp(g.rep + 0.5, 0, 100);
    } else if (job.quality < 50) {
      g.rep = clamp(g.rep - 2, 0, 100);
    }

    addXp(Math.round(product.xp * (job.quality >= 88 ? 1.25 : 1)));

    g.jobs = g.jobs.filter(function (j) { return j.uid !== job.uid; });
    emit('money', { amount: payout });
    emit('toast', {
      text: (late ? 'LATE: ' : 'Shipped ') + product.name + ' +$' + payout +
            ' (Q' + Math.round(job.quality) + ')',
      tone: late ? 'bad' : 'good'
    });
    emit('dirty');
  }

  function addXp(amount) {
    var g = FAB.game;
    g.xp += Math.round(amount * g.xpMult);
    while (g.xp >= FAB.xpForLevel(g.level)) {
      g.xp -= FAB.xpForLevel(g.level);
      g.level += 1;
      emit('toast', { text: 'Shop level ' + g.level + '! New work on the board.', tone: 'good' });
      FAB.STATIONS.forEach(function (def) {
        if (def.unlockLevel === g.level) {
          emit('toast', { text: def.name + ' unlocked.', tone: 'good' });
        }
      });
      restockBoard();
      emit('dirty');
    }
  }

  /* ---------- the tap ---------- */

  FAB.tapStation = function (key) {
    var st = station(key);
    if (!st || st.lock > 0) return null;

    var job = null;
    for (var i = 0; i < st.slots.length && !job; i++) {
      if (st.slots[i]) job = jobByUid(st.slots[i]);
    }
    if (!job) return null;

    var g = FAB.game;
    var inner = Math.abs(st.marker - (st.zone + T.zoneWidth / 2));
    var half = T.zoneWidth / 2;
    var result, work;

    if (inner <= half) {
      result = 'perfect';
      work = T.perfectWork;
      job.quality = clamp(job.quality + T.perfectQuality, 0, 100);
    } else if (inner <= half * 2.2) {
      result = 'good';
      work = T.goodWork;
    } else {
      result = 'miss';
      work = T.tapWork;
      job.quality = clamp(job.quality + T.missQuality, 0, 100);
    }

    work *= g.tapMult * FAB.tapMultFor(st);
    job.progress += work;
    st.lock = T.tapLock;
    st.zone = rand(0.06, 0.94 - T.zoneWidth);

    if (job.progress >= currentOp(job)[1]) advanceJob(job);
    return { result: result, work: Math.round(work), station: key };
  };

  /* ---------- day cycle ---------- */

  function closeDay() {
    var g = FAB.game;
    var wages = 0;
    var power = 0;
    g.stations.forEach(function (st) {
      wages += st.operators * T.wagePerOperator;
      power += (st.level - 1) * T.powerPerMachineLevel;
    });
    var rent = T.baseOverhead * (1 + T.overheadGrowth * (g.day - 1)) + (g.wipMax - 3) * 60;
    var overhead = Math.round(rent + wages + power);
    g.money -= overhead;

    var report = {
      day: g.day,
      revenue: g.ledger.revenue,
      jobs: g.ledger.jobs,
      late: g.ledger.late,
      overhead: overhead,
      net: g.ledger.revenue - overhead,
      cash: Math.round(g.money)
    };
    if (report.net > g.stats.bestDay) g.stats.bestDay = report.net;

    // Racked work that blew its deadline still costs you standing.
    g.jobs.forEach(function (job) {
      if (g.day > job.due) g.rep = clamp(g.rep - 1, 0, 100);
    });

    g.day += 1;
    g.dayTime = 0;
    g.ledger = { revenue: 0, jobs: 0, late: 0 };
    restockBoard();

    if (g.money < 0) {
      // No bankruptcy wipe - an emergency loan keeps the shop open, at a cost.
      g.money = 250;
      g.rep = clamp(g.rep - 5, 0, 100);
      report.bailout = true;
    }

    emit('dayEnd', { report: report });
    emit('dirty');
    FAB.save();
  }

  /* ---------- main tick ---------- */

  FAB.tick = function (dt) {
    var g = FAB.game;
    if (!g) return;

    g.dayTime += dt;
    if (g.dayTime >= T.dayLength) closeDay();

    routeJobs();

    for (var i = 0; i < g.stations.length; i++) {
      var st = g.stations[i];
      var def = FAB.STATION_BY_KEY[st.key];

      if (st.lock > 0) st.lock -= dt;

      // Marker ping-pongs across the band; faster machines are harder to time.
      var busy = st.slots.some(function (s) { return !!s; });
      if (busy) {
        st.marker += st.dir * def.markerSpeed * dt;
        if (st.marker > 1) { st.marker = 1; st.dir = -1; }
        if (st.marker < 0) { st.marker = 0; st.dir = 1; }
      }

    }

    runMachines(dt, 1);
  };

  /* Operator output for one slice of time. rateScale lets the night shift run
     at reduced efficiency through exactly the same code as live play. */
  function runMachines(dt, rateScale) {
    var g = FAB.game;
    for (var i = 0; i < g.stations.length; i++) {
      var st = g.stations[i];
      if (st.operators <= 0) continue;
      var def = FAB.STATION_BY_KEY[st.key];
      var rate = st.operators * def.baseRate * FAB.rateMult(st) * g.operatorMult * rateScale;
      var count = FAB.slotCount(st);
      for (var s = 0; s < count; s++) {
        var id = st.slots[s];
        if (!id) continue;
        var job = jobByUid(id);
        if (!job) { st.slots[s] = null; continue; }
        job.progress += rate * dt;
        job.quality += (g.autoQualityPull - job.quality) * T.autoQualityRate * dt;
        if (job.progress >= currentOp(job)[1]) advanceJob(job);
      }
    }
  }

  /* ---------- purchases ---------- */

  function spend(amount) {
    if (FAB.game.money < amount) {
      emit('toast', { text: 'Not enough cash.', tone: 'bad' });
      return false;
    }
    FAB.game.money -= amount;
    return true;
  }

  FAB.buyMachineLevel = function (key) {
    var st = station(key);
    if (!st || !FAB.isStationUnlocked(key)) return false;
    var cost = FAB.machineCost(st.level);
    if (!spend(cost)) return false;
    st.level += 1;
    st.slots.length = FAB.slotCount(st);
    for (var i = 0; i < st.slots.length; i++) {
      if (st.slots[i] === undefined) st.slots[i] = null;
    }
    emit('toast', { text: FAB.STATION_BY_KEY[key].name + ' is now level ' + st.level + '.', tone: 'good' });
    emit('dirty');
    FAB.save();
    return true;
  };

  FAB.hireOperator = function (key) {
    var st = station(key);
    if (!st || !FAB.isStationUnlocked(key)) return false;
    if (st.operators >= FAB.slotCount(st)) {
      emit('toast', { text: 'No bay for another hand - upgrade the machine.', tone: 'bad' });
      return false;
    }
    var cost = FAB.operatorCost(st.operators);
    if (!spend(cost)) return false;
    st.operators += 1;
    emit('toast', { text: 'Hired an operator for the ' + FAB.STATION_BY_KEY[key].name + '.', tone: 'good' });
    emit('dirty');
    FAB.save();
    return true;
  };

  FAB.buyShopUpgrade = function (key) {
    var g = FAB.game;
    var def = FAB.SHOP_UPGRADES.filter(function (u) { return u.key === key; })[0];
    if (!def) return false;
    var owned = g.upgrades[key] || 0;
    if (owned >= def.max) return false;
    if (!spend(def.cost(owned))) return false;
    g.upgrades[key] = owned + 1;
    def.apply(g);
    emit('toast', { text: def.name + ' installed.', tone: 'good' });
    emit('dirty');
    FAB.save();
    return true;
  };

  /* ---------- the night shift ----------
     Time the player spent away. Only staffed machines produce - nobody is in
     the shop otherwise - and the calendar stays put, so no overhead is billed
     and nothing goes late while they are gone. */

  FAB.runOffline = function (realSeconds) {
    var g = FAB.game;
    if (!g || !(realSeconds > 0)) return null;

    if (realSeconds < T.offlineMinSeconds) return null;

    // Convert absence into machine time, bounded in in-game days.
    var ceiling = T.offlineMaxDays * T.dayLength;
    var machineSeconds = Math.min(realSeconds * T.offlineWorkPerSecond, ceiling);

    var staffed = g.stations.some(function (st) {
      return st.operators > 0 && FAB.isStationUnlocked(st.key);
    });
    var working = g.jobs.length > 0;
    if (!staffed || !working) {
      return {
        away: realSeconds, days: 0, shipped: 0, earned: 0, levels: 0,
        idle: true, reason: !staffed ? 'unstaffed' : 'nowork'
      };
    }

    var before = { completed: g.stats.completed, earned: g.stats.earned, level: g.level };
    var step = 1;   // fine enough to route jobs between machines in the right order

    silent = true;
    opsAdvanced = 0;
    try {
      var remaining = machineSeconds;
      while (remaining > 0) {
        var dt = remaining < step ? remaining : step;
        remaining -= dt;
        routeJobs();
        runMachines(dt, 1);
      }
      routeJobs();
    } finally {
      silent = false;
    }

    var idleFloor = g.jobs.every(function (job) { return !job.at; });
    var summary = {
      away: realSeconds,
      days: machineSeconds / T.dayLength,
      capped: realSeconds * T.offlineWorkPerSecond > ceiling,
      ranDry: idleFloor && g.jobs.length > 0,   // crew ran out of staffed work
      shipped: g.stats.completed - before.completed,
      earned: g.stats.earned - before.earned,
      levels: g.level - before.level,
      ops: opsAdvanced,
      idle: false
    };
    if (!summary.shipped && !summary.ops) {
      summary.idle = true;
      summary.reason = 'toosoon';
    }
    FAB.save();
    return summary;
  };

  /* ---------- prestige ---------- */

  FAB.prestigeGain = function () {
    return FAB.blueprintsFor(FAB.game.runEarned);
  };

  FAB.canPrestige = function () {
    return FAB.game.level >= FAB.PRESTIGE.minLevel && FAB.prestigeGain() >= 1;
  };

  // How much more this run has to take in before the next blueprint lands.
  FAB.nextBlueprintAt = function () {
    var next = FAB.prestigeGain() + 1;
    return Math.ceil(next * next * FAB.PRESTIGE.scale);
  };

  FAB.doPrestige = function () {
    var g = FAB.game;
    if (!FAB.canPrestige()) {
      emit('toast', { text: 'Not enough behind you yet to sell up.', tone: 'bad' });
      return false;
    }
    var gain = FAB.prestigeGain();
    var meta = {
      blueprints: g.blueprints + gain,
      blueprintsTotal: g.blueprintsTotal + gain,
      perks: g.perks,
      runs: g.runs + 1,
      stats: g.stats
    };
    startRun(meta);
    emit('toast', {
      text: 'Sold the shop. +' + gain + ' blueprint' + (gain === 1 ? '' : 's') +
            ' - shop #' + (meta.runs + 1) + ' is open.',
      tone: 'good'
    });
    emit('prestige', { gain: gain });
    emit('dirty');
    FAB.save();
    return true;
  };

  FAB.buyPerk = function (key) {
    var g = FAB.game;
    var def = FAB.PERK_BY_KEY[key];
    if (!def) return false;
    var owned = g.perks[key] || 0;
    if (owned >= def.max) return false;
    var cost = def.cost(owned);
    if (g.blueprints < cost) {
      emit('toast', { text: 'Not enough blueprints.', tone: 'bad' });
      return false;
    }
    g.blueprints -= cost;
    g.perks[key] = owned + 1;
    applyPerk(g, key, 1);   // takes effect on the current shop too
    emit('toast', { text: def.name + ' \u2013 ' + def.detail(owned + 1), tone: 'good' });
    emit('dirty');
    FAB.save();
    return true;
  };

  /* ---------- persistence ---------- */

  FAB.save = function () {
    try {
      FAB.game.lastSeen = Date.now();
      localStorage.setItem(SAVE_KEY, JSON.stringify(FAB.game));
    } catch (err) {
      /* private mode or quota - the game just runs without a save */
    }
  };

  FAB.load = function () {
    var raw;
    try {
      raw = localStorage.getItem(SAVE_KEY);
    } catch (err) {
      return false;
    }
    if (!raw) return false;
    try {
      var saved = JSON.parse(raw);
      if (!saved || !saved.stations) return false;
      FAB.game = saved;
      // Fill in anything a save from an older build is missing.
      FAB.STATIONS.forEach(function (def) {
        if (!station(def.key)) FAB.game.stations.push(makeStation(def));
      });
      FAB.game.stations.forEach(function (st) {
        st.lock = 0;
        if (typeof st.zone !== 'number') st.zone = 0.4;
        if (typeof st.marker !== 'number') st.marker = 0;
        if (typeof st.dir !== 'number') st.dir = 1;
      });
      // Saves from before the prestige update lack these entirely.
      var g = FAB.game;
      var defaults = {
        operatorMult: 1, xpMult: 1, autoQualityPull: T.autoQualityPull,
        runEarned: 0, blueprints: 0, blueprintsTotal: 0, runs: 0
      };
      Object.keys(defaults).forEach(function (k) {
        if (typeof g[k] !== 'number') g[k] = defaults[k];
      });
      if (!g.perks) g.perks = {};
      if (!g.stats) g.stats = { completed: 0, late: 0, earned: 0, bestDay: 0, bestRun: 0 };
      if (typeof g.stats.bestRun !== 'number') g.stats.bestRun = 0;
      // An old save has earnings but no run total; seed it so the first
      // relocation credits work already done.
      if (!g.runEarned && g.stats.earned) g.runEarned = g.stats.earned;
      if (!FAB.game.board || !FAB.game.board.length) restockBoard();
      // Keep uid ahead of everything the save already used.
      FAB.game.jobs.concat(FAB.game.board).forEach(function (o) {
        var n = parseInt(String(o.uid).slice(1), 10);
        if (n > uid) uid = n;
      });
      return true;
    } catch (err) {
      return false;
    }
  };

  // Seconds since the last save. Ignores a clock that moved backwards.
  FAB.secondsAway = function () {
    var last = FAB.game && FAB.game.lastSeen;
    if (!last) return 0;
    var seconds = (Date.now() - last) / 1000;
    return seconds > 0 ? seconds : 0;
  };

  FAB.reset = function () {
    try { localStorage.removeItem(SAVE_KEY); } catch (err) { /* ignore */ }
    FAB.newGame();
    emit('dirty');
  };

})(window.FAB = window.FAB || {});
