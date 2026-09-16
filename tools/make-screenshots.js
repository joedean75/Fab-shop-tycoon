#!/usr/bin/env node
/* Store screenshots at the exact pixel sizes App Store Connect and Play
   Console accept, rendered from the real game at a fixed, staged save so
   reruns produce the same images.

   Usage: node tools/make-screenshots.js [--only phone] */

var fs = require('fs');
var path = require('path');
var http = require('http');

var ROOT = path.join(__dirname, '..');
var WEB = path.join(ROOT, 'fab-shop');
var chromium = loadPlaywright().chromium;

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (err) {
    var globalPath = '/opt/node22/lib/node_modules/playwright';
    if (fs.existsSync(globalPath)) return require(globalPath);
    console.error('make-screenshots: playwright is required (npm install)');
    process.exit(2);
  }
}

/* Physical sizes each store wants, expressed as CSS viewport x scale factor. */
var DEVICES = [
  // Apple: 6.9" and 6.7" iPhone, plus 12.9" iPad (we ship an iPad build).
  { key: 'ios-6.9', out: 'store/appstore/screenshots/iphone-6.9', w: 440, h: 956, dsf: 3 },
  { key: 'ios-6.7', out: 'store/appstore/screenshots/iphone-6.7', w: 430, h: 932, dsf: 3 },
  { key: 'ios-ipad', out: 'store/appstore/screenshots/ipad-12.9', w: 1024, h: 1366, dsf: 2 },
  // Play: phone plus 7" and 10" tablets.
  { key: 'play-phone', out: 'store/play/screenshots/phone', w: 360, h: 640, dsf: 3 },
  { key: 'play-tab7', out: 'store/play/screenshots/tablet-7', w: 600, h: 960, dsf: 2 },
  { key: 'play-tab10', out: 'store/play/screenshots/tablet-10', w: 800, h: 1280, dsf: 2 }
];

/* A staged shop: busy enough to look alive, honest about what the game is. */
function stageState() {
  FAB.reset();
  var g = FAB.game;
  g.money = 18450;
  g.day = 12;
  g.rep = 78;
  g.level = 5;
  g.xp = Math.round(FAB.xpForLevel(5) * 0.55);
  g.wipMax = 5;
  g.dayTime = FAB.TUNE.dayLength * 0.45;
  g.stats = { completed: 41, late: 2, earned: 39800, bestDay: 4200 };

  var setup = { cut: [4, 2], bend: [3, 1], weld: [4, 1], finish: [2, 0] };
  g.stations.forEach(function (st) {
    var s = setup[st.key];
    st.level = s[0];
    st.operators = s[1];
    st.slots = new Array(FAB.slotCount(st)).fill(null);
  });

  FAB.restockBoard();

  // Put real work on the machines at photogenic progress.
  var plan = [
    { product: 'handrail', op: 2, pct: 0.62, quality: 88 },
    { product: 'frame', op: 0, pct: 0.35, quality: 74 },
    { product: 'stringer', op: 1, pct: 0.8, quality: 91 }
  ];
  g.jobs = [];
  plan.forEach(function (p, i) {
    var product = FAB.PRODUCT_BY_KEY[p.product];
    var job = {
      uid: 'shot' + i, product: p.product, pay: product.pay, due: g.day + 2 + i,
      rush: i === 2, opIndex: p.op, progress: product.ops[p.op][1] * p.pct,
      quality: p.quality, at: null
    };
    g.jobs.push(job);
    var st = FAB.station(product.ops[p.op][0]);
    var slot = st.slots.indexOf(null);
    if (slot >= 0) { st.slots[slot] = job.uid; job.at = st.key; }
  });
  // One more waiting on the rack so the queue reads as real.
  g.jobs.push({ uid: 'shotq', product: 'plate', pay: 420, due: g.day + 1, rush: false,
                opIndex: 0, progress: 0, quality: 62, at: null });

  FAB.UI.markDirty();
}

/* The marker sweeps continuously, so park it in the band at the last possible
   moment, and clear any transient toast that would cover the UI. */
function composeFrame() {
  FAB.game.stations.forEach(function (st) {
    st.zone = 0.40;
    st.marker = 0.40 + FAB.TUNE.zoneWidth / 2;
    st.dir = 1;
  });
  var toasts = document.getElementById('toasts');
  if (toasts) toasts.innerHTML = '';
  FAB.UI.frame();
}

function serve(port) {
  var TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
                '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  var server = http.createServer(function (req, res) {
    var rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel === '/') rel = '/index.html';
    var file = path.join(WEB, rel);
    if (!file.startsWith(WEB) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(function (resolve) { server.listen(port, function () { resolve(server); }); });
}

(async function main() {
  var only = process.argv.indexOf('--only') > -1 ? process.argv[process.argv.indexOf('--only') + 1] : null;
  var port = 8912;
  var server = await serve(port);
  var browser = await chromium.launch();
  var made = [];

  for (var i = 0; i < DEVICES.length; i++) {
    var d = DEVICES[i];
    if (only && d.key.indexOf(only) === -1) continue;

    var ctx = await browser.newContext({
      viewport: { width: d.w, height: d.h },
      deviceScaleFactor: d.dsf,
      isMobile: d.key.indexOf('ipad') === -1 && d.key.indexOf('tab') === -1,
      hasTouch: true
    });
    var page = await ctx.newPage();
    await page.goto('http://127.0.0.1:' + port + '/');
    await page.waitForFunction(function () { return window.FAB && FAB.game; });
    await page.evaluate(stageState);
    await page.waitForTimeout(400);

    var dir = path.join(ROOT, d.out);
    fs.mkdirSync(dir, { recursive: true });

    var shots = [
      { name: '1-shop-floor', prep: async function () { await page.click('.tab[data-view="floor"]'); } },
      { name: '2-order-board', prep: async function () { await page.click('.tab[data-view="orders"]'); } },
      { name: '3-upgrades', prep: async function () { await page.click('.tab[data-view="upgrades"]'); } },
      { name: '4-day-report', prep: async function () {
          await page.click('.tab[data-view="floor"]');
          await page.evaluate(function () {
            FAB.UI.showReport({ day: 12, jobs: 6, late: 0, revenue: 4820, overhead: 1180, net: 3640 });
          });
        } }
    ];

    for (var s = 0; s < shots.length; s++) {
      await shots[s].prep();
      await page.waitForTimeout(350);
      await page.evaluate(composeFrame);
      var file = path.join(dir, shots[s].name + '.png');
      await page.screenshot({ path: file, animations: 'disabled' });
      made.push(path.relative(ROOT, file));
    }
    await ctx.close();
  }

  await browser.close();
  server.close();

  console.log('make-screenshots: wrote ' + made.length + ' images');
  made.forEach(function (m) { console.log('  ' + m); });
})().catch(function (err) {
  console.error('make-screenshots failed: ' + err.message);
  process.exit(1);
});
