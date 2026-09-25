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
      boardBonus: 0,
      offerTimer: 0,
      autoQualityPull: T.autoQualityPull,
      stations: FAB.STATIONS.map(makeStation),
      jobs: [],
      board: [],
      upgrades: {},
      ledger: { revenue: 0, jobs: 0, late: 0 },
      autoRoute: true,
      modifiers: [],
      pendingEvent: null,
      lastEventDay: 0,
      runEarned: 0,
      // --- meta ---
      blueprints: meta.blueprints || 0,
      blueprintsTotal: meta.blueprintsTotal || 0,
      perks: meta.perks || {},
      runs: meta.runs || 0,
      stats: meta.stats || { completed: 0, late: 0, earned: 0, bestDay: 0, bestRun: 0 }
    };
    FAB.game = g;
    /* A hand on every machine the shop opens with. One operator was not
       enough to be worth anything: every product needs at least two stations,
       so a job would finish its first operation and then park forever on an
       unstaffed machine. A shop that cannot complete a single job unaided has
       no baseline at all, and the tap stops being an accelerator and becomes
       the only engine. */
    g.stations.forEach(function (st) {
      if (FAB.STATION_BY_KEY[st.key].unlockLevel <= 1) st.operators = 1;
    });
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

  FAB.money = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); };

  /* ---------- timed modifiers ----------
     Events leave effects behind that last a few days: a machine down, a spare
     pair of hands, a surcharge on the nightly bill. Each carries the day it
     expires on, and closeDay clears them as the calendar passes. */

  FAB.addModifier = function (g, type, days, extra) {
    var mod = { type: type, until: g.day + days };
    if (extra) {
      Object.keys(extra).forEach(function (k) { mod[k] = extra[k]; });
    }
    if (!g.modifiers) g.modifiers = [];
    g.modifiers.push(mod);
    return mod;
  };

  function mods(type, stationKey) {
    var list = (FAB.game && FAB.game.modifiers) || [];
    return list.filter(function (m) {
      return m.type === type && (stationKey === undefined || m.station === stationKey);
    });
  }
  FAB.mods = mods;

  FAB.stationDown = function (key) { return mods('down', key).length > 0; };

  // Operators actually on the machine today: hired, plus lent hands, minus
  // anyone off sick, and none at all while the machine is down.
  FAB.effectiveOperators = function (st) {
    if (FAB.stationDown(st.key)) return 0;
    var n = st.operators + mods('helper', st.key).length - mods('short', st.key).length;
    return n > 0 ? n : 0;
  };

  FAB.surchargeToday = function () {
    return mods('surcharge').reduce(function (sum, m) { return sum + (m.amount || 0); }, 0);
  };

  /* ---------- lookups ---------- */

  function station(key) {
    var list = FAB.game.stations;
    for (var i = 0; i < list.length; i++) { if (list[i].key === key) return list[i]; }
    return null;
  }
  FAB.station = station;

  FAB.stationDef = function (key) { return FAB.STATION_BY_KEY[key]; };

  FAB.unlockedStations = function (g) {
    return (g || FAB.game).stations.filter(function (st) { return FAB.isStationUnlocked(st.key); });
  };

  FAB.runningStations = function (g) {
    return FAB.unlockedStations(g).filter(function (st) {
      return st.slots.some(Boolean) && !FAB.stationDown(st.key);
    });
  };

  FAB.staffedStations = function (g) {
    return FAB.unlockedStations(g).filter(function (st) {
      return st.operators > 0 && !FAB.stationDown(st.key);
    });
  };

  // Returns a station definition, preferring busy or staffed machines so an
  // event lands somewhere the player will feel it.
  FAB.pickStation = function (g, preferRunning, requireStaffed) {
    var pool = requireStaffed ? FAB.staffedStations(g)
      : (preferRunning ? FAB.runningStations(g) : []);
    if (!pool.length) pool = FAB.unlockedStations(g);
    if (!pool.length) pool = [g.stations[0]];
    var st = pool[Math.floor(Math.random() * pool.length)];
    return FAB.STATION_BY_KEY[st.key];
  };

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

  function availableProducts(g) {
    g = g || FAB.game;
    return FAB.PRODUCTS.filter(function (p) {
      if (p.level > g.level) return false;
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

  FAB.availableProducts = availableProducts;

  /* A favour called in: short deadline, better pay. It goes straight onto the
     floor when there is room, and onto the board when there is not - so the
     event still fires for a player running a full floor, which is most of
     them, without quietly breaking the work-in-progress limit. */
  FAB.addRushJob = function (g, product) {
    var pay = Math.round(product.pay * 1.6 * FAB.repMult() * g.payMult / 5) * 5;
    var due = g.day + Math.max(1, product.days - 1);

    if (g.jobs.length >= g.wipMax) {
      g.board.unshift({
        uid: 'o' + (++uid), product: product.key, pay: pay, due: due, rush: true
      });
      return null;
    }
    var job = {
      uid: 'j' + (++uid),
      product: product.key,
      pay: pay,
      due: due,
      rush: true,
      opIndex: 0,
      progress: 0,
      quality: clamp(T.startQuality + g.qualityBonus, 0, 100),
      at: null
    };
    g.jobs.push(job);
    return job;
  };

  /* How much work the shop can have waiting at once. It grows with the shop,
     because a floor with thirty bays cannot be fed by four offers a day. */
  FAB.boardCapacity = function (g) {
    g = g || FAB.game;
    var size = T.boardSize
      + Math.floor((g.level - 1) * T.boardPerLevel)
      + (g.rep >= T.repBoardBonusAt ? 1 : 0)
      + (g.boardBonus || 0);
    return Math.min(size, T.boardMax);
  };

  // Seconds between walk-up offers; a busier shop hears about work sooner.
  FAB.offerInterval = function (g) {
    g = g || FAB.game;
    return Math.max(T.offerIntervalMin,
      T.offerIntervalBase - (g.level - 1) * T.offerIntervalPerLevel);
  };

  function restockBoard() {
    var g = FAB.game;
    g.board = [];
    var size = FAB.boardCapacity(g);
    for (var i = 0; i < size; i++) g.board.push(makeOffer());
    g.offerTimer = 0;
  }

  /* Work turns up during the day, not just at dawn. Without this the board is
     emptied within seconds of opening and the floor stands idle until morning. */
  function trickleOffers(dt) {
    var g = FAB.game;
    if (g.board.length >= FAB.boardCapacity(g)) return;
    g.offerTimer = (g.offerTimer || 0) + dt;
    var interval = FAB.offerInterval(g);
    while (g.offerTimer >= interval && g.board.length < FAB.boardCapacity(g)) {
      g.offerTimer -= interval;
      g.board.push(makeOffer());
      emit('dirty');
    }
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
    if (g.autoRoute === false) return;     // the player is loading machines themselves
    for (var i = 0; i < g.jobs.length; i++) {
      if (!g.jobs[i].at) placeJob(g.jobs[i]);
    }
  }

  /* Put a job on the machine its current operation needs. Progress is NOT
     reset here - advanceJob already zeroes it when an operation finishes, and
     resetting on load would throw away work every time a job is pulled off a
     machine and put back. */
  function placeJob(job) {
    var st = station(currentOp(job)[0]);
    if (!st || !FAB.isStationUnlocked(st.key) || FAB.stationDown(st.key)) return false;
    var slot = freeSlotIndex(st);
    if (slot < 0) return false;
    st.slots[slot] = job.uid;
    job.at = st.key;
    return true;
  }

  /* Why a job cannot go on right now, for the button that offers it. */
  FAB.loadBlockedReason = function (job) {
    var def = FAB.STATION_BY_KEY[currentOp(job)[0]];
    var st = station(def.key);
    if (!FAB.isStationUnlocked(def.key)) return def.name + ' not unlocked';
    if (FAB.stationDown(def.key)) return def.name + ' is down';
    if (freeSlotIndex(st) < 0) return def.name + ' has no free bay';
    return null;
  };

  FAB.loadJob = function (uid) {
    var job = jobByUid(uid);
    if (!job || job.at) return false;
    if (!placeJob(job)) {
      emit('toast', { text: FAB.loadBlockedReason(job) + '.', tone: 'bad' });
      return false;
    }
    emit('dirty');
    FAB.save();
    return true;
  };

  /* Pull a job back off a machine, keeping the work already done on it, so a
     more urgent job can take the bay. */
  FAB.unloadJob = function (uid) {
    var job = jobByUid(uid);
    if (!job || !job.at) return false;
    var st = station(job.at);
    if (st) {
      for (var i = 0; i < st.slots.length; i++) {
        if (st.slots[i] === uid) st.slots[i] = null;
      }
    }
    job.at = null;
    emit('dirty');
    FAB.save();
    return true;
  };

  FAB.setAutoRoute = function (on) {
    FAB.game.autoRoute = !!on;
    if (on) routeJobs();
    emit('toast', {
      text: on ? 'Machines load themselves again.' : 'You are loading the machines now.'
    });
    emit('dirty');
    FAB.save();
  };

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
    var daysLate = g.day - job.due;
    var late = daysLate > 0;
    /* One day over is an apology; a week over is a lost customer. Grading the
       penalty keeps a slow shop from falling off a cliff on its first slip. */
    var lateMult = late ? Math.max(T.latePenalty, 1 - T.lateStep * daysLate) : 1;
    var qualityMult = 0.8 + job.quality / 100 * 0.45;
    var payout = Math.round(job.pay * qualityMult * lateMult);

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
      g.rep = clamp(g.rep + (daysLate <= 1 ? T.repLateFresh : T.repLate), 0, 100);
    } else if (job.quality >= T.repGreatAt) {
      g.rep = clamp(g.rep + T.repGreat, 0, 100);
    } else if (job.quality >= T.repGoodAt) {
      g.rep = clamp(g.rep + T.repGood, 0, 100);
    } else if (job.quality < T.repPoorAt) {
      g.rep = clamp(g.rep + T.repPoor, 0, 100);
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
        if (def.unlockLevel !== g.level) return;
        /* A new machine arrives with a hand on it. An unstaffed station is a
           dead end - jobs route onto it and sit there - and the player has no
           reason to guess that a brand new machine needs hiring before it
           turns. The wage still comes out every night. */
        var st = FAB.station(def.key);
        if (st && st.operators < 1) st.operators = 1;
        emit('toast', { text: def.name + ' unlocked, with an operator on it.', tone: 'good' });
      });
      restockBoard();
      emit('dirty');
    }
  }

  /* ---------- the tap ---------- */

  FAB.tapStation = function (key) {
    var st = station(key);
    if (!st || st.lock > 0 || FAB.stationDown(key)) return null;

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
    var rent = T.baseOverhead * (1 + T.overheadPerLevel * (g.level - 1)) + (g.wipMax - 3) * 60;
    var surcharge = FAB.surchargeToday();
    var overhead = Math.round(rent + wages + power + surcharge);
    g.money -= overhead;

    var report = {
      day: g.day,
      revenue: g.ledger.revenue,
      jobs: g.ledger.jobs,
      late: g.ledger.late,
      overhead: overhead,
      surcharge: surcharge,
      net: g.ledger.revenue - overhead,
      cash: Math.round(g.money)
    };
    if (report.net > g.stats.bestDay) g.stats.bestDay = report.net;

    // A day's work with nothing late rebuilds standing slowly. Without it a
    // bad stretch left reputation pinned at zero with no way back.
    if (g.ledger.jobs > 0 && g.ledger.late === 0) {
      g.rep = clamp(g.rep + T.repCleanDay, 0, 100);
    }

    // Racked work that blew its deadline still costs you standing.
    g.jobs.forEach(function (job) {
      if (g.day > job.due) g.rep = clamp(g.rep + T.repRackOverdue, 0, 100);
    });

    g.day += 1;
    g.dayTime = 0;
    g.ledger = { revenue: 0, jobs: 0, late: 0 };
    // Anything whose last day has passed stops applying now.
    g.modifiers = (g.modifiers || []).filter(function (m) { return m.until > g.day; });
    restockBoard();
    maybeFireEvent();

    if (g.money < 0) {
      // No bankruptcy wipe - an emergency loan keeps the shop open, at a cost.
      g.money = 250;
      g.rep = clamp(g.rep + T.repBailout, 0, 100);
      report.bailout = true;
    }

    emit('dayEnd', { report: report });
    emit('dirty');
    FAB.save();
  }

  /* ---------- things that turn up ---------- */

  function maybeFireEvent() {
    var g = FAB.game;
    if (g.pendingEvent) return;                       // one at a time
    if (g.day < T.eventMinDay) return;
    if (g.lastEventDay && g.day - g.lastEventDay < T.eventCooldownDays) return;
    if (Math.random() > T.eventChance) return;

    var pool = FAB.EVENTS.filter(function (def) { return !def.when || def.when(g); });
    if (!pool.length) return;

    var total = pool.reduce(function (sum, def) { return sum + def.weight; }, 0);
    var roll = Math.random() * total;
    var picked = pool[pool.length - 1];
    for (var i = 0; i < pool.length; i++) {
      roll -= pool[i].weight;
      if (roll <= 0) { picked = pool[i]; break; }
    }

    var ctx = picked.context ? picked.context(g) : {};
    // Stored by key so a save stays plain data.
    g.pendingEvent = {
      key: picked.key,
      stationKey: ctx.station ? ctx.station.key : null,
      productKey: ctx.product ? ctx.product.key : null
    };
    g.lastEventDay = g.day;
    emit('event', { key: picked.key });
    emit('dirty');
  }

  function eventContext(stored) {
    return {
      station: stored.stationKey ? FAB.STATION_BY_KEY[stored.stationKey] : null,
      product: stored.productKey ? FAB.PRODUCT_BY_KEY[stored.productKey] : null
    };
  }

  /* What the UI needs to draw the card: text, and each choice with its cost
     and whether it can be afforded. */
  FAB.currentEvent = function () {
    var g = FAB.game;
    if (!g || !g.pendingEvent) return null;
    var def = FAB.EVENT_BY_KEY[g.pendingEvent.key];
    if (!def) { g.pendingEvent = null; return null; }
    var ctx = eventContext(g.pendingEvent);
    return {
      key: def.key,
      title: def.title,
      body: def.body(g, ctx),
      choices: def.choices.map(function (choice) {
        var cost = choice.cost ? choice.cost(g, ctx) : 0;
        return {
          label: choice.label,
          detail: choice.detail ? choice.detail(g, ctx) : '',
          cost: cost,
          affordable: cost <= g.money
        };
      })
    };
  };

  FAB.resolveEvent = function (index) {
    var g = FAB.game;
    if (!g.pendingEvent) return false;
    var def = FAB.EVENT_BY_KEY[g.pendingEvent.key];
    var choice = def && def.choices[index];
    if (!choice) return false;

    var ctx = eventContext(g.pendingEvent);
    var cost = choice.cost ? choice.cost(g, ctx) : 0;
    if (cost > g.money) {
      emit('toast', { text: 'Not enough cash for that.', tone: 'bad' });
      return false;
    }
    if (cost) g.money -= cost;
    choice.apply(g, ctx);

    g.pendingEvent = null;
    emit('dirty');
    FAB.save();
    return true;
  };

  /* ---------- main tick ---------- */

  FAB.tick = function (dt) {
    var g = FAB.game;
    if (!g) return;

    g.dayTime += dt;
    trickleOffers(dt);
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
      var crew = FAB.effectiveOperators(st);
      if (crew <= 0) continue;
      var def = FAB.STATION_BY_KEY[st.key];
      var rate = crew * def.baseRate * FAB.rateMult(st) * g.operatorMult * rateScale;
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
        operatorMult: 1, xpMult: 1, boardBonus: 0, offerTimer: 0,
        autoQualityPull: T.autoQualityPull,
        runEarned: 0, blueprints: 0, blueprintsTotal: 0, runs: 0
      };
      Object.keys(defaults).forEach(function (k) {
        if (typeof g[k] !== 'number') g[k] = defaults[k];
      });
      if (!g.perks) g.perks = {};
      if (!Array.isArray(g.modifiers)) g.modifiers = [];
      if (typeof g.autoRoute !== 'boolean') g.autoRoute = true;
      if (typeof g.lastEventDay !== 'number') g.lastEventDay = 0;
      if (g.pendingEvent && !FAB.EVENT_BY_KEY[g.pendingEvent.key]) g.pendingEvent = null;
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
