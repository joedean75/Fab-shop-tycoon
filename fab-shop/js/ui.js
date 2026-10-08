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
    el.autoRoute = $('autoroute');
    el.manual = $('manual');
    el.manualBody = $('manual-body');
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
    el.records = $('records');

    buildStations();
    bindTabs();

    el.event = $('event');
    el.eventTitle = $('event-title');
    el.eventBody = $('event-body');
    el.eventChoices = $('event-choices');
    el.nightShift = $('nightshift');
    el.nightShiftLede = $('nightshift-lede');
    el.nightShiftLines = $('nightshift-lines');
    el.nightShiftUpsell = $('nightshift-upsell');
    el.goal = $('goal');
    el.goalText = $('goal-text');
    el.goalReward = $('goal-reward');
    el.goalFill = $('goal-fill');
    el.storePanel = $('store-panel');
    el.prefSound = $('pref-sound');
    el.prefHaptics = $('pref-haptics');

    if (FAB.feel) {
      var prefs = FAB.feel.prefs();
      el.prefSound.checked = prefs.sound;
      el.prefHaptics.checked = prefs.haptics;
      el.prefSound.addEventListener('change', function () { FAB.feel.set('sound', el.prefSound.checked); });
      el.prefHaptics.addEventListener('change', function () { FAB.feel.set('haptics', el.prefHaptics.checked); });
    }
    $('btn-tutorial').addEventListener('click', function () {
      if (!FAB.coach) return;
      var floor = document.querySelector('.tab[data-view="floor"]');
      if (floor) floor.click();
      FAB.coach.start();
    });
    el.storePanel.addEventListener('click', onStoreClick);
    el.nightShiftUpsell.addEventListener('click', function (ev) {
      if (!ev.target.closest('button[data-goto-store]')) return;
      el.nightShift.classList.add('hidden');
      var tab = document.querySelector('.tab[data-view="upgrades"]');
      if (tab) tab.click();
      setTimeout(function () { el.storePanel.scrollIntoView({ block: 'start' }); }, 30);
    });

    $('btn-manual').addEventListener('click', UI.showManual);
    $('manual-ok').addEventListener('click', function () {
      el.manual.classList.add('hidden');
    });
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
    el.rackList.addEventListener('click', onRackClick);
    // The eject button sits on the machine card, so keep its tap from also
    // scoring a hit on the machine underneath it.
    el.stations.addEventListener('pointerdown', function (ev) {
      if (ev.target.closest('button[data-unload]')) ev.stopPropagation();
    }, true);
    el.stations.addEventListener('click', onUnloadClick);
    el.autoRoute.addEventListener('change', function (ev) {
      FAB.setAutoRoute(ev.target.checked);
      UI.markDirty();
    });
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
        // Lists only redraw when something marks them dirty, so a tab opened
        // between two events would otherwise show figures from last time.
        UI.markDirty();
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
            '<button class="unload" data-unload="' + job.uid + '" ' +
              'title="Send back to the rack">⏏</button>' +
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
    if (FAB.feel) FAB.feel.hit(hit.result);
    if (FAB.coach) FAB.coach.tapped();

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
    el.autoRoute.checked = g.autoRoute !== false;
    var racked = g.jobs.filter(function (j) { return !j.at; });
    if (!racked.length) {
      el.rackList.innerHTML = '<div class="empty">Nothing waiting. Grab work from the order board.</div>';
      return;
    }
    el.rackList.innerHTML = racked.map(function (job) {
      var next = FAB.STATION_BY_KEY[FAB.currentOp(job)[0]];
      var left = job.due - g.day;
      var blocked = FAB.loadBlockedReason(job);
      return '<div class="card">' +
        '<div class="card-body">' +
          '<div class="card-title">' + FAB.jobProduct(job).name + '</div>' +
          '<div class="card-sub">Waiting for ' + next.name + ' · ' +
            (left < 0 ? 'OVERDUE' : 'due day ' + job.due) + '</div>' +
          routeMarkup(job) +
          '<div class="card-pay">' + money(job.pay) + '</div>' +
        '</div>' +
        '<button class="btn btn-small" data-load="' + job.uid + '"' +
          (blocked ? ' disabled title="' + blocked + '"' : '') + '>' +
          (blocked ? 'Busy' : 'Load') + '</button>' +
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

  /* The goal line updates every frame - progress like reputation moves
     without anything marking the lists dirty - but only touches the DOM when
     what it shows has actually changed. */
  var goalShown = '';
  function renderGoal() {
    var goal = FAB.currentGoal();
    var key = goal ? goal.index + ':' + goal.have : 'none';
    if (key === goalShown) return;
    goalShown = key;
    el.goal.classList.toggle('hidden', !goal);
    if (!goal) return;
    el.goalText.textContent = goal.text + (goal.need > 1 ? ' (' + goal.have.toLocaleString('en-US') +
      '/' + goal.need.toLocaleString('en-US') + ')' : '');
    el.goalReward.textContent = goal.reward;
    el.goalFill.style.width = Math.min(100, goal.have / goal.need * 100).toFixed(1) + '%';
  }

  function renderStore() {
    var store = FAB.store;
    if (!store || !store.provider) {
      // The web build cannot take payments; say where they are instead of
      // showing buttons that do nothing.
      el.storePanel.innerHTML = '<h3>Store</h3>' +
        '<div class="empty store-note">Extras like the Union Contract are sold in the ' +
        'iPhone and Android apps.</div>';
      return;
    }
    if (store.loading) {
      el.storePanel.innerHTML = '<h3>Store</h3><div class="empty">Reaching the store…</div>';
      return;
    }
    if (!store.available) {
      el.storePanel.innerHTML = '<h3>Store</h3><div class="empty">The store is not reachable right now.</div>';
      return;
    }
    var items = FAB.STORE_ITEMS.map(function (item) {
      var have = item.kind === 'unlock' && FAB.owns(item.key);
      var price = store.prices[item.key];
      var desc = typeof item.desc === 'function' ? item.desc() : item.desc;
      var busy = store.busy === item.key;
      return '<div class="card store-item' + (have ? ' maxed' : '') + '">' +
        '<div class="card-body">' +
          '<div class="card-title">' + item.name + '</div>' +
          '<div class="card-sub">' + desc + '</div>' +
        '</div>' +
        (have
          ? '<div class="card-sub owned-tag">OWNED</div>'
          : '<button class="btn btn-small" data-buy="' + item.key + '"' +
            (!price || store.busy ? ' disabled' : '') + '>' +
            (busy ? '…' : (price || '—')) + '</button>') +
      '</div>';
    }).join('');
    el.storePanel.innerHTML = '<h3>Store</h3>' + items +
      '<button type="button" class="link-btn restore-btn" data-restore="1"' +
        (store.busy ? ' disabled' : '') + '>' +
        (store.busy === 'restore' ? 'Restoring…' : 'Restore purchases') + '</button>';
  }

  function onStoreClick(ev) {
    var buy = ev.target.closest('button[data-buy]');
    if (buy && !buy.disabled) { FAB.store.buy(buy.dataset.buy); return; }
    var restore = ev.target.closest('button[data-restore]');
    if (restore && !restore.disabled) FAB.store.restore();
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

    // Figures the game has always kept and never shown.
    var st = g.stats;
    var onTime = st.completed ? Math.round((st.completed - st.late) / st.completed * 100) : 100;
    el.records.innerHTML =
      '<dt>Jobs shipped</dt><dd>' + st.completed + '</dd>' +
      '<dt>Shipped on time</dt><dd class="' + (onTime >= 90 ? 'pos' : '') + '">' + onTime + '%</dd>' +
      '<dt>Earned all-time</dt><dd class="pos">' + money(st.earned) + '</dd>' +
      '<dt>Best day</dt><dd>' + money(st.bestDay || 0) + '</dd>' +
      '<dt>Best shop</dt><dd>' + money(st.bestRun || 0) + '</dd>' +
      '<dt>This shop so far</dt><dd>' + money(g.runEarned) + '</dd>' +
      '<dt>Shops run</dt><dd>' + (g.runs + 1) + '</dd>' +
      '<dt>Goals met</dt><dd>' + FAB.goalsCompleted(g) + ' of ' + FAB.GOALS.length + '</dd>';

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

  function onRackClick(ev) {
    var btn = ev.target.closest('button[data-load]');
    if (!btn || btn.disabled) return;
    FAB.loadJob(btn.dataset.load);
    UI.markDirty();
  }

  function onUnloadClick(ev) {
    var btn = ev.target.closest('button[data-unload]');
    if (!btn) return;
    ev.stopPropagation();
    FAB.unloadJob(btn.dataset.unload);
    UI.markDirty();
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
    var pitch = FAB.store && FAB.store.available && !FAB.owns('night_crew');
    el.nightShiftUpsell.classList.toggle('hidden', !pitch);
    el.nightShiftUpsell.innerHTML = pitch
      ? (n.nightCrew ? '' : 'A <b>Night Crew</b> would have done twice this, and keeps going for 12 days. ') +
        '<button type="button" class="link-btn" data-goto-store="1">See the store</button>'
      : '';
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

  /* The manual is built from the tuning constants, so it always states what
     the simulation actually does rather than a description that drifts. */
  UI.showManual = function () {
    var T = FAB.TUNE;
    var crew = FAB.owns && FAB.owns('night_crew') ? 2 : 1;
    var awayDaysPerHour = 3600 * T.offlineWorkPerSecond * crew / T.dayLength;
    var awayCap = T.offlineMaxDays * crew;
    var signed = function (n) { return (n > 0 ? '+' : '') + n; };
    var row = function (label, value, dir) {
      return '<tr><td>' + label + '</td><td class="' + dir + '">' + value + '</td></tr>';
    };

    el.manualBody.innerHTML =
      '<h3>Working a machine</h3>' +
      '<p>Tap a running machine as the orange marker crosses the green band. ' +
      'Timing is the whole game: a perfect hit does ' +
      (T.perfectWork / T.tapWork).toFixed(0) + ' times the work of a mistimed one.</p>' +
      '<table>' +
        row('Perfect hit, inside the band', T.perfectWork + ' work, ' +
            signed(T.perfectQuality) + ' quality', 'up') +
        row('Close to the band', T.goodWork + ' work', '') +
        row('Mistimed', T.tapWork + ' work, ' + signed(T.missQuality) + ' quality', 'down') +
      '</table>' +

      '<h3>Quality</h3>' +
      '<p>Every part carries a quality score. It starts at ' + T.startQuality +
      ', rises with well-timed taps, and sets what the job pays - from 0.8x at ' +
      'the bottom to 1.25x at the top. A machine left to an operator drifts ' +
      'toward ' + T.autoQualityPull + ', which is why hand-worked parts pay more.</p>' +

      '<h3>Reputation</h3>' +
      '<p>Reputation sets what the board pays you, from 0.85x at nothing to ' +
      '1.15x at 100. At ' + T.repBoardBonusAt + ' you get an extra offer every day. ' +
      'The losses are bigger than the gains, so protect it.</p>' +
      '<table>' +
        row('Ship at quality ' + T.repGreatAt + '+', signed(T.repGreat), 'up') +
        row('Ship at quality ' + T.repGoodAt + '-' + (T.repGreatAt - 1), signed(T.repGood), 'up') +
        row('Ship at quality under ' + T.repPoorAt, signed(T.repPoor), 'down') +
        row('Ship a day after the deadline', signed(T.repLateFresh), 'down') +
        row('Ship more than a day late', signed(T.repLate), 'down') +
        row('Each overdue job left on the rack, per day', signed(T.repRackOverdue), 'down') +
        row('Emergency loan when cash runs out', signed(T.repBailout), 'down') +
      '</table>' +
      '<p>Events move it too: a good word adds 3, a walk-in job 1, and the ' +
      'inspector adds 4 if you are already respected - or takes 3 if you are not.</p>' +

      '<h3>Loading the machines</h3>' +
      '<p>Jobs load themselves onto the machine they need next. Turn off ' +
      '<b>Auto-load</b> above the steel rack to do it yourself: then <b>Load</b> ' +
      'puts a racked job on, and the eject button on a running job sends it back ' +
      'to the rack with its progress intact, so you can free a bay for something ' +
      'more urgent.</p>' +

      '<h3>Machines and operators</h3>' +
      '<p>Every machine arrives with one operator on it, and that hand works ' +
      'the bay on its own while you are tapping somewhere else. Levelling a ' +
      'machine makes it faster, and every second level adds a bay you can hire ' +
      'another operator into. Each hand costs ' + money(T.wagePerOperator) +
      ' a day in wages, and each machine level ' + money(T.powerPerMachineLevel) +
      ' a day in power, so a big shop has to keep shipping.</p>' +

      '<h3>The day</h3>' +
      '<p>A day lasts ' + T.dayLength + ' seconds and ends with rent, wages and ' +
      'power coming out whether you shipped or not. Deadlines are counted in days, ' +
      'and a late delivery loses ' + Math.round(T.lateStep * 100) + '% of its ticket ' +
      'for every day it is over, down to ' + Math.round(T.latePenalty * 100) + '%, ' +
      'on top of the reputation hit.</p>' +

      '<h3>While you are away</h3>' +
      '<p>Hired operators keep working the jobs on the floor when the app is ' +
      'closed - about ' + (awayDaysPerHour < 2 ? 'a day and a half' : 'three days') +
      ' of machine time per hour away, up to ' + awayCap + ' days. The calendar ' +
      'waits for you, so nothing goes late while you are gone, and nothing runs ' +
      'at all without operators.</p>' +

      '<h3>Goals</h3>' +
      '<p>The bar above the machines is your next goal. Each one pays its bonus ' +
      'the moment you meet it, in any order, and the list carries across every ' +
      'shop you own - ' + FAB.GOALS.length + ' in all.</p>' +

      '<h3>Selling up</h3>' +
      '<p>From shop level ' + FAB.PRESTIGE.minLevel + ' you can sell the shop and ' +
      'open a bigger one. You bank blueprints for what it earned, and they buy ' +
      'permanent upgrades that carry into every shop afterwards. Each blueprint ' +
      'ever earned also adds ' + Math.round(FAB.PRESTIGE.passivePayPerBlueprint * 100) +
      '% to pay, so spending them never sets you back.</p>';

    el.manual.classList.remove('hidden');
  };

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
      renderStore();
      renderPrestige();
    }

    renderGoal();
    if (FAB.coach) FAB.coach.frame();

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
      else if (ev.type === 'shipped' && FAB.feel) { if (ev.late) FAB.feel.bad(); else FAB.feel.ship(); }
      else if (ev.type === 'levelUp' && FAB.feel) FAB.feel.levelUp();
      else if ((ev.type === 'goal' || ev.type === 'purchase') && FAB.feel) { FAB.feel.reward(); dirty = true; }
      else if (ev.type === 'event') { dirty = true; UI.showEventIfPending(); }
    }
  };

})(window.FAB = window.FAB || {});
