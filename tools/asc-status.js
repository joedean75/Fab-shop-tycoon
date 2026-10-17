#!/usr/bin/env node
// Read-only App Store Connect status for both Fab Shop apps: App Store
// versions, builds and their TestFlight state, beta groups, listing
// completeness and in-app purchases. Changes nothing.
//
// Env: APPSTORE_API_KEY_ID, APPSTORE_API_ISSUER_ID, APPSTORE_API_PRIVATE_KEY
'use strict';
const crypto = require('crypto');

const APPS = ['com.fabshoptycoon.game', 'com.fabshoptoolkit.app'];
const API = 'https://api.appstoreconnect.apple.com';

function need(n) {
  const v = (process.env[n] || '').trim();
  if (!v) { console.error(`::error::Secret ${n} is missing or empty.`); process.exit(1); }
  return v;
}
function token() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: 'ES256', kid: need('APPSTORE_API_KEY_ID'), typ: 'JWT' });
  const b = b64({ iss: need('APPSTORE_API_ISSUER_ID'), iat: now, exp: now + 900, aud: 'appstoreconnect-v1' });
  const s = crypto.sign('sha256', Buffer.from(`${h}.${b}`), { key: need('APPSTORE_API_PRIVATE_KEY'), dsaEncoding: 'ieee-p1363' });
  return `${h}.${b}.${s.toString('base64url')}`;
}
const jwt = token();
async function get(url) {
  const r = await fetch(API + url, { headers: { Authorization: `Bearer ${jwt}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { error: `${r.status} ${(j.errors || []).map((e) => e.detail || e.title).join('; ')}` };
  return j;
}
const line = (s) => console.log(s);

async function app(bundle) {
  const a = (await get(`/v1/apps?filter[bundleId]=${bundle}`)).data?.[0];
  line(`\n######## ${bundle}`);
  if (!a) return line('  no app record');
  line(`  app: ${a.attributes.name} (${a.id})`);

  const infos = await get(`/v1/apps/${a.id}/appInfos`);
  for (const i of infos.data || []) line(`  app info: state=${i.attributes.state || i.attributes.appStoreState} ageRating=${i.attributes.appStoreAgeRating || '-'}`);

  const vers = await get(`/v1/apps/${a.id}/appStoreVersions?limit=5`);
  if (vers.error) line(`  versions: ${vers.error}`);
  for (const v of vers.data || []) {
    line(`  App Store version ${v.attributes.versionString}: ${v.attributes.appVersionState || v.attributes.appStoreState}`);
    const b = await get(`/v1/appStoreVersions/${v.id}/build`);
    line(`    build attached: ${b.data ? b.data.attributes.version : 'none'}`);
    const locs = await get(`/v1/appStoreVersions/${v.id}/appStoreVersionLocalizations`);
    for (const l of locs.data || []) {
      const at = l.attributes;
      const sets = await get(`/v1/appStoreVersionLocalizations/${l.id}/appScreenshotSets`);
      const shots = [];
      for (const s of sets.data || []) {
        const n = await get(`/v1/appScreenshotSets/${s.id}/appScreenshots?limit=20`);
        shots.push(`${s.attributes.screenshotDisplayType}=${(n.data || []).length}`);
      }
      line(`    ${at.locale}: description=${at.description ? 'yes' : 'MISSING'} keywords=${at.keywords ? 'yes' : 'MISSING'} supportUrl=${at.supportUrl ? 'yes' : 'MISSING'} screenshots: ${shots.join(', ') || 'NONE'}`);
    }
    const rd = await get(`/v1/appStoreVersions/${v.id}/appStoreReviewDetail`);
    line(`    review contact: ${rd.data ? (rd.data.attributes.contactEmail ? 'filled in' : 'MISSING email') : 'not filled in'}`);
  }

  const builds = await get(`/v1/builds?filter[app]=${a.id}&sort=-uploadedDate&limit=5&include=buildBetaDetail,preReleaseVersion`);
  if (builds.error) line(`  builds: ${builds.error}`);
  const inc = Object.fromEntries((builds.included || []).map((x) => [`${x.type}/${x.id}`, x]));
  for (const b of builds.data || []) {
    const bd = inc[`buildBetaDetails/${b.relationships?.buildBetaDetail?.data?.id}`];
    const pv = inc[`preReleaseVersions/${b.relationships?.preReleaseVersion?.data?.id}`];
    line(`  build ${pv ? pv.attributes.version : '?'} (${b.attributes.version}) uploaded ${b.attributes.uploadedDate?.slice(0, 10)}: ${b.attributes.processingState}${b.attributes.expired ? ' EXPIRED' : ''}; TestFlight internal=${bd?.attributes.internalBuildState || '?'} external=${bd?.attributes.externalBuildState || '?'}`);
  }

  const groups = await get(`/v1/apps/${a.id}/betaGroups?limit=20`);
  for (const g of groups.data || []) {
    const t = await get(`/v1/betaGroups/${g.id}/betaTesters?limit=200`);
    const gb = await get(`/v1/betaGroups/${g.id}/builds?limit=20`);
    line(`  beta group "${g.attributes.name}" ${g.attributes.isInternalGroup ? 'internal' : 'external'}: testers=${(t.data || []).length} builds=${(gb.data || []).map((x) => x.attributes.version).join(',') || 'none'} publicLink=${g.attributes.publicLinkEnabled ? 'on' : 'off'}`);
  }

  const iaps = await get(`/v1/apps/${a.id}/inAppPurchasesV2?limit=50`);
  for (const p of iaps.data || []) line(`  in-app purchase ${p.attributes.productId}: ${p.attributes.state}`);
}

(async () => { for (const b of APPS) await app(b); })().catch((e) => { console.error(`::error::${e.message}`); process.exit(1); });
