#!/usr/bin/env node
/* Store listing fields have hard character limits; exceeding one is rejected
   or silently truncated at upload time, which is a bad way to find out.
   Also checks that the screenshot counts and sizes each store requires are
   actually present.

   Usage: node tools/check-store-metadata.js */

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var problems = [];
var checked = 0;

/* field limits per store documentation */
var LIMITS = [
  { file: 'store/play/listing/en-US/title.txt', max: 30, label: 'Play title' },
  { file: 'store/play/listing/en-US/short-description.txt', max: 80, label: 'Play short description' },
  { file: 'store/play/listing/en-US/full-description.txt', max: 4000, label: 'Play full description' },
  { file: 'store/play/whatsnew/whatsnew-en-US', max: 500, label: 'Play release notes' },
  { file: 'store/appstore/listing/en-US/name.txt', max: 30, label: 'App Store name' },
  { file: 'store/appstore/listing/en-US/subtitle.txt', max: 30, label: 'App Store subtitle' },
  { file: 'store/appstore/listing/en-US/promotional-text.txt', max: 170, label: 'App Store promotional text' },
  { file: 'store/appstore/listing/en-US/keywords.txt', max: 100, label: 'App Store keywords' },
  { file: 'store/appstore/listing/en-US/description.txt', max: 4000, label: 'App Store description' }
];

LIMITS.forEach(function (item) {
  var full = path.join(ROOT, item.file);
  if (!fs.existsSync(full)) {
    problems.push('missing: ' + item.file);
    return;
  }
  checked++;
  var text = fs.readFileSync(full, 'utf8').replace(/\n+$/, '');
  var len = Array.from(text).length;   // count characters, not UTF-16 units
  var status = len > item.max ? 'OVER' : 'ok  ';
  if (len > item.max) {
    problems.push(item.label + ': ' + len + '/' + item.max + ' characters (' +
      (len - item.max) + ' too many)');
  }
  console.log('  ' + status + '  ' + item.label + '  ' + len + '/' + item.max);
});

/* In-app products: console field limits, and the ids the game asks for. A
   product whose id differs by one character simply never loads, and the
   store panel shows no price - so check it here instead. */
var productsFile = path.join(ROOT, 'store/products.json');
if (!fs.existsSync(productsFile)) {
  problems.push('missing: store/products.json');
} else {
  var catalog = JSON.parse(fs.readFileSync(productsFile, 'utf8')).products;
  var storeJs = fs.readFileSync(path.join(ROOT, 'fab-shop/js/store.js'), 'utf8');
  var prefix = (/ID_PREFIX = '([^']+)'/.exec(storeJs) || [])[1];
  var gameKeys = [];
  storeJs.replace(/^\s+key: '([a-z_]+)',$/gm, function (m, k) { gameKeys.push(k); });
  var PRODUCT_LIMITS = [
    ['name', 30, 'App Store IAP display name'],
    ['apple_description', 45, 'App Store IAP description'],
    ['name', 55, 'Play product name'],
    ['play_description', 200, 'Play product description']
  ];
  catalog.forEach(function (p) {
    checked++;
    if (p.id !== prefix + p.key) problems.push('product ' + p.key + ': id ' + p.id + ' is not ' + prefix + p.key);
    if (gameKeys.indexOf(p.key) < 0) problems.push('product ' + p.key + ' is not sold by fab-shop/js/store.js');
    if (!/^[a-z0-9][a-z0-9._]*$/.test(p.id)) problems.push('product ' + p.id + ': Play ids allow only a-z, 0-9, _ and .');
    PRODUCT_LIMITS.forEach(function (lim) {
      var len = Array.from(p[lim[0]] || '').length;
      if (!len || len > lim[1]) problems.push(p.key + ' ' + lim[2] + ': ' + len + '/' + lim[1]);
    });
    console.log('  ok    product ' + p.id);
  });
  gameKeys.forEach(function (k) {
    if (!catalog.some(function (p) { return p.key === k; })) problems.push('store.js sells ' + k + ' but store/products.json has no entry');
  });
}

/* PNG dimensions straight from the IHDR chunk - no image library needed. */
function pngSize(file) {
  var fd = fs.openSync(file, 'r');
  var buf = Buffer.alloc(26);
  fs.readSync(fd, buf, 0, 26, 0);
  fs.closeSync(fd);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

var SHOTS = [
  { dir: 'store/appstore/screenshots/iphone-6.9', w: 1320, h: 2868, min: 1, label: 'iPhone 6.9"' },
  { dir: 'store/appstore/screenshots/iphone-6.7', w: 1290, h: 2796, min: 1, label: 'iPhone 6.7"' },
  { dir: 'store/appstore/screenshots/ipad-12.9', w: 2048, h: 2732, min: 1, label: 'iPad 12.9"' },
  { dir: 'store/play/screenshots/phone', w: 1080, h: 1920, min: 2, label: 'Play phone' },
  { dir: 'store/play/screenshots/tablet-7', w: 1200, h: 1920, min: 1, label: 'Play 7" tablet' },
  { dir: 'store/play/screenshots/tablet-10', w: 1600, h: 2560, min: 1, label: 'Play 10" tablet' }
];

SHOTS.forEach(function (shot) {
  var dir = path.join(ROOT, shot.dir);
  if (!fs.existsSync(dir)) {
    problems.push('missing screenshots: ' + shot.dir + ' (run npm run shots)');
    return;
  }
  var files = fs.readdirSync(dir).filter(function (f) { return /\.png$/.test(f); });
  if (files.length < shot.min) {
    problems.push(shot.label + ': ' + files.length + ' screenshots, needs at least ' + shot.min);
  }
  files.forEach(function (f) {
    var size = pngSize(path.join(dir, f));
    if (size.width !== shot.w || size.height !== shot.h) {
      problems.push(shot.dir + '/' + f + ' is ' + size.width + 'x' + size.height +
        ', store expects ' + shot.w + 'x' + shot.h);
    }
  });
  console.log('  ok    ' + shot.label + '  ' + files.length + ' shots @ ' + shot.w + 'x' + shot.h);
});

/* Store art that must exist before a listing can be submitted. */
[
  { file: 'store/play/icon-512.png', w: 512, h: 512, label: 'Play listing icon' },
  { file: 'store/play/feature-graphic-1024x500.png', w: 1024, h: 500, label: 'Play feature graphic' },
  { file: 'store/appstore/icon-1024.png', w: 1024, h: 1024, label: 'App Store icon' }
].forEach(function (art) {
  var full = path.join(ROOT, art.file);
  if (!fs.existsSync(full)) { problems.push('missing: ' + art.file); return; }
  var size = pngSize(full);
  if (size.width !== art.w || size.height !== art.h) {
    problems.push(art.label + ' is ' + size.width + 'x' + size.height + ', expected ' + art.w + 'x' + art.h);
  }
  console.log('  ok    ' + art.label + '  ' + size.width + 'x' + size.height);
});

/* Placeholders must not reach a live listing. Scanned across submitted
   material only - store/README.md documents the placeholder on purpose. */
['store/play/listing', 'store/play/whatsnew', 'store/appstore/listing',
 'store/appstore/app-privacy.md', 'store/appstore/review-notes.md',
 'store/play/data-safety.md', 'fab-shop'].forEach(function (dir) {
  var target = path.join(ROOT, dir);
  var files = fs.existsSync(target) && fs.statSync(target).isDirectory()
    ? walk(target) : (fs.existsSync(target) ? [target] : []);
  files.forEach(function (file) {
    if (!/\.(txt|md|html)$/.test(file)) return;
    var text = fs.readFileSync(file, 'utf8');
    if (text.indexOf('PLACEHOLDER_') !== -1) {
      problems.push('placeholder left in ' + path.relative(ROOT, file) +
        ' - fill it in before submitting');
    }
  });
});

function walk(dir, out) {
  out = out || [];
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir).forEach(function (entry) {
    var full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  });
  return out;
}

console.log('check-store-metadata: ' + checked + ' text fields checked');
if (problems.length) {
  problems.forEach(function (p) { console.error('  FAIL: ' + p); });
  process.exit(1);
}
console.log('check-store-metadata: listings are within store limits');
