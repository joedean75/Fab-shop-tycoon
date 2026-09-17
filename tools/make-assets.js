#!/usr/bin/env node
/* Generate every store/native image slot from the SVG sources in assets/src.
   Chromium is the rasterizer (no ImageMagick/librsvg needed), so this runs
   anywhere Playwright runs. Rerunnable and deterministic.

   Usage: node tools/make-assets.js */

var fs = require('fs');
var path = require('path');
var chromium = loadPlaywright().chromium;

/* Playwright may be a local devDependency or, in some sandboxes, only global. */
function loadPlaywright() {
  try {
    return require('playwright');
  } catch (err) {
    var globalPath = '/opt/node22/lib/node_modules/playwright';
    if (require('fs').existsSync(globalPath)) return require(globalPath);
    console.error('make-assets: playwright is required (npm install)');
    process.exit(2);
  }
}

var ROOT = path.join(__dirname, '..');
var SRC = path.join(ROOT, 'assets', 'src');
var written = [];

function out(rel) {
  var full = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  return full;
}

// Android density buckets. Launcher icons are 48dp, adaptive foregrounds 108dp.
var DENSITIES = [
  { dir: 'mdpi', scale: 1 },
  { dir: 'hdpi', scale: 1.5 },
  { dir: 'xhdpi', scale: 2 },
  { dir: 'xxhdpi', scale: 3 },
  { dir: 'xxxhdpi', scale: 4 }
];

async function render(page, svgPath, width, height, target, opts) {
  opts = opts || {};
  var svg = fs.readFileSync(svgPath, 'utf8');
  await page.setViewportSize({ width: Math.round(width), height: Math.round(height) });
  await page.setContent(
    '<!doctype html><html><head><meta charset="utf-8"><style>' +
    'html,body{margin:0;padding:0;width:100%;height:100%;' +
    (opts.transparent ? 'background:transparent;' : 'background:#14181d;') + '}' +
    'svg{display:block;width:100%;height:100%;}' +
    '</style></head><body>' + svg + '</body></html>',
    { waitUntil: 'load' }
  );
  // Catch art that overruns its canvas (clipped store text is a rejection).
  var overflow = await page.evaluate(function () {
    var svg = document.querySelector('svg');
    if (!svg || !svg.getBBox) return 0;
    var box = svg.getBBox();
    var vb = svg.viewBox.baseVal;
    if (!vb || !vb.width) return 0;
    return Math.max(0, Math.round((box.x + box.width) - (vb.x + vb.width)));
  });
  if (overflow > 1) {
    throw new Error(path.basename(svgPath) + ': content overflows the canvas by ' +
      overflow + 'px - it would be clipped');
  }
  await page.screenshot({ path: target, omitBackground: !!opts.transparent });
  written.push(path.relative(ROOT, target) + '  ' + Math.round(width) + 'x' + Math.round(height));
}

(async function main() {
  var browser = await chromium.launch();
  var page = await browser.newPage({ deviceScaleFactor: 1 });

  var iconSvg = path.join(SRC, 'icon.svg');
  var fgSvg = path.join(SRC, 'icon-foreground.svg');
  var splashSvg = path.join(SRC, 'splash.svg');

  /* ---- Android launcher icons ---- */
  for (var i = 0; i < DENSITIES.length; i++) {
    var d = DENSITIES[i];
    var legacy = Math.round(48 * d.scale);
    var fg = Math.round(108 * d.scale);
    await render(page, iconSvg, legacy, legacy,
      out('android/app/src/main/res/mipmap-' + d.dir + '/ic_launcher.png'));
    await render(page, iconSvg, legacy, legacy,
      out('android/app/src/main/res/mipmap-' + d.dir + '/ic_launcher_round.png'));
    await render(page, fgSvg, fg, fg,
      out('android/app/src/main/res/mipmap-' + d.dir + '/ic_launcher_foreground.png'),
      { transparent: true });
  }

  /* ---- Android splash (portrait + landscape per density) ---- */
  var SPLASH = [
    { dir: 'drawable', w: 480, h: 800 },
    { dir: 'drawable-port-mdpi', w: 320, h: 480 },
    { dir: 'drawable-port-hdpi', w: 480, h: 800 },
    { dir: 'drawable-port-xhdpi', w: 720, h: 1280 },
    { dir: 'drawable-port-xxhdpi', w: 960, h: 1600 },
    { dir: 'drawable-port-xxxhdpi', w: 1280, h: 1920 },
    { dir: 'drawable-land-mdpi', w: 480, h: 320 },
    { dir: 'drawable-land-hdpi', w: 800, h: 480 },
    { dir: 'drawable-land-xhdpi', w: 1280, h: 720 },
    { dir: 'drawable-land-xxhdpi', w: 1600, h: 960 },
    { dir: 'drawable-land-xxxhdpi', w: 1920, h: 1280 }
  ];
  for (var s = 0; s < SPLASH.length; s++) {
    await render(page, splashSvg, SPLASH[s].w, SPLASH[s].h,
      out('android/app/src/main/res/' + SPLASH[s].dir + '/splash.png'));
  }

  /* ---- iOS app icon (single 1024 slot, Xcode 14+) ---- */
  await render(page, iconSvg, 1024, 1024,
    out('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'));

  /* ---- iOS splash (one square, three scale slots) ---- */
  ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'].forEach(function () {});
  for (var k = 0; k < 3; k++) {
    var names = ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'];
    await render(page, splashSvg, 2732, 2732,
      out('ios/App/App/Assets.xcassets/Splash.imageset/' + names[k]));
  }

  /* ---- Store listing art ----
     Play specifies the 512 icon as a 32-bit PNG *with* an alpha channel, while
     Apple rejects an icon that has one. Rendering the Play icon transparently
     leaves its rounded corners clear, which both satisfies Play and is what it
     masks for anyway; the Apple icon stays opaque RGB. */
  await render(page, iconSvg, 512, 512, out('store/play/icon-512.png'),
    { transparent: true });                                                        // Play listing icon
  await render(page, iconSvg, 1024, 1024, out('store/appstore/icon-1024.png'));    // App Store marketing icon
  await render(page, path.join(SRC, 'feature-graphic.svg'), 1024, 500,
    out('store/play/feature-graphic-1024x500.png'));                               // Play feature graphic

  /* ---- Web favicon PNG fallback ---- */
  await render(page, iconSvg, 512, 512, out('fab-shop/icon-512.png'));

  await browser.close();

  /* The two stores want opposite things from an icon, so check rather than
     hope: an 8-bit colour-type byte of 6 is RGBA, 2 is RGB. */
  [
    { file: 'store/play/icon-512.png', want: 6, label: 'Play icon (needs alpha)' },
    { file: 'store/appstore/icon-1024.png', want: 2, label: 'App Store icon (must not have alpha)' },
    { file: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', want: 2,
      label: 'iOS app icon (must not have alpha)' }
  ].forEach(function (check) {
    var head = fs.readFileSync(path.join(ROOT, check.file)).subarray(0, 26);
    var colorType = head[25];
    if (colorType !== check.want) {
      throw new Error(check.label + ': PNG colour type ' + colorType + ', expected ' + check.want);
    }
  });

  console.log('make-assets: wrote ' + written.length + ' files');
  written.forEach(function (w) { console.log('  ' + w); });
})().catch(function (err) {
  console.error('make-assets failed: ' + err.message);
  process.exit(1);
});
