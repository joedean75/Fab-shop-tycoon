/* Simulation core. Holds all state, advances time, resolves taps.
   The UI layer never mutates state directly - it calls these functions and
   drains FAB.events for anything worth animating. */
(function (FAB) {
  'use strict';

  var T = FAB.TUNE;
  var SAVE_KEY = 'fabshop.save.v1';
  var uid = 0;

  FAB.events = [];

  function emit(type, payload) {
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

  FAB.newGame = function () {
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
      stations: FAB.STATIONS.map(makeStation),
      jobs: [],
      board: [],
      upgrades: {},
      ledger: { revenue: 0, jobs: 0, late: 0 },
      stats: { completed: 0, late: 0, earned: 0, bestDay: 0 }
    };
    FAB.game = g;
    restockBoard();
    return g;
  };

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
    g.xp += amount;
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

      if (st.operators > 0) {
        var rate = st.operators * def.baseRate * FAB.rateMult(st);
        var count = FAB.slotCount(st);
        for (var s = 0; s < count; s++) {
          var id = st.slots[s];
          if (!id) continue;
          var job = jobByUid(id);
          if (!job) { st.slots[s] = null; continue; }
          job.progress += rate * dt;
          job.quality += (T.autoQualityPull - job.quality) * T.autoQualityRate * dt;
          if (job.progress >= currentOp(job)[1]) advanceJob(job);
        }
      }
    }
  };

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

  /* ---------- persistence ---------- */

  FAB.save = function () {
    try {
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

  FAB.reset = function () {
    try { localStorage.removeItem(SAVE_KEY); } catch (err) { /* ignore */ }
    FAB.newGame();
    emit('dirty');
  };

})(window.FAB = window.FAB || {});
