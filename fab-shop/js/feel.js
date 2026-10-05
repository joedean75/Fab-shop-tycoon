/* Sound and touch feedback. Everything is synthesized with Web Audio, so the
   bundle carries no audio files, and haptics go through the native plugin
   where there is one - iOS has no navigator.vibrate at all, so without the
   plugin an iPhone never buzzed.

   Preferences live outside the save: resetting the shop or selling up should
   not turn the sound back on. */
(function (FAB) {
  'use strict';

  var PREFS_KEY = 'fabshop.prefs.v1';
  var prefs = { sound: true, haptics: true };
  var ctx = null;

  try {
    var stored = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
    if (stored && typeof stored === 'object') {
      if (typeof stored.sound === 'boolean') prefs.sound = stored.sound;
      if (typeof stored.haptics === 'boolean') prefs.haptics = stored.haptics;
    }
  } catch (err) { /* private mode: defaults it is */ }

  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (err) { /* ignore */ }
  }

  /* Feedback fired before the player has touched the page - a goal paid out
     by the night shift at launch, say - would be refused by the browser
     (with a console error for vibrate). There is nobody to hear it yet. */
  function touched() {
    var ua = navigator.userActivation;
    return !ua || ua.hasBeenActive;
  }

  function plugin(name) {
    var cap = window.Capacitor;
    if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return null;
    return (cap.Plugins && cap.Plugins[name]) || null;
  }

  /* Browsers only allow audio to start inside a user gesture, so the context
     is created on the first touch rather than at load. 'ambient' asks iOS to
     respect the silent switch and to mix with whatever the player already
     has playing instead of stopping their music. */
  function audio() {
    if (!prefs.sound || !touched()) return null;
    if (!ctx) {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      try {
        if (navigator.audioSession) navigator.audioSession.type = 'ambient';
        ctx = new Ctor();
      } catch (err) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(function () {});
    return ctx;
  }

  // One enveloped note. Short attack and an exponential tail keep it clicky
  // rather than beepy, which suits a machine shop.
  function note(freq, start, length, type, volume, slideTo) {
    var a = audio();
    if (!a) return;
    var t0 = a.currentTime + (start || 0);
    var osc = a.createOscillator();
    var gain = a.createGain();
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + length);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume || 0.08, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
    osc.connect(gain);
    gain.connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + length + 0.02);
  }

  function buzz(kind) {
    if (!prefs.haptics) return;
    var h = plugin('Haptics');
    if (h) {
      var p;
      if (kind === 'success' || kind === 'warning') {
        p = h.notification({ type: kind === 'success' ? 'SUCCESS' : 'WARNING' });
      } else {
        p = h.impact({ style: kind === 'heavy' ? 'HEAVY' : (kind === 'medium' ? 'MEDIUM' : 'LIGHT') });
      }
      if (p && p.catch) p.catch(function () {});
      return;
    }
    if (navigator.vibrate && touched()) {
      var ms = { light: 8, medium: 14, heavy: 24, success: [12, 40, 18], warning: [30, 30, 30] }[kind];
      try { navigator.vibrate(ms || 10); } catch (err) { /* ignore */ }
    }
  }

  FAB.feel = {
    prefs: function () { return { sound: prefs.sound, haptics: prefs.haptics }; },

    set: function (key, on) {
      if (!(key in prefs)) return;
      prefs[key] = !!on;
      savePrefs();
      if (key === 'sound' && on) FAB.feel.hit('good');   // let them hear it is back
      if (key === 'haptics' && on) buzz('medium');
    },

    hit: function (result) {
      if (result === 'perfect') {
        note(660, 0, 0.07, 'sine', 0.09);
        note(990, 0.045, 0.09, 'sine', 0.07);
        buzz('medium');
      } else if (result === 'good') {
        note(440, 0, 0.06, 'triangle', 0.07);
        buzz('light');
      } else {
        note(150, 0, 0.05, 'square', 0.035, 110);
      }
    },

    ship: function () {
      note(1320, 0, 0.06, 'square', 0.035);
      note(1760, 0.05, 0.14, 'triangle', 0.06);
      buzz('success');
    },

    bad: function () {
      note(320, 0, 0.12, 'sawtooth', 0.04, 200);
      buzz('warning');
    },

    levelUp: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        note(f, i * 0.08, 0.16, 'triangle', 0.07);
      });
      buzz('heavy');
    },

    reward: function () {
      [784, 1047, 1319].forEach(function (f, i) {
        note(f, i * 0.06, 0.12, 'sine', 0.07);
      });
      buzz('success');
    },

    tick: function () { buzz('light'); }
  };

})(window.FAB = window.FAB || {});
