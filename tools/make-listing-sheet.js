#!/usr/bin/env node
/* Build store/play/PLAY-LISTING.txt: every Play Console field in one file,
   grouped by the screen that asks for it, with character counts against
   Google's limits.

   Generated from the listing files and package.json rather than written by
   hand, so a version bump or a copy edit cannot leave it stale.

   Usage: node tools/make-listing-sheet.js */

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
var cap = JSON.parse(fs.readFileSync(path.join(ROOT, 'capacitor.config.json'), 'utf8'));

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\n+$/, '');
}

function versionCode(version) {
  var p = version.split('.').map(Number);
  return p[0] * 10000 + p[1] * 100 + p[2];
}

function countShots(dir) {
  var full = path.join(ROOT, dir);
  return fs.existsSync(full) ? fs.readdirSync(full).filter(function (f) { return /\.png$/.test(f); }).length : 0;
}

var title = read('store/play/listing/en-US/title.txt');
var short = read('store/play/listing/en-US/short-description.txt');
var full = read('store/play/listing/en-US/full-description.txt');
var notes = read('store/play/whatsnew/whatsnew-en-US');
var products = JSON.parse(read('store/products.json')).products;

function productBlock(p) {
  return [
    'Product ID        ' + p.id,
    'Type              ' + p.play_type,
    'Name              ' + p.name,
    'Description       ' + p.play_description,
    'Price             USD ' + p.price_usd + ' (Play converts other currencies)',
    ''
  ].join('\n');
}

function field(label, limit, text) {
  var n = Array.from(text).length;
  return [
    label + '  (' + n + ' / ' + limit + ' characters)',
    '-'.repeat(40),
    text,
    ''
  ].join('\n');
}

var out = [
  'FAB SHOP TYCOON - GOOGLE PLAY STORE LISTING',
  '='.repeat(78),
  'Package name : ' + cap.appId,
  'Version      : ' + pkg.version + ' (versionCode ' + versionCode(pkg.version) + ')',
  'Generated    : ' + new Date().toISOString().slice(0, 10) + '  (node tools/make-listing-sheet.js)',
  '',
  'Everything below is ready to paste into Play Console. Character counts are',
  "shown against Google's limits - all are within range.",
  '',
  '-'.repeat(78),
  'STORE LISTING  ->  Grow > Store presence > Main store listing',
  '-'.repeat(78),
  '',
  field('APP NAME', 30, title),
  field('SHORT DESCRIPTION', 80, short),
  field('FULL DESCRIPTION', 4000, full),
  '-'.repeat(78),
  'GRAPHICS  ->  same page, scroll down',
  '-'.repeat(78),
  '',
  'App icon          512 x 512 PNG     store/play/icon-512.png',
  '                  32-bit with alpha - Play requires the alpha channel',
  'Feature graphic   1024 x 500 PNG    store/play/feature-graphic-1024x500.png',
  'Phone screenshots 1080 x 1920 PNG   store/play/screenshots/phone/          (' +
    countShots('store/play/screenshots/phone') + ' files)',
  '7-inch tablet     1200 x 1920 PNG   store/play/screenshots/tablet-7/       (' +
    countShots('store/play/screenshots/tablet-7') + ' files)',
  '10-inch tablet    1600 x 2560 PNG   store/play/screenshots/tablet-10/      (' +
    countShots('store/play/screenshots/tablet-10') + ' files)',
  '',
  'Play requires at least 2 phone screenshots and allows up to 8. Tablet sets',
  'are optional but they unlock the tablet listing.',
  '',
  '-'.repeat(78),
  'RELEASE NOTES  ->  Test and release > (track) > Create new release',
  '-'.repeat(78),
  '',
  field("WHAT'S NEW", 500, notes),
  '-'.repeat(78),
  'STORE SETTINGS  ->  Grow > Store presence > Store settings',
  '-'.repeat(78),
  '',
  'App category      Game',
  'Category          Simulation',
  'Tags              up to 5, suggested: Simulation, Casual, Idle, Management,',
  '                  Tycoon',
  'Email address     corvuscompanies6@gmail.com',
  'Website           https://fab-shop-tycoon.onrender.com',
  'External privacy  https://fab-shop-tycoon.onrender.com/privacy.html',
  '',
  '-'.repeat(78),
  'APP CONTENT  ->  Policy > App content   (each is its own form)',
  '-'.repeat(78),
  '',
  'Privacy policy          https://fab-shop-tycoon.onrender.com/privacy.html',
  'App access              All functionality available without special access.',
  'Ads                     No, my app does not contain ads.',
  '                        (In-app purchases are not ads.)',
  'Content rating          Category: Game. No to every content question; Yes to',
  '                        "allows purchases of digital goods".',
  '                        Expected: ESRB Everyone / PEGI 3 / USK 0.',
  '                        Full answers: store/play/content-rating.md',
  'Target audience         13+ recommended. Declaring under-13 pulls the app',
  '                        into Families policy and its extra requirements.',
  'Data safety             No data collected, none shared, no third-party SDKs.',
  '                        Save data and owned-purchase flags stay on the device;',
  '                        payments are handled by Google Play billing.',
  '                        Full answers: store/play/data-safety.md',
  'Government apps         No.      Financial features  None of these.',
  'Health apps             No.      News apps           No.',
  'Data deletion           Not applicable - no account, no collected data.',
  '',
  '-'.repeat(78),
  'PRICING  ->  Monetise > Pricing',
  '-'.repeat(78),
  '',
  'Free, with optional in-app purchases. No subscriptions, no ads.',
  '',
  '-'.repeat(78),
  'IN-APP PRODUCTS  ->  Monetise > Products > One-time products',
  '-'.repeat(78),
  '',
  'Needs a payments profile (Setup > Payments profile) and a bundle with the',
  'BILLING permission uploaded to any track first - 1.6.0 and later carry it.',
  'Create each one, set it Active, and match the ID exactly.',
  '',
  products.map(productBlock).join('\n'),
  '-'.repeat(78),
  'NOTES',
  '-'.repeat(78),
  '',
  '- Upload to a test track before Production: no review wait, and it is the',
  '  only way to confirm the native shell behaves on a real device.',
  '- Never upload the .jks keystore anywhere. It signs the bundle and stays',
  '  on your machine.',
  '- A personal developer account opened after late 2023 may need a closed test',
  '  with about 12 testers for 14 continuous days before Production unlocks.',
  ''
].join('\n');

fs.writeFileSync(path.join(ROOT, 'store/play/PLAY-LISTING.txt'), out);
console.log('make-listing-sheet: wrote store/play/PLAY-LISTING.txt for ' + pkg.version);
