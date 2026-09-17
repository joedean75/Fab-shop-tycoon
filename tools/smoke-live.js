#!/usr/bin/env node
/* Smoke-test a deployed copy of the game.
   verify-deploy.js checks the bundle on disk; this checks what the host
   actually serves - status codes and, just as important, content types.
   A manifest served as binary/octet-stream still returns 200 but silently
   costs you "Add to Home Screen".

   Usage: node tools/smoke-live.js https://your-site.example */

var execFileSync = require('child_process').execFileSync;

var base = (process.argv[2] || '').replace(/\/+$/, '');
if (!base) {
  console.error('usage: node tools/smoke-live.js <url>');
  process.exit(2);
}

var EXPECTED_TYPE = {
  '.html': /text\/html/,
  '.css': /text\/css/,
  '.js': /(javascript|ecmascript)/,
  '.json': /json/,
  '.webmanifest': /json/,
  '.svg': /image\/svg/
};

var problems = [];

function head(url) {
  var out = execFileSync('curl', ['-sS', '-L', '-o', '/dev/null', '-w',
    '%{http_code}\n%{content_type}\n%{size_download}', url], { encoding: 'utf8' });
  var parts = out.split('\n');
  return { status: +parts[0], type: parts[1] || '', size: +parts[2] };
}

function body(url) {
  return execFileSync('curl', ['-sS', '-L', url], { encoding: 'utf8' });
}

function headerOf(url, name) {
  var out = execFileSync('curl', ['-sSI', '-L', url], { encoding: 'utf8' });
  var line = out.split('\n').filter(function (l) {
    return l.toLowerCase().indexOf(name.toLowerCase() + ':') === 0;
  })[0];
  return line ? line.split(':').slice(1).join(':').trim() : '';
}

function check(path) {
  var url = base + path;
  var res = head(url);
  var ext = (path.match(/\.[a-z]+$/) || ['.html'])[0];
  var want = EXPECTED_TYPE[ext];
  if (res.status !== 200) {
    problems.push(path + ' -> HTTP ' + res.status);
  } else if (want && !want.test(res.type)) {
    problems.push(path + ' served as "' + res.type + '", expected ' + want);
  }
  console.log('  ' + (res.status === 200 ? 'ok  ' : 'FAIL') + '  ' +
    (path || '/') + '  [' + res.type + ', ' + res.size + 'B]');
  return res;
}

console.log('smoke-live: ' + base);
check('');

// Everything index.html points at must be served too.
var html = body(base + '/');
var refs = [];
html.replace(/(?:src|href)="([^"]+)"/g, function (_, r) { refs.push(r); return _; });
refs.filter(function (r) {
  return !/^(https?:)?\/\//.test(r) && r.indexOf('data:') !== 0 && r.charAt(0) !== '#';
}).forEach(function (r) { check('/' + r.replace(/^\.\//, '')); });

check('/sw.js');

// The manifest decides installability, and a 200 with the wrong type still
// breaks it - so assert on the link target itself, whatever it is named.
var manifestRef = (html.match(/<link[^>]+rel="manifest"[^>]+href="([^"]+)"/) ||
                   html.match(/<link[^>]+href="([^"]+)"[^>]+rel="manifest"/) || [])[1];
if (!manifestRef) {
  problems.push('no <link rel="manifest"> in the served HTML - not installable');
} else {
  var mUrl = base + '/' + manifestRef.replace(/^\.\//, '');
  var m = head(mUrl);
  if (!/json/.test(m.type)) {
    problems.push('manifest served as "' + m.type + '" - browsers will not offer install; ' +
      'serve it as application/json or application/manifest+json');
  }
  try {
    JSON.parse(body(mUrl));
  } catch (err) {
    problems.push('manifest is not valid JSON as served: ' + err.message);
  }
  console.log('  manifest ' + manifestRef + ' [' + m.type + ']');
}

// A long-lived worker or shell pins players to an old build.
['/sw.js', '/'].forEach(function (p) {
  var cc = headerOf(base + p, 'cache-control');
  var maxAge = (cc.match(/(?:^|[^-])max-age=(\d+)/) || [])[1];
  if (maxAge && +maxAge > 60) {
    problems.push((p || '/') + ' has Cache-Control max-age=' + maxAge +
      ' - redeploys will not reach installed players promptly');
  }
  console.log('  cache-control ' + (p || '/') + ': ' + (cc || '(none)'));
});

if (!/serviceWorker/.test(body(base + '/js/main.js'))) {
  problems.push('js/main.js served without the service worker registration - wrong build?');
}

if (problems.length) {
  problems.forEach(function (p) { console.error('  FAIL: ' + p); });
  process.exit(1);
}
console.log('smoke-live: deployment looks healthy');
