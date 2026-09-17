#!/usr/bin/env node
/* Pre-deploy check for the fab-shop static bundle.
   Catches the failures that only show up once a site is live: a file that
   never got committed, a root-absolute path that breaks under a subpath host,
   a service worker caching a file that no longer exists, a broken manifest.
   Exits non-zero so a CI deploy stops before it publishes something broken. */

var fs = require('fs');
var path = require('path');
var execFileSync = require('child_process').execFileSync;

var ROOT = path.join(__dirname, '..', 'fab-shop');
var problems = [];
var notes = [];

function fail(msg) { problems.push(msg); }
function note(msg) { notes.push(msg); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }

function walk(dir, out) {
  out = out || [];
  fs.readdirSync(dir).forEach(function (entry) {
    var full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else out.push(path.relative(ROOT, full).split(path.sep).join('/'));
  });
  return out;
}

if (!fs.existsSync(ROOT)) {
  console.error('verify-deploy: no fab-shop directory at ' + ROOT);
  process.exit(1);
}

var files = walk(ROOT);
var html = read('index.html');

/* 1. Every asset index.html references must exist. */
var refs = [];
html.replace(/(?:src|href)="([^"]+)"/g, function (_, ref) { refs.push(ref); return _; });
refs.filter(function (ref) {
  return !/^(https?:)?\/\//.test(ref) && ref.indexOf('data:') !== 0 && ref.charAt(0) !== '#';
}).forEach(function (ref) {
  var clean = ref.replace(/^\.\//, '').split('?')[0];
  if (!exists(clean)) fail('index.html references a missing file: ' + ref);
});

/* 2. Nothing may be root-absolute: the game has to work under /fab-shop/ on
      GitHub Pages as well as at a domain root. */
['index.html', 'css/style.css', 'js/main.js', 'sw.js', 'manifest.json'].forEach(function (rel) {
  if (!exists(rel)) { fail('required file is missing from the bundle: ' + rel); return; }
  var body = read(rel);
  var bad = body.match(/(?:src|href)="\/[^\/]|url\(\s*\/[^\/]|"start_url"\s*:\s*"\//g);
  if (bad) fail(rel + ' uses a root-absolute path (' + bad[0].trim() + ') - breaks subpath hosting');
});

/* 3. Manifest must parse and point at real icons. */
var manifest = null;
if (exists('manifest.json')) {
  try {
    manifest = JSON.parse(read('manifest.json'));
  } catch (err) {
    fail('manifest.json is not valid JSON: ' + err.message);
  }
}
if (manifest) {
  ['name', 'start_url', 'icons', 'display'].forEach(function (key) {
    if (!manifest[key]) fail('manifest.json is missing "' + key + '"');
  });
  (manifest.icons || []).forEach(function (icon) {
    var src = String(icon.src).replace(/^\.\//, '');
    if (!exists(src)) fail('manifest icon missing on disk: ' + icon.src);
  });
  var start = String(manifest.start_url || '').replace(/^\.\//, '');
  if (start && start !== '' && !exists(start)) fail('manifest start_url does not resolve: ' + manifest.start_url);
}

/* 4. The service worker must not precache files that do not exist, and must
      carry a version so a redeploy invalidates the old cache. */
var sw = exists('sw.js') ? read('sw.js') : '';
var shell = (sw.match(/var SHELL = \[([\s\S]*?)\]/) || [])[1] || '';
shell.split(',').map(function (s) { return s.trim().replace(/^['"]|['"]$/g, ''); })
  .filter(function (s) { return s && s !== './'; })
  .forEach(function (entry) {
    var clean = entry.replace(/^\.\//, '');
    if (!exists(clean)) fail('sw.js precaches a file that does not exist: ' + entry);
  });
if (sw && !/var VERSION = '[^']+'/.test(sw)) fail('sw.js has no VERSION constant to bust its cache on redeploy');

/* 5. Scripts must at least parse. */
files.filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) {
  try {
    execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' });
  } catch (err) {
    fail('syntax error in ' + f + ': ' + String(err.stderr || err.message).split('\n')[0]);
  }
});

/* 6. Flag anything shipped but never referenced. */
var referenced = refs.map(function (r) { return r.replace(/^\.\//, '').split('?')[0]; })
  .concat(['index.html', 'sw.js', 'README.md', '.nojekyll']);
files.forEach(function (f) {
  if (referenced.indexOf(f) === -1 && shell.indexOf(f) === -1) note('unreferenced file in bundle: ' + f);
});

var bytes = files.reduce(function (sum, f) { return sum + fs.statSync(path.join(ROOT, f)).size; }, 0);

console.log('verify-deploy: ' + files.length + ' files, ' + (bytes / 1024).toFixed(1) + ' KB');
notes.forEach(function (n) { console.log('  note: ' + n); });

if (problems.length) {
  problems.forEach(function (p) { console.error('  FAIL: ' + p); });
  process.exit(1);
}
console.log('verify-deploy: bundle looks deployable');
