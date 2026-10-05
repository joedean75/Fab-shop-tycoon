/* In-app purchases, through @capgo/native-purchases (StoreKit 2 on iOS,
   Play Billing on Android). There is no server: the stores are the record of
   what was bought, and this file only keeps a local copy of it.

   Entitlements live under their own storage key, outside the save, so that
   resetting the shop, selling up, or a corrupt save can never take away
   something the player paid for. Unlocks are re-read from the store on every
   launch, which is also how a reinstall gets them back. */
(function (FAB) {
  'use strict';

  var ENT_KEY = 'fabshop.entitlements.v1';
  var ID_PREFIX = 'com.fabshoptycoon.game.';

  FAB.STORE_ITEMS = [
    {
      key: 'double_pay',
      kind: 'unlock',
      name: 'Union Contract',
      desc: 'Every job pays double - in this shop and every shop after it.'
    },
    {
      key: 'night_crew',
      kind: 'unlock',
      name: 'Night Crew',
      desc: 'While you are away, operators work twice as fast and keep going ' +
            'for 12 days instead of 6.'
    },
    {
      key: 'big_contract',
      kind: 'consumable',
      name: 'Big Contract',
      desc: function () {
        return 'A one-off contract: ' + FAB.money(FAB.contractValue()) +
          ' straight into the bank. It is worth three of your best days, ' +
          'so it grows as the shop does.';
      }
    }
  ];
  var ITEM_BY_KEY = {};
  FAB.STORE_ITEMS.forEach(function (it) { ITEM_BY_KEY[it.key] = it; });

  function productId(key) { return ID_PREFIX + key; }
  function keyFor(productId) {
    return productId && productId.indexOf(ID_PREFIX) === 0 ? productId.slice(ID_PREFIX.length) : null;
  }

  /* ---------- entitlements ---------- */

  var owned = {};
  try {
    var stored = JSON.parse(localStorage.getItem(ENT_KEY) || 'null');
    if (stored && typeof stored === 'object') owned = stored;
  } catch (err) { /* no storage: nothing owned yet */ }

  function saveOwned() {
    try { localStorage.setItem(ENT_KEY, JSON.stringify(owned)); } catch (err) { /* ignore */ }
  }

  FAB.owns = function (key) { return owned[key] === true; };

  function push(type, payload) {
    payload = payload || {};
    payload.type = type;
    FAB.events.push(payload);
  }

  // Apply an item. Unlocks are idempotent; a consumable pays out each time.
  function grant(key, quiet) {
    var item = ITEM_BY_KEY[key];
    if (!item) return;
    if (item.kind === 'unlock') {
      if (owned[key]) return;
      owned[key] = true;
      saveOwned();
      if (key === 'double_pay' && FAB.game) FAB.applyDoublePay(FAB.game);
      if (!quiet) push('toast', { text: item.name + ' is yours. Thank you!', tone: 'good' });
    } else if (key === 'big_contract' && FAB.game) {
      var amount = FAB.grantContract(FAB.game);
      push('toast', { text: 'Big Contract paid ' + FAB.money(amount) + '.', tone: 'good' });
    }
    push('purchase', { key: key });
    push('dirty');
    if (FAB.save) FAB.save();
  }

  /* ---------- providers ---------- */

  function nativePlugin() {
    var cap = window.Capacitor;
    if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return null;
    return (cap.Plugins && cap.Plugins.NativePurchases) || null;
  }

  /* A stand-in store for automated tests on a local server. It is never
     reachable from a deployed site or the app: only localhost, and only when
     asked for in the URL. */
  function mockProvider() {
    var host = location.hostname;
    var local = host === 'localhost' || host === '127.0.0.1';
    if (!local || !/[?&]store=mock\b/.test(location.search)) return null;
    var prices = { double_pay: '$4.99', night_crew: '$2.99', big_contract: '$0.99' };
    var history = [];
    function later(value) {
      return new Promise(function (resolve) { setTimeout(function () { resolve(value); }, 60); });
    }
    return {
      isBillingSupported: function () { return later({ isBillingSupported: true }); },
      getProducts: function (o) {
        return later({ products: o.productIdentifiers.map(function (id) {
          return { identifier: id, priceString: prices[keyFor(id)] };
        }) });
      },
      purchaseProduct: function (o) {
        if (window.__storeMockCancel) return Promise.reject(new Error('User cancelled'));
        var tx = { productIdentifier: o.productIdentifier, transactionId: 't' + history.length };
        if (keyFor(o.productIdentifier) !== 'big_contract') history.push(tx);
        return later(tx);
      },
      getPurchases: function () { return later({ purchases: history.slice() }); },
      restorePurchases: function () { return later(); },
      // Tests seed a purchase made "on another device" through this.
      _seed: function (key) { history.push({ productIdentifier: productId(key) }); }
    };
  }

  var provider = nativePlugin() || mockProvider();
  var platform = FAB.native && FAB.native.platform;

  var store = FAB.store = {
    available: false,       // true once the platform store answered
    loading: !!provider,
    busy: null,             // key of a purchase in flight
    prices: {},
    provider: provider,
    item: function (key) { return ITEM_BY_KEY[key]; }
  };

  function unlocksFrom(purchases) {
    return (purchases || []).filter(function (p) {
      // Android reports state as a string; "1" is PURCHASED. A pending
      // payment (cash at a shop, say) must not unlock anything yet.
      return p.purchaseState === undefined || p.purchaseState === '1';
    }).map(function (p) { return keyFor(p.productIdentifier); })
      .filter(function (key) { return key && ITEM_BY_KEY[key] && ITEM_BY_KEY[key].kind === 'unlock'; });
  }

  /* Read what the store says this account owns. Only ever adds: an empty or
     failed answer (offline, another account signed in) never strips an
     unlock the player already has on this device. */
  function sync(quiet) {
    if (!provider) return Promise.resolve([]);
    // currentEntitlements on iOS excludes refunded and consumed transactions,
    // so a used Big Contract can never be paid out twice.
    return provider.getPurchases({ productType: 'inapp', onlyCurrentEntitlements: true })
      .then(function (res) {
        var keys = unlocksFrom(res && res.purchases);
        keys.forEach(function (key) { grant(key, quiet); });
        return keys;
      });
  }

  store.init = function () {
    if (!provider) return Promise.resolve(false);
    return provider.isBillingSupported()
      .then(function (res) {
        if (!res || !res.isBillingSupported) throw new Error('Billing is not available on this device.');
        return provider.getProducts({
          productIdentifiers: FAB.STORE_ITEMS.map(function (it) { return productId(it.key); }),
          productType: 'inapp'
        });
      })
      .then(function (res) {
        (res && res.products || []).forEach(function (p) {
          var key = keyFor(p.identifier || p.productIdentifier);
          if (key) store.prices[key] = p.priceString;
        });
        store.available = true;
        store.loading = false;
        push('dirty');
        // On Android, restoring also acknowledges any purchase a crash left
        // unacknowledged - Play refunds those after three days. On iOS it
        // would ask the player to sign in, so launch only reads.
        var prep = platform === 'android' && provider.restorePurchases
          ? provider.restorePurchases().catch(function () {}) : Promise.resolve();
        return prep.then(function () { return sync(true); });
      })
      .then(function () { return true; })
      .catch(function (err) {
        store.loading = false;
        store.error = (err && err.message) || 'Store unavailable';
        push('dirty');
        return false;
      });
  };

  function cancelled(err) {
    var msg = String((err && (err.message || err.code)) || err || '').toLowerCase();
    return msg.indexOf('cancel') >= 0;
  }

  store.buy = function (key) {
    var item = ITEM_BY_KEY[key];
    if (!provider || !store.available || !item || store.busy) return Promise.resolve(false);
    if (item.kind === 'unlock' && owned[key]) return Promise.resolve(false);
    store.busy = key;
    push('dirty');
    return provider.purchaseProduct({
      productIdentifier: productId(key),
      productType: 'inapp',
      quantity: 1,
      // Android: consume the Big Contract so it can be bought again.
      isConsumable: item.kind === 'consumable'
    }).then(function (tx) {
      store.busy = null;
      if (tx && tx.purchaseState !== undefined && tx.purchaseState !== '1') {
        push('toast', { text: 'Payment pending - it will unlock once it clears.' });
        push('dirty');
        return false;
      }
      grant(key, false);
      return true;
    }).catch(function (err) {
      store.busy = null;
      if (!cancelled(err)) push('toast', { text: 'Purchase failed: ' + ((err && err.message) || 'try again later'), tone: 'bad' });
      push('dirty');
      return false;
    });
  };

  // The "Restore purchases" button. Apple requires one for unlocks.
  store.restore = function () {
    if (!provider || !store.available) return Promise.resolve(0);
    store.busy = 'restore';
    push('dirty');
    var before = FAB.STORE_ITEMS.filter(function (it) { return owned[it.key]; }).length;
    return provider.restorePurchases()
      .then(function () { return sync(true); })
      .then(function () {
        store.busy = null;
        var now = FAB.STORE_ITEMS.filter(function (it) { return owned[it.key]; }).length;
        push('toast', {
          text: now > before ? 'Restored ' + (now - before) + ' purchase' + (now - before === 1 ? '' : 's') + '.'
            : 'Nothing new to restore.',
          tone: now > before ? 'good' : undefined
        });
        push('dirty');
        return now - before;
      })
      .catch(function (err) {
        store.busy = null;
        push('toast', { text: 'Restore failed: ' + ((err && err.message) || 'try again later'), tone: 'bad' });
        push('dirty');
        return 0;
      });
  };

})(window.FAB = window.FAB || {});
