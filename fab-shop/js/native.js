/* Native shell integration (Capacitor). No-ops in a browser, so the same
   bundle ships to the web, the App Store and Play.
   Plugins are reached through the injected Capacitor global rather than
   imports, because this project has no bundler. */
(function (FAB) {
  'use strict';

  var cap = window.Capacitor;
  var native = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());

  FAB.native = {
    active: native,
    platform: native && cap.getPlatform ? cap.getPlatform() : 'web'
  };

  if (!native) return;

  document.documentElement.classList.add('is-native', 'is-' + FAB.native.platform);

  var plugins = cap.Plugins || {};

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    // Light glyphs over the dark shop-floor chrome.
    if (plugins.StatusBar) {
      plugins.StatusBar.setStyle({ style: 'DARK' }).catch(function () {});
      if (FAB.native.platform === 'android') {
        plugins.StatusBar.setBackgroundColor({ color: '#14181d' }).catch(function () {});
      }
    }

    // Hold the splash until the first frame has actually painted, so players
    // never see an empty shop floor.
    if (plugins.SplashScreen) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          plugins.SplashScreen.hide({ fadeOutDuration: 250 }).catch(function () {});
        });
      });
    }

    if (plugins.App) {
      // Android back button: close the nightly report if it is up, otherwise
      // background the app. Never exit out from under an in-progress day.
      plugins.App.addListener('backButton', function () {
        var report = document.getElementById('report');
        if (report && !report.classList.contains('hidden')) {
          report.classList.add('hidden');
          return;
        }
        var floorTab = document.querySelector('.tab[data-view="floor"]');
        if (floorTab && !floorTab.classList.contains('is-active')) {
          floorTab.click();
          return;
        }
        if (FAB.save) FAB.save();
        plugins.App.minimizeApp().catch(function () {});
      });

      // Leaving the app must not lose the shop.
      plugins.App.addListener('pause', function () { if (FAB.save) FAB.save(); });
      plugins.App.addListener('appStateChange', function (state) {
        if (state && state.isActive === false && FAB.save) FAB.save();
      });
    }
  });

})(window.FAB = window.FAB || {});
