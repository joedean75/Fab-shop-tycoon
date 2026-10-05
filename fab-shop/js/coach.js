/* First-run tutorial. A bubble points at the one thing to do next and moves
   on when the player has done it - nothing is blocked, and every step can be
   skipped. Steps advance on what actually happened in the game, so a player
   who races ahead is never told to do something they already did. */
(function (FAB) {
  'use strict';

  var DONE_KEY = 'fabshop.tutorial.v1';
  var active = false;
  var stepIndex = 0;
  var mark = {};          // state captured when a step began
  var taps = 0;
  var bubble, text, nextBtn, lastTarget = null;

  function $(sel) { return document.querySelector(sel); }
  function viewActive(name) {
    var v = document.getElementById('view-' + name);
    return !!(v && v.classList.contains('is-active'));
  }
  function anyModalOpen() {
    return ['report', 'nightshift', 'event', 'manual'].some(function (id) {
      var n = document.getElementById(id);
      return n && !n.classList.contains('hidden');
    });
  }
  // The whole machine card, not just its timing bar: the bubble must sit
  // clear of the job it is talking about, and the card is what takes taps.
  function busyStation() {
    return document.querySelector('.station.is-hot');
  }

  var STEPS = [
    {
      text: 'Work comes in on the order board. Open <b>Orders</b>.',
      target: function () { return $('.tab[data-view="orders"]'); },
      done: function () { return viewActive('orders') || FAB.game.jobs.length > 0; }
    },
    {
      text: 'Tap <b>Take</b> to put a job on your floor.',
      target: function () { return $('button[data-accept]:not([disabled])'); },
      done: function () { return FAB.game.jobs.length > 0; }
    },
    {
      text: 'Back to the <b>Floor</b> - the job is already on a machine.',
      target: function () { return $('.tab[data-view="floor"]'); },
      done: function () { return viewActive('floor'); }
    },
    {
      text: 'Tap the machine as the orange marker crosses the <b>green band</b>. ' +
            'A perfect hit does four times the work and raises quality.',
      target: busyStation,
      begin: function () { taps = 0; },
      done: function () { return taps >= 4; }
    },
    {
      text: 'When an operation finishes the job moves itself to the next machine ' +
            'on its route. Keep it moving - it ships after the last one.',
      target: busyStation,
      begin: function () { mark.shipped = FAB.game.stats.completed; },
      done: function () { return FAB.game.stats.completed > mark.shipped; }
    },
    {
      text: 'Shipped! Spend it under <b>Upgrades</b>. The goal above the machines ' +
            'pays a bonus, and <b>?</b> explains every number in the game.',
      target: function () { return $('#goal:not(.hidden)'); },
      button: 'Got it'
    }
  ];

  function build() {
    if (bubble) return;
    bubble = document.createElement('div');
    bubble.id = 'coach';
    bubble.className = 'coach hidden';
    bubble.setAttribute('role', 'status');
    bubble.innerHTML =
      '<p class="coach-text"></p>' +
      '<div class="coach-actions">' +
        '<button type="button" class="coach-skip">Skip tutorial</button>' +
        '<button type="button" class="btn btn-small coach-next hidden"></button>' +
      '</div>';
    document.body.appendChild(bubble);
    text = bubble.querySelector('.coach-text');
    nextBtn = bubble.querySelector('.coach-next');
    bubble.querySelector('.coach-skip').addEventListener('click', finish);
    nextBtn.addEventListener('click', function () { advance(); });
  }

  function setTarget(node) {
    if (lastTarget === node) return;
    if (lastTarget) lastTarget.classList.remove('coach-target');
    if (node) node.classList.add('coach-target');
    lastTarget = node;
  }

  function enter(i) {
    stepIndex = i;
    var step = STEPS[i];
    if (!step) { finish(); return; }
    if (step.begin) step.begin();
    text.innerHTML = step.text;
    nextBtn.classList.toggle('hidden', !step.button);
    nextBtn.textContent = step.button || '';
  }

  function advance() { enter(stepIndex + 1); }

  function finish() {
    active = false;
    setTarget(null);
    if (bubble) bubble.classList.add('hidden');
    try { localStorage.setItem(DONE_KEY, '1'); } catch (err) { /* ignore */ }
  }

  // Keep the bubble clear of its target: above it in the lower half of the
  // screen, below it in the upper half.
  function place(node) {
    var vh = window.innerHeight;
    bubble.style.top = '';
    bubble.style.bottom = '';
    if (!node) {
      bubble.style.top = Math.round(vh * 0.32) + 'px';
      return;
    }
    var r = node.getBoundingClientRect();
    if (r.top + r.height / 2 > vh / 2) {
      bubble.style.bottom = Math.round(vh - r.top + 10) + 'px';
    } else {
      bubble.style.top = Math.round(r.bottom + 10) + 'px';
    }
  }

  FAB.coach = {
    seen: function () {
      try { return localStorage.getItem(DONE_KEY) === '1'; } catch (err) { return true; }
    },

    start: function () {
      build();
      active = true;
      enter(0);
    },

    stop: finish,
    isActive: function () { return active; },
    step: function () { return active ? stepIndex : -1; },

    tapped: function () { taps += 1; },

    frame: function () {
      if (!active || !FAB.game) return;
      var step = STEPS[stepIndex];
      if (step.done && step.done()) { advance(); if (!active) return; step = STEPS[stepIndex]; }

      if (anyModalOpen()) {
        bubble.classList.add('hidden');
        setTarget(null);
        return;
      }
      var node = step.target ? step.target() : null;
      setTarget(node);
      bubble.classList.remove('hidden');
      place(node);
    }
  };

})(window.FAB = window.FAB || {});
