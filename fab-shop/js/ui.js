/* DOM layer. Rebuilds lists only when the game says it's dirty; per-frame it
   touches nothing but progress widths, the timing marker and the HUD numbers. */
(function (FAB) {
  'use strict';

  var UI = FAB.UI = {};
  var el = {};
  var stationRefs = {};   // key -> { root, meta, marker, zone, slots:[{fill,name,due}] }
  var dirty = true;

  function $(id) { return document.getElementById(id); }
  function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }

  UI.init = function () {
    el.money = $('hud-money');
    el.day = $('hud-day');
    el.rep = $('hud-rep');
    el.level = $('hud-level');
    el.dayFill = $('daybar-fill');
    el.xpFill = $('xpbar-fill');
    el.stations = $('stations');
    el.rackList = $('rack-list');
    el.rackCount = $('rack-count');
    el.boardList = $('board-list');
    el.shopUps = $('upgrade-shop');
    el.machineUps = $('upgrade-machines');
    el.toasts = $('toasts');
    el.report = $('report');
    el.reportTitle = $('report-title');
    el.reportLines = $('report-lines');
    el.ordersBadge = $('tab-orders-badge');
    el.upgradesBadge = $('tab-upgrades-badge');
    el.expandBadge = $('tab-expand-badge');
    el.blueprintBar = $('blueprint-bar');
    el.relocatePanel = $('relocate-panel');
    el.perkList = $('perk-list');

    buildStations();
    bindTabs();

    el.event = $('event');
    el.eventTitle = $('event-title');
    el.eventBody = $('event-body');
    el.eventChoices = $('event-choices');
    el.nightShift = $('nightshift');
    el.nightShiftLede = $('nightshift-lede');
    el.nightShiftLines = $('nightshift-lines');

    $('report-ok').addEventListener('click', function () {
      el.report.classList.add('hidden');
      UI.showEventIfPending();
    });
    $('nightshift-ok').addEventListener('click', function () {
      el.nightShift.classList.add('hidden');
      UI.showEventIfPending();
    });
    $('btn-reset').addEventListener('click', function () {
      if (window.confirm('Scrap the shop and start over?')) {
        FAB.reset();
        UI.markDirty();
      }
    });

    el.boardList.addEventListener('click', onBoardClick);
    el.shopUps.addEventListener('click', onUpgradeClick);
    el.machineUps.addEventListener('click', onUpgradeClick);
    el.perkList.addEventListener('click', onPerkClick);
    el.eventChoices.addEventListener('click', onEventChoice);
    el.relocatePanel.addEventListener('click', onRelocateClick);
  };

  UI.markDirty = function () { dirty = true; };

  /* ---------- tabs ---------- */

  function bindTabs() {
    var tabs = document.querySelectorAll('.tab');
    Array.prototype.forEach.call(tabs, function (tab) {
      tab.addEventListener('click', function () {
        Array.prototype.forEach.call(tabs, function (t) { t.classList.remove('is-active'); });
        tab.classList.add('is-active');
        Array.prototype.forEach.call(document.querySelectorAll('.view'), function (v) {
          v.classList.remove('is-active');
        });
        $('view-' + tab.dataset.view).classList.add('is-active');
      });
    });
  }

  /* ---------- stations ---------- */

  function buildStations() {
    el.stations.innerHTML = '';
    stationRefs = {};

    FAB.STATIONS.forEach(function (def) {
      var root = document.createElement('article');
      root.className = 'station';
      root.dataset.key = def.key;
      root.style.setProperty('--st-color', def.color);
      root.innerHTML =
        '<div class="station-top">' +
          '<span class="station-icon">' + def.icon + '</span>' +
          '<span class="station-name">' + def.name + '</span>' +
          '<span class="station-meta"></span>' +
        '</div>' +
        '<div class="station-slots"></div>' +
        '<div class="timing">' +
          '<div class="timing-zone"></div>' +
          '<div class="timing-marker"></div>' +
          '<div class="timing-label">tap in the green</div>' +
        '</div>';

      root.addEventListener('pointerdown', function (ev) { onStationTap(def.key, root, ev); });
      el.stations.appendChild(root);

      stationRefs[def.key] = {
        root: root,
        meta: root.querySelector('.station-meta'),
        slotHost: root.querySelector('.station-slots'),
        timing: root.querySelector('.timing'),
        zone: root.querySelector('.timing-zone'),
        marker: root.querySelector('.timing-marker'),
        slots: []
      };
    });
  }

  function renderStationSlots() {
    FAB.STATIONS.forEach(function (def) {
      var ref = stationRefs[def.key];
      var st = FAB.station(def.key);
      var unlocked = FAB.isStationUnlocked(def.key);

      ref.root.classList.toggle('locked', !unlocked);
      ref.slots = [];
      ref.slotHost.innerHTML = '';

      if (!unlocked) {
        ref.meta.textContent = 'Unlocks at Shop Lv ' + FAB.STATION_BY_KEY[def.key].unlockLevel;
        ref.slotHost.innerHTML = '';
        return;
      }

      var bays = FAB.slotCount(st);
      var crew = FAB.effectiveOperators(st);
      var down = FAB.stationDown(def.key);
      ref.root.classList.toggle('is-down', down);

      if (down) {
        var until = FAB.mods('down', def.key)[0];
        var left = Math.max(1, until.until - FAB.game.day);
        ref.meta.innerHTML = '<span class="down-tag">DOWN</span> · ' + left + 'd';
      } else {
        // An asterisk marks a crew changed by something temporary.
        ref.meta.textContent = 'Lv ' + st.level + ' · ' + bays + ' bay' + (bays === 1 ? '' : 's') +
          ' · ' + crew + ' op' + (crew === 1 ? '' : 's') + (crew !== st.operators ? '*' : '');
      }

      var count = FAB.slotCount(st);
      var focusTaken = false;
      for (var i = 0; i < count; i++) {
        var wrap = document.createElement('div');
        wrap.className = 'slot';
        var job = st.slots[i] ? FAB.jobByUid(st.slots[i]) : null;

        if (!job) {
          wrap.innerHTML = '<div class="slot-empty">Bay ' + (i + 1) + ' open</div>';
          ref.slotHost.appendChild(wrap);
          continue;
        }

        var focused = !focusTaken;
        focusTaken = true;
        wrap.className = 'slot' + (focused ? ' slot-focus' : '');
        wrap.innerHTML =
          '<div class="job-line">' +
            '<span class="job-name">' + FAB.jobProduct(job).name + '</span>' +
            (focused ? '' : '<span class="job-tag">auto</span>') +
            '<span class="job-q"></span>' +
            '<span class="job-due"></span>' +
          '</div>' +
          '<div class="prog"><div class="prog-fill"></div></div>';

        ref.slots.push({
          jobUid: job.uid,
          fill: wrap.querySelector('.prog-fill'),
          due: wrap.querySelector('.job-due'),
          q: wrap.querySelector('.job-q')
        });
        ref.slotHost.appendChild(wrap);
      }
    });
  }

  function onStationTap(key, root, ev) {
    var hit = FAB.tapStation(key);
    if (!hit) return;
    if (navigator.vibrate && hit.result === 'perfect') navigator.vibrate(12);

    var spark = document.createElement('span');
    spark.className = 'spark';
    if (hit.result === 'perfect') { spark.textContent = 'PERFECT +' + hit.work; spark.style.color = '#4ade80'; }
    else if (hit.result === 'good') { spark.textContent = 'good +' + hit.work; spark.style.color = '#ffd166'; }
    else { spark.textContent = '+' + hit.work; spark.style.color = '#94a3b2'; }

    var box = root.getBoundingClientRect();
    spark.style.left = Math.max(8, Math.min(box.width - 80, ev.clientX - box.left - 30)) + 'px';
    spark.style.top = (ev.clientY - box.top - 14) + 'px';
    root.appendChild(spark);
    setTimeout(function () { spark.remove(); }, 700);
  }

  /* ---------- lists ---------- */

  function routeMarkup(job) {
    var ops = FAB.jobProduct(job).ops;
    return '<div class="route">' + ops.map(function (op, i) {
      var color = FAB.STATION_BY_KEY[op[0]].color;
      return '<span class="' + (i < job.opIndex ? 'done' : '') + '" style="--rt:' + color + '"></span>';
    }).join('') + '</div>';
  }

  function renderRack() {
    var g = FAB.game;
    el.rackCount.textContent = g.jobs.length + '/' + g.wipMax;
    var racked = g.jobs.filter(function (j) { return !j.at; });
    if (!racked.length) {
      el.rackList.innerHTML = '<div class="empty">Nothing waiting. Grab work from the order board.</div>';
      return;
    }
    el.rackList.innerHTML = racked.map(function (job) {
      var next = FAB.STATION_BY_KEY[FAB.currentOp(job)[0]];
      var left = job.due - g.day;
      return '<div class="card">' +
        '<div class="card-body">' +
          '<div class="card-title">' + FAB.jobProduct(job).name + '</div>' +
          '<div class="card-sub">Waiting for ' + next.name + ' · ' +
            (left < 0 ? 'OVERDUE' : 'due day ' + job.due) + '</div>' +
          routeMarkup(job) +
        '</div>' +
        '<div class="card-pay">' + money(job.pay) + '</div>' +
      '</div>';
    }).join('');
  }

  function renderBoard() {
    var g = FAB.game;
    if (!g.board.length) {
      el.boardList.innerHTML = '<div class="empty">Board is clear. More work posts tomorrow.</div>';
    } else {
      el.boardList.innerHTML = g.board.map(function (offer) {
        var product = FAB.PRODUCT_BY_KEY[offer.product];
        var steps = product.ops.map(function (op) { return FAB.STATION_BY_KEY[op[0]].name.split(' ')[0]; }).join(' › ');
        var full = g.jobs.length >= g.wipMax;
        return '<div class="card' + (offer.rush ? ' rush' : '') + '">' +
          '<div class="card-body">' +
            '<div class="card-title">' + product.name + (offer.rush ? ' ⚡ RUSH' : '') + '</div>' +
            '<div class="card-sub">' + steps + ' · due day ' + offer.due + '</div>' +
            '<div class="card-pay">' + money(offer.pay) + '</div>' +
          '</div>' +
          '<button class="btn btn-small" data-accept="' + offer.uid + '"' + (full ? ' disabled' : '') + '>' +
            (full ? 'Full' : 'Take') + '</button>' +
        '</div>';
      }).join('');
    }
    var count = g.board.length;
    el.ordersBadge.textContent = count;
    el.ordersBadge.classList.toggle('hidden', count === 0 || g.jobs.length >= g.wipMax);
  }

  function upgradeCard(title, sub, cost, action, arg, disabled, note) {
    return '<div class="card">' +
      '<div class="card-body">' +
        '<div class="card-title">' + title + '</div>' +
        '<div class="card-sub">' + sub + '</div>' +
      '</div>' +
      (note
        ? '<div class="card-sub">' + note + '</div>'
        : '<button class="btn btn-small" data-action="' + action + '" data-arg="' + arg + '"' +
          (disabled ? ' disabled' : '') + '>' + money(cost) + '</button>') +
    '</div>';
  }

  function renderUpgrades() {
    var g = FAB.game;
    var affordable = false;

    var shop = FAB.SHOP_UPGRADES.map(function (def) {
      var owned = g.upgrades[def.key] || 0;
      if (owned >= def.max) {
        return upgradeCard(def.name + ' (max)', def.desc, 0, '', '', true, 'MAX');
      }
      var cost = def.cost(owned);
      if (g.money >= cost) affordable = true;
      return upgradeCard(def.name + ' · ' + owned + '/' + def.max, def.desc, cost,
        'shop', def.key, g.money < cost);
    }).join('');
    el.shopUps.innerHTML = '<h3>Shop</h3>' + shop;

    var machines = FAB.STATIONS.map(function (def) {
      var st = FAB.station(def.key);
      if (!FAB.isStationUnlocked(def.key)) {
        return upgradeCard(def.name, 'Unlocks at shop level ' + def.unlockLevel, 0, '', '', true, 'LOCKED');
      }
      var mCost = FAB.machineCost(st.level);
      var oCost = FAB.operatorCost(st.operators);
      var bays = FAB.slotCount(st);
      var nextBays = 1 + Math.floor(st.level / 2);
      if (g.money >= mCost || (st.operators < bays && g.money >= oCost)) affordable = true;

      var rows = upgradeCard(
        def.name + ' · Lv ' + st.level,
        'Speed ' + FAB.rateMult(st).toFixed(1) + 'x → ' + (FAB.rateMult(st) + 0.5).toFixed(1) + 'x' +
          (nextBays > bays ? ' · +1 bay' : ''),
        mCost, 'machine', def.key, g.money < mCost);

      rows += st.operators >= bays
        ? upgradeCard('Operator · ' + st.operators + '/' + bays, 'Upgrade the machine for another bay.',
            0, '', '', true, 'FULL')
        : upgradeCard('Operator · ' + st.operators + '/' + bays,
            'Works this machine on its own. ' + money(FAB.TUNE.wagePerOperator) + '/day wages.',
            oCost, 'operator', def.key, g.money < oCost);
      return rows;
    }).join('');
    el.machineUps.innerHTML = '<h3>Machines</h3>' + machines;

    el.upgradesBadge.classList.toggle('hidden', !affordable);
  }

  function renderPrestige() {
    var g = FAB.game;
    var passive = Math.round(g.blueprintsTotal * FAB.PRESTIGE.passivePayPerBlueprint * 100);

    el.blueprintBar.innerHTML =
      '<div class="bp-stat"><span class="bp-value">' + g.blueprints + '</span>' +
        '<span class="bp-label">Blueprints</span></div>' +
      '<div class="bp-stat"><span class="bp-value">+' + passive + '%</span>' +
        '<span class="bp-label">Pay bonus</span></div>' +
      '<div class="bp-stat"><span class="bp-value">' + (g.runs + 1) + '</span>' +
        '<span class="bp-label">Shop no.</span></div>';

    var gain = FAB.prestigeGain();
    var ready = FAB.canPrestige();
    var body;

    if (ready) {
      body =
        '<div class="relocate-gain">Sell up now for <strong>' + gain + ' blueprint' +
          (gain === 1 ? '' : 's') + '</strong></div>' +
        '<p class="relocate-note">This shop has taken in ' + money(g.runEarned) + '. ' +
          'Relocating <b>resets cash, day, shop level, machines and their operators</b>, ' +
          'and <b>keeps blueprints, permanent upgrades and your records</b>.</p>' +
        '<button class="btn btn-primary" data-relocate="1">Sell the shop</button>';
    } else if (g.level < FAB.PRESTIGE.minLevel) {
      body =
        '<div class="relocate-gain">Locked until shop level ' + FAB.PRESTIGE.minLevel + '</div>' +
        '<p class="relocate-note">You are level ' + g.level + '. Build the shop up first - ' +
          'relocating too early throws away more than it banks.</p>';
    } else {
      body =
        '<div class="relocate-gain">Not worth relocating yet</div>' +
        '<p class="relocate-note">This shop has taken in ' + money(g.runEarned) + '. ' +
          'Your first blueprint lands at ' + money(FAB.nextBlueprintAt()) + '.</p>';
    }
    el.relocatePanel.className = 'relocate-panel' + (ready ? ' ready' : '');
    el.relocatePanel.innerHTML = body;

    el.perkList.innerHTML = FAB.PERKS.map(function (def) {
      var owned = g.perks[def.key] || 0;
      var maxed = owned >= def.max;
      var cost = maxed ? 0 : def.cost(owned);
      return '<div class="card' + (maxed ? ' maxed' : '') + '">' +
        '<div class="card-body">' +
          '<div class="card-title">' + def.name + ' \u00B7 ' + owned + '/' + def.max + '</div>' +
          '<div class="card-sub">' + def.desc + '</div>' +
          (owned ? '<div class="perk-owned">Now: ' + def.detail(owned) + '</div>' : '') +
        '</div>' +
        (maxed
          ? '<div class="card-sub">MAX</div>'
          : '<button class="btn btn-small bp-cost" data-perk="' + def.key + '"' +
            (g.blueprints < cost ? ' disabled' : '') + '>' + cost + ' \u25C8</button>') +
      '</div>';
    }).join('');

    var canBuy = FAB.PERKS.some(function (def) {
      var owned = g.perks[def.key] || 0;
      return owned < def.max && g.blueprints >= def.cost(owned);
    });
    el.expandBadge.classList.toggle('hidden', !(ready || canBuy));
  }

  function onPerkClick(ev) {
    var btn = ev.target.closest('button[data-perk]');
    if (!btn) return;
    FAB.buyPerk(btn.dataset.perk);
    UI.markDirty();
  }

  function onRelocateClick(ev) {
    if (!ev.target.closest('button[data-relocate]')) return;
    var gain = FAB.prestigeGain();
    if (window.confirm('Sell this shop for ' + gain + ' blueprint' + (gain === 1 ? '' : 's') +
        '?\n\nCash, day, shop level and machines reset. Blueprints and permanent ' +
        'upgrades carry over.')) {
      FAB.doPrestige();
      UI.markDirty();
    }
  }

  function onBoardClick(ev) {
    var btn = ev.target.closest('button[data-accept]');
    if (!btn) return;
    FAB.acceptOrder(btn.dataset.accept);
    UI.markDirty();
  }

  function onUpgradeClick(ev) {
    var btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    var arg = btn.dataset.arg;
    if (btn.dataset.action === 'shop') FAB.buyShopUpgrade(arg);
    else if (btn.dataset.action === 'machine') FAB.buyMachineLevel(arg);
    else if (btn.dataset.action === 'operator') FAB.hireOperator(arg);
    UI.markDirty();
  }

  /* ---------- toasts + day report ---------- */

  UI.toast = function (text, tone) {
    var node = document.createElement('div');
    node.className = 'toast' + (tone ? ' ' + tone : '');
    node.textContent = text;
    el.toasts.appendChild(node);
    setTimeout(function () { node.remove(); }, 2600);
    while (el.toasts.children.length > 3) el.toasts.firstChild.remove();
  };

  function describeSpan(seconds) {
    var h = Math.floor(seconds / 3600);
    var m = Math.round((seconds % 3600) / 60);
    if (h && m) return h + 'h ' + m + 'm';
    if (h) return h + ' hour' + (h === 1 ? '' : 's');
    return m + ' minute' + (m === 1 ? '' : 's');
  }

  UI.showNightShift = function (n) {
    el.nightShiftLede.textContent = 'The shop was shut for ' + describeSpan(n.away) + '. ' +
      'Your operators put in about ' + n.days.toFixed(1) + ' days on the machines' +
      (n.capped ? ', which is as long as a crew will run unattended.' : '.');
    el.nightShiftLines.innerHTML =
      '<dt>Jobs shipped</dt><dd>' + n.shipped + '</dd>' +
      '<dt>Operations finished</dt><dd>' + n.ops + '</dd>' +
      '<dt>Earned</dt><dd class="pos">' + money(n.earned) + '</dd>' +
      (n.levels ? '<dt>Shop levels gained</dt><dd class="pos">+' + n.levels + '</dd>' : '') +
      '<dt>Day</dt><dd>' + FAB.game.day + ' (unchanged)</dd>' +
      (n.ranDry ? '<dt>Note</dt><dd>crew ran out of work</dd>' : '');
    el.nightShift.classList.remove('hidden');
    dirty = true;
  };

  /* An event card is only raised once the day's report is out of the way. */
  UI.showEventIfPending = function () {
    if (!el.report.classList.contains('hidden')) return;
    if (!el.nightShift.classList.contains('hidden')) return;
    var ev = FAB.currentEvent();
    if (!ev) { el.event.classList.add('hidden'); return; }

    el.eventTitle.textContent = ev.title;
    el.eventBody.textContent = ev.body;
    el.eventChoices.innerHTML = ev.choices.map(function (choice, i) {
      return '<button class="event-choice" data-choice="' + i + '"' +
          (choice.affordable ? '' : ' disabled') + '>' +
          '<span class="event-choice-main">' +
            '<span class="event-choice-label">' + choice.label + '</span>' +
            (choice.detail ? '<span class="event-choice-detail">' + choice.detail + '</span>' : '') +
          '</span>' +
          (choice.cost ? '<span class="event-choice-cost">' + money(choice.cost) + '</span>' : '') +
        '</button>';
    }).join('');
    el.event.classList.remove('hidden');
  };

  function onEventChoice(ev) {
    var btn = ev.target.closest('button[data-choice]');
    if (!btn || btn.disabled) return;
    if (FAB.resolveEvent(+btn.dataset.choice)) {
      el.event.classList.add('hidden');
      UI.markDirty();
    }
  }

  UI.showReport = function (r) {
    el.reportTitle.textContent = 'Day ' + r.day + ' closed';
    var lines =
      '<dt>Jobs shipped</dt><dd>' + r.jobs + '</dd>' +
      '<dt>Late</dt><dd class="' + (r.late ? 'neg' : '') + '">' + r.late + '</dd>' +
      '<dt>Revenue</dt><dd class="pos">' + money(r.revenue) + '</dd>' +
      '<dt>Overhead</dt><dd class="neg">-' + money(r.overhead) + '</dd>' +
      (r.surcharge ? '<dt>&nbsp;&nbsp;of which surcharge</dt><dd class="neg">-' +
        money(r.surcharge) + '</dd>' : '') +
      '<dt>Net</dt><dd class="' + (r.net >= 0 ? 'pos' : 'neg') + '">' + money(r.net) + '</dd>';
    if (r.bailout) lines += '<dt>Emergency loan</dt><dd class="neg">-5 rep</dd>';
    el.reportLines.innerHTML = lines;
    el.report.classList.remove('hidden');
  };

  UI.flash = function (node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth;   // restart the animation
    node.classList.add(cls);
  };

  /* ---------- per-frame ---------- */

  UI.frame = function () {
    var g = FAB.game;
    if (!g) return;

    if (dirty) {
      dirty = false;
      renderStationSlots();
      renderRack();
      renderBoard();
      renderUpgrades();
      renderPrestige();
    }

    el.money.textContent = money(g.money);
    el.day.textContent = g.day;
    el.rep.textContent = Math.round(g.rep);
    el.level.textContent = g.level;
    el.dayFill.style.width = (g.dayTime / FAB.TUNE.dayLength * 100).toFixed(1) + '%';
    el.xpFill.style.width = (g.xp / FAB.xpNeeded() * 100).toFixed(1) + '%';

    for (var i = 0; i < FAB.STATIONS.length; i++) {
      var def = FAB.STATIONS[i];
      var ref = stationRefs[def.key];
      var st = FAB.station(def.key);
      var busy = false;

      for (var s = 0; s < ref.slots.length; s++) {
        var slot = ref.slots[s];
        var job = FAB.jobByUid(slot.jobUid);
        if (!job) { dirty = true; continue; }
        busy = true;
        var work = FAB.currentOp(job)[1];
        slot.fill.style.width = Math.min(100, job.progress / work * 100).toFixed(1) + '%';
        slot.q.textContent = 'Q' + Math.round(job.quality);
        var left = job.due - g.day;
        slot.due.textContent = left < 0 ? 'OVERDUE' : (left === 0 ? 'due today' : left + 'd left');
        slot.due.classList.toggle('urgent', left <= 0);
      }

      // Slots emptied by the sim this frame need a structural re-render.
      if (ref.slots.length !== st.slots.filter(Boolean).length) dirty = true;

      ref.root.classList.toggle('is-hot', busy);
      ref.root.classList.toggle('is-idle', !busy);
      ref.timing.classList.toggle('hidden', !busy);
      if (busy) {
        ref.zone.style.left = (st.zone * 100).toFixed(1) + '%';
        ref.zone.style.width = (FAB.TUNE.zoneWidth * 100).toFixed(1) + '%';
        ref.marker.style.left = (st.marker * 100).toFixed(1) + '%';
      }
    }
  };

  UI.drainEvents = function () {
    var list = FAB.events;
    FAB.events = [];
    for (var i = 0; i < list.length; i++) {
      var ev = list[i];
      if (ev.type === 'toast') UI.toast(ev.text, ev.tone);
      else if (ev.type === 'dirty') dirty = true;
      else if (ev.type === 'money') UI.flash(el.money, 'flash-good');
      else if (ev.type === 'dayEnd') { UI.showReport(ev.report); dirty = true; }
      else if (ev.type === 'prestige') { dirty = true; }
      else if (ev.type === 'event') { dirty = true; UI.showEventIfPending(); }
    }
  };

})(window.FAB = window.FAB || {});
