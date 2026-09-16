#!/usr/bin/env node
/* One version, four places. package.json is the source of truth; this pushes
   it into the Android gradle config, the Xcode project and the service worker
   cache name, so a release can never ship with them out of step.

   Usage:
     node tools/set-version.js            # apply package.json's version
     node tools/set-version.js 1.2.0      # set that version, then apply
     node tools/set-version.js --check    # fail if anything is out of sync */

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var pkgPath = path.join(ROOT, 'package.json');
var pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

var arg = process.argv[2];
var check = arg === '--check';
var version = (!arg || check) ? pkg.version : arg;

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('set-version: expected a semver like 1.2.0, got "' + version + '"');
  process.exit(2);
}

/* Play requires a strictly increasing integer. Packing semver this way keeps
   it monotonic as long as minor and patch stay under 100. */
var parts = version.split('.').map(Number);
var versionCode = parts[0] * 10000 + parts[1] * 100 + parts[2];

var drift = [];

function edit(rel, replacements) {
  var full = path.join(ROOT, rel);
  var before = fs.readFileSync(full, 'utf8');
  var after = before;
  replacements.forEach(function (r) {
    if (!r.find.test(after)) {
      drift.push(rel + ': could not find ' + r.label);
      return;
    }
    after = after.replace(r.find, r.replace);
  });
  if (after !== before) {
    if (check) drift.push(rel + ' is out of sync with version ' + version);
    else fs.writeFileSync(full, after);
  }
  return after !== before;
}

if (!check && pkg.version !== version) {
  pkg.version = version;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

edit('android/app/build.gradle', [
  { label: 'versionCode', find: /versionCode\s+\d+/, replace: 'versionCode ' + versionCode },
  { label: 'versionName', find: /versionName\s+"[^"]*"/, replace: 'versionName "' + version + '"' }
]);

edit('ios/App/App.xcodeproj/project.pbxproj', [
  { label: 'MARKETING_VERSION', find: /MARKETING_VERSION = [^;]+;/g,
    replace: 'MARKETING_VERSION = ' + version + ';' },
  { label: 'CURRENT_PROJECT_VERSION', find: /CURRENT_PROJECT_VERSION = [^;]+;/g,
    replace: 'CURRENT_PROJECT_VERSION = ' + versionCode + ';' }
]);

// The worker cache name doubles as the web build stamp.
edit('fab-shop/sw.js', [
  { label: 'VERSION', find: /var VERSION = '[^']*';/, replace: "var VERSION = 'v" + version + "';" }
]);

// The version players can read in-app, for bug reports.
edit('fab-shop/index.html', [
  { label: 'app-version', find: /id="app-version">v[^<]*</,
    replace: 'id="app-version">v' + version + '<' }
]);

if (check) {
  if (drift.length) {
    drift.forEach(function (d) { console.error('  FAIL: ' + d); });
    console.error('set-version: run "npm run version:set" to sync');
    process.exit(1);
  }
  console.log('set-version: all targets match ' + version + ' (versionCode ' + versionCode + ')');
} else {
  drift.forEach(function (d) { console.error('  warning: ' + d); });
  console.log('set-version: ' + version + ' (Android versionCode ' + versionCode + ')');
  console.log('  android/app/build.gradle, ios project.pbxproj, fab-shop/sw.js, package.json');
}
