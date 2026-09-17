/* Boot + frame loop. */
(function (FAB) {
  'use strict';

  var last = 0;
  var saveTimer = 0;
  var report = null;

  function frame(now) {
    var dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;

    // Reading the nightly report pauses the clock.
    if (!report.classList.contains('hidden')) dt = 0;

    if (dt > 0) {
      FAB.tick(dt);
      saveTimer += dt;
      if (saveTimer > 8) { saveTimer = 0; FAB.save(); }
    }

    FAB.UI.drainEvents();
    FAB.UI.frame();
    requestAnimationFrame(frame);
  }

  function start() {
    report = document.getElementById('report');

    if (!FAB.load()) {
      FAB.newGame();
      FAB.UI.init();
      FAB.UI.toast('Welcome to the shop. Take an order, then tap the machines.', 'good');
    } else {
      // Run the night shift before the first frame, so the player sees the
      // shop as it actually stands rather than watching it catch up.
      var away = FAB.secondsAway();
      var nightShift = FAB.runOffline(away);
      FAB.UI.init();
      if (nightShift && !nightShift.idle) {
        FAB.UI.showNightShift(nightShift);
      } else {
        FAB.UI.toast('Shop reopened - day ' + FAB.game.day + '.');
        if (nightShift && nightShift.reason === 'unstaffed' && away > 600) {
          FAB.UI.toast('Nothing ran while you were out - hire an operator.', 'bad');
        }
      }
    }

    FAB.UI.markDirty();
    requestAnimationFrame(frame);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        FAB.save();
      } else {
        last = 0;   // don't credit a whole background gap to one frame
      }
    });

    window.addEventListener('pagehide', FAB.save);

    // Block the double-tap-to-zoom gesture so fast tapping stays fast.
    document.addEventListener('dblclick', function (ev) { ev.preventDefault(); });

    var isNative = FAB.native && FAB.native.active;
    if (!isNative && 'serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      // A player already running an old build gets the new one on the next load.
      var hadController = !!navigator.serviceWorker.controller;
      var reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!hadController || reloaded) return;   // first install: nothing to refresh
        reloaded = true;
        FAB.save();
        location.reload();
      });
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline play is optional */ });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

})(window.FAB = window.FAB || {});
