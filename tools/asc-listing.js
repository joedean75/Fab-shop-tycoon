#!/usr/bin/env node
// Fills in the App Store version page in App Store Connect from the files in
// store/appstore/: version number (from package.json), build, copyright,
// category, subtitle, privacy URL, description, keywords, promotional text,
// support/marketing URLs, App Review contact and notes, and screenshots.
// Fields that already hold a value are left alone unless --overwrite is given;
// screenshot sets that already have images are never touched.
//
// Env: APPSTORE_API_KEY_ID, APPSTORE_API_ISSUER_ID, APPSTORE_API_PRIVATE_KEY,
//      COPYRIGHT, CONTACT_FIRST, CONTACT_LAST, CONTACT_PHONE, CONTACT_EMAIL
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'store/appstore/asc.json'), 'utf8'));
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const LIST = path.join(ROOT, 'store/appstore/listing/en-US');
const OVERWRITE = process.argv.includes('--overwrite');
const API = 'https://api.appstoreconnect.apple.com';

const read = (f) => { const p = path.join(LIST, f); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim() : ''; };
const urls = Object.fromEntries(read('urls.txt').split('\n').map((l) => l.split(/:\s(.+)/)).filter((x) => x[1]).map(([k, v]) => [k.trim(), v.trim()]));
const env = (n) => (process.env[n] || '').trim();
function need(n) { const v = env(n); if (!v) { console.error(`::error::${n} is missing or empty.`); process.exit(1); } return v; }

function token() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: 'ES256', kid: need('APPSTORE_API_KEY_ID'), typ: 'JWT' });
  const b = b64({ iss: need('APPSTORE_API_ISSUER_ID'), iat: now, exp: now + 900, aud: 'appstoreconnect-v1' });
  const s = crypto.sign('sha256', Buffer.from(`${h}.${b}`), { key: need('APPSTORE_API_PRIVATE_KEY'), dsaEncoding: 'ieee-p1363' });
  return `${h}.${b}.${s.toString('base64url')}`;
}
let jwt = token(), minted = Date.now();
async function api(method, url, body) {
  if (Date.now() - minted > 600000) { jwt = token(); minted = Date.now(); }
  const r = await fetch(url.startsWith('http') ? url : API + url, {
    method, headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text(); const j = t ? JSON.parse(t) : {};
  if (!r.ok) { const e = new Error(`${method} ${url} -> ${r.status}: ${(j.errors || []).map((x) => x.detail || x.title).join(' | ')}`); e.status = r.status; throw e; }
  return j;
}
const one = async (u) => { try { return (await api('GET', u)).data || null; } catch (e) { if (e.status === 404) return null; throw e; } };
const ok = (s) => console.log(`  ok   ${s}`);
const skip = (s) => console.log(`  --   ${s}`);
const problems = [];
async function step(name, fn) { try { await fn(); } catch (e) { problems.push(`${name}: ${e.message}`); console.log(`  FAIL ${name}: ${e.message}`); } }
// Only the attributes that are empty (or all, with --overwrite) and that we have a value for.
function fill(current, wanted) {
  const out = {};
  for (const [k, v] of Object.entries(wanted)) if (v && (OVERWRITE || !current[k])) out[k] = v;
  return out;
}

async function main() {
  const app = (await api('GET', `/v1/apps?filter[bundleId]=${CFG.bundleId}`)).data[0];
  if (!app) throw new Error(`No app with bundle ID ${CFG.bundleId}`);
  console.log(`${app.attributes.name} - version ${VERSION}`);

  const vers = (await api('GET', `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=10`)).data;
  const editable = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY'];
  const ver = vers.find((v) => editable.includes(v.attributes.appStoreState || v.attributes.appVersionState));
  if (!ver) throw new Error('No editable App Store version (one in Prepare for Submission).');

  await step('version number and copyright', async () => {
    const a = ver.attributes, attrs = {};
    if (a.versionString !== VERSION) attrs.versionString = VERSION;
    if (env('COPYRIGHT') && (OVERWRITE || !a.copyright)) attrs.copyright = env('COPYRIGHT');
    if (!Object.keys(attrs).length) return skip('version number and copyright already set');
    await api('PATCH', `/v1/appStoreVersions/${ver.id}`, { data: { type: 'appStoreVersions', id: ver.id, attributes: attrs } });
    ok(`version ${attrs.versionString ? `${a.versionString} -> ${VERSION}` : 'number unchanged'}${attrs.copyright ? `, copyright "${attrs.copyright}"` : ''}`);
  });

  await step('build', async () => {
    const cur = await one(`/v1/appStoreVersions/${ver.id}/build`);
    const builds = (await api('GET', `/v1/builds?filter[app]=${app.id}&filter[preReleaseVersion.version]=${VERSION}&filter[processingState]=VALID&sort=-uploadedDate&limit=1`)).data;
    if (!builds[0]) throw new Error(`no processed build for ${VERSION}`);
    if (cur && cur.id === builds[0].id) return skip(`build ${builds[0].attributes.version} already attached`);
    await api('PATCH', `/v1/appStoreVersions/${ver.id}/relationships/build`, { data: { type: 'builds', id: builds[0].id } });
    ok(`build ${builds[0].attributes.version} attached`);
  });

  const info = (await api('GET', `/v1/apps/${app.id}/appInfos`)).data.find((i) => (i.attributes.state || i.attributes.appStoreState) !== 'READY_FOR_DISTRIBUTION') ||
               (await api('GET', `/v1/apps/${app.id}/appInfos`)).data[0];

  await step('category', async () => {
    const cur = await one(`/v1/appInfos/${info.id}/primaryCategory`);
    if (cur && !OVERWRITE) return skip(`primary category already ${cur.id}`);
    const rel = (id) => (id ? { data: { type: 'appCategories', id } } : undefined);
    const relationships = {};
    for (const k of ['primaryCategory', 'primarySubcategoryOne', 'primarySubcategoryTwo', 'secondaryCategory']) if (CFG[k]) relationships[k] = rel(CFG[k]);
    await api('PATCH', `/v1/appInfos/${info.id}`, { data: { type: 'appInfos', id: info.id, relationships } });
    ok(`category ${Object.values(CFG).filter((v) => /^[A-Z_]+$/.test(v)).join(' / ')}`);
  });

  await step('subtitle and privacy URL', async () => {
    const locs = (await api('GET', `/v1/appInfos/${info.id}/appInfoLocalizations`)).data;
    const loc = locs.find((l) => l.attributes.locale === 'en-US');
    if (!loc) throw new Error('no en-US app info localization');
    const attrs = fill(loc.attributes, { subtitle: read('subtitle.txt'), privacyPolicyUrl: urls.privacy_url });
    if (!Object.keys(attrs).length) return skip('subtitle and privacy URL already set');
    await api('PATCH', `/v1/appInfoLocalizations/${loc.id}`, { data: { type: 'appInfoLocalizations', id: loc.id, attributes: attrs } });
    ok(`set ${Object.keys(attrs).join(', ')}`);
  });

  const vlocs = (await api('GET', `/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations`)).data;
  let vloc = vlocs.find((l) => l.attributes.locale === 'en-US');
  await step('description, keywords, URLs', async () => {
    const wanted = { description: read('description.txt'), keywords: read('keywords.txt'), promotionalText: read('promotional-text.txt'), supportUrl: urls.support_url, marketingUrl: urls.marketing_url };
    if (!vloc) {
      vloc = (await api('POST', '/v1/appStoreVersionLocalizations', { data: { type: 'appStoreVersionLocalizations', attributes: { locale: 'en-US', ...wanted }, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: ver.id } } } } })).data;
      return ok('en-US text created');
    }
    const attrs = fill(vloc.attributes, wanted);
    if (!Object.keys(attrs).length) return skip('description, keywords and URLs already set');
    await api('PATCH', `/v1/appStoreVersionLocalizations/${vloc.id}`, { data: { type: 'appStoreVersionLocalizations', id: vloc.id, attributes: attrs } });
    ok(`set ${Object.keys(attrs).join(', ')}`);
  });

  await step('App Review contact and notes', async () => {
    const notes = fs.existsSync(path.join(ROOT, 'store/appstore/review-notes.md'))
      ? fs.readFileSync(path.join(ROOT, 'store/appstore/review-notes.md'), 'utf8').replace(/^# .*\n+/, '').replace(/\*\*|`/g, '').slice(0, 3900) : '';
    const wanted = { contactFirstName: env('CONTACT_FIRST'), contactLastName: env('CONTACT_LAST'), contactPhone: env('CONTACT_PHONE'), contactEmail: env('CONTACT_EMAIL'), notes };
    const cur = await one(`/v1/appStoreVersions/${ver.id}/appStoreReviewDetail`);
    if (!cur) {
      await api('POST', '/v1/appStoreReviewDetails', { data: { type: 'appStoreReviewDetails', attributes: { ...wanted, demoAccountRequired: false }, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: ver.id } } } } });
      return ok('review contact and notes added');
    }
    const attrs = fill(cur.attributes, wanted);
    if (!Object.keys(attrs).length) return skip('review contact and notes already set');
    await api('PATCH', `/v1/appStoreReviewDetails/${cur.id}`, { data: { type: 'appStoreReviewDetails', id: cur.id, attributes: attrs } });
    ok(`review detail: set ${Object.keys(attrs).join(', ')}`);
  });

  // Screenshots: each folder goes to the first display type Apple accepts.
  const sets = (await api('GET', `/v1/appStoreVersionLocalizations/${vloc.id}/appScreenshotSets`)).data;
  for (const s of CFG.screenshots) {
    await step(`screenshots ${s.dir}`, async () => {
      const dir = path.join(ROOT, 'store/appstore/screenshots', s.dir);
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
      let set = sets.find((x) => s.types.includes(x.attributes.screenshotDisplayType));
      if (set) {
        const n = (await api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots?limit=20`)).data.length;
        if (n) return skip(`${set.attributes.screenshotDisplayType} already has ${n} screenshots`);
      } else {
        let last;
        for (const t of s.types) {
          try {
            set = (await api('POST', '/v1/appScreenshotSets', { data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: t }, relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: vloc.id } } } } })).data;
            break;
          } catch (e) { last = e; }
        }
        if (!set) throw last;
      }
      for (const f of files) {
        const buf = fs.readFileSync(path.join(dir, f));
        const shot = (await api('POST', '/v1/appScreenshots', { data: { type: 'appScreenshots', attributes: { fileName: f, fileSize: buf.length }, relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.id } } } } })).data;
        for (const op of shot.attributes.uploadOperations) {
          const headers = Object.fromEntries((op.requestHeaders || []).map((h) => [h.name, h.value]));
          const r = await fetch(op.url, { method: op.method, headers, body: buf.subarray(op.offset, op.offset + op.length) });
          if (!r.ok) throw new Error(`upload of ${f} failed: ${r.status}`);
        }
        await api('PATCH', `/v1/appScreenshots/${shot.id}`, { data: { type: 'appScreenshots', id: shot.id, attributes: { uploaded: true, sourceFileChecksum: crypto.createHash('md5').update(buf).digest('hex') } } });
      }
      ok(`${set.attributes.screenshotDisplayType}: ${files.length} screenshots uploaded`);
    });
  }

  if (problems.length) { console.log(`\n${problems.length} step(s) failed:`); problems.forEach((p) => console.log(`::error::${p}`)); process.exit(1); }
  console.log('\nDone. Reload the version page in App Store Connect.');
}
main().catch((e) => { console.error(`::error::${e.message}`); process.exit(1); });
