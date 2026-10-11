#!/usr/bin/env node
// Creates the in-app purchases in store/products.json in App Store Connect,
// through the App Store Connect API. Safe to run again: it skips anything that
// already exists and fills in only what is missing (localization, price,
// availability, review screenshot).
//
// Env: APPSTORE_API_KEY_ID, APPSTORE_API_ISSUER_ID, APPSTORE_API_PRIVATE_KEY
// Usage: node tools/create-iap.js [--dry-run]
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BUNDLE_ID = 'com.fabshoptycoon.game';
const API = 'https://api.appstoreconnect.apple.com';
const DRY = process.argv.includes('--dry-run');
const SCREENSHOT = path.join(ROOT, 'store/appstore/iap-review-screenshot.png');
const REVIEW_NOTE = 'Open the Upgrades tab and scroll to Store. Purchases are processed by StoreKit; nothing is sent to a server of ours.';

const { products } = JSON.parse(fs.readFileSync(path.join(ROOT, 'store/products.json'), 'utf8'));

function token() {
  const keyId = need('APPSTORE_API_KEY_ID');
  const issuer = need('APPSTORE_API_ISSUER_ID');
  const pem = need('APPSTORE_API_PRIVATE_KEY');
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'ES256', kid: keyId, typ: 'JWT' });
  const body = b64({ iss: issuer, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' });
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: pem, dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${sig.toString('base64url')}`;
}
function need(name) {
  const v = (process.env[name] || '').trim();
  if (!v) { console.error(`::error::Secret ${name} is missing or empty.`); process.exit(1); }
  return v;
}

let jwt = token();
let minted = Date.now();
async function api(method, url, body) {
  if (Date.now() - minted > 10 * 60 * 1000) { jwt = token(); minted = Date.now(); }
  const res = await fetch(url.startsWith('http') ? url : API + url, {
    method,
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = new Error(`${method} ${url} -> ${res.status}: ` +
      (json.errors || []).map((e) => `${e.title}: ${e.detail}`).join(' | '));
    err.status = res.status;
    throw err;
  }
  return json;
}
// A to-one relationship that is not set comes back as 404 or as data: null.
async function getOne(url) {
  try { return (await api('GET', url)).data || null; }
  catch (e) { if (e.status === 404) return null; throw e; }
}

async function main() {
  const apps = await api('GET', `/v1/apps?filter[bundleId]=${BUNDLE_ID}`);
  const app = apps.data[0];
  if (!app) throw new Error(`No App Store Connect app with bundle ID ${BUNDLE_ID}.`);
  console.log(`App: ${app.attributes.name} (${app.id})`);

  const existing = (await api('GET', `/v1/apps/${app.id}/inAppPurchasesV2?limit=200`)).data;
  const territories = (await api('GET', '/v1/territories?limit=200')).data.map((t) => ({ type: 'territories', id: t.id }));

  for (const p of products) {
    console.log(`\n== ${p.name} (${p.id})`);
    const type = p.apple_type === 'Consumable' ? 'CONSUMABLE' : 'NON_CONSUMABLE';
    let iap = existing.find((x) => x.attributes.productId === p.id);

    if (iap) {
      console.log(`  exists (${iap.attributes.state})`);
    } else if (DRY) {
      console.log(`  would create ${type}`); continue;
    } else {
      iap = (await api('POST', '/v2/inAppPurchases', { data: {
        type: 'inAppPurchases',
        attributes: { name: p.name, productId: p.id, inAppPurchaseType: type, reviewNote: REVIEW_NOTE },
        relationships: { app: { data: { type: 'apps', id: app.id } } },
      } })).data;
      console.log(`  created ${type} (${iap.id})`);
    }
    const ref = { type: 'inAppPurchases', id: iap.id };

    // Localization (display name + description shown in the store).
    const locs = (await api('GET', `/v2/inAppPurchases/${iap.id}/inAppPurchaseLocalizations`)).data;
    if (locs.some((l) => l.attributes.locale === 'en-US')) console.log('  en-US localization exists');
    else if (!DRY) {
      await api('POST', '/v1/inAppPurchaseLocalizations', { data: {
        type: 'inAppPurchaseLocalizations',
        attributes: { locale: 'en-US', name: p.name, description: p.apple_description },
        relationships: { inAppPurchaseV2: { data: ref } },
      } });
      console.log('  added en-US localization');
    }

    // Price, set in USD; Apple derives the other territories from it.
    if (await getOne(`/v2/inAppPurchases/${iap.id}/iapPriceSchedule`)) console.log('  price already set');
    else if (!DRY) {
      let point, next = `/v2/inAppPurchases/${iap.id}/pricePoints?filter[territory]=USA&limit=200`;
      while (!point && next) {
        const page = await api('GET', next);
        point = page.data.find((pp) => Number(pp.attributes.customerPrice) === Number(p.price_usd));
        next = page.links && page.links.next;
      }
      if (!point) throw new Error(`No USD price point of ${p.price_usd}.`);
      await api('POST', '/v1/inAppPurchasePriceSchedules', {
        data: {
          type: 'inAppPurchasePriceSchedules',
          relationships: {
            inAppPurchase: { data: ref },
            baseTerritory: { data: { type: 'territories', id: 'USA' } },
            manualPrices: { data: [{ type: 'inAppPurchasePrices', id: '${price1}' }] },
          },
        },
        included: [{
          type: 'inAppPurchasePrices', id: '${price1}',
          attributes: { startDate: null },
          relationships: {
            inAppPurchaseV2: { data: ref },
            inAppPurchasePricePoint: { data: { type: 'inAppPurchasePricePoints', id: point.id } },
          },
        }],
      });
      console.log(`  price set to $${p.price_usd}`);
    }

    // Availability: every territory, and new ones as Apple adds them.
    if (await getOne(`/v2/inAppPurchases/${iap.id}/inAppPurchaseAvailability`)) console.log('  availability already set');
    else if (!DRY) {
      await api('POST', '/v1/inAppPurchaseAvailabilities', { data: {
        type: 'inAppPurchaseAvailabilities',
        attributes: { availableInNewTerritories: true },
        relationships: { inAppPurchase: { data: ref }, availableTerritories: { data: territories } },
      } });
      console.log(`  available in ${territories.length} territories`);
    }

    // Review screenshot (required before the purchase can be submitted).
    if (await getOne(`/v2/inAppPurchases/${iap.id}/appStoreReviewScreenshot`)) console.log('  review screenshot exists');
    else if (!DRY) {
      const file = fs.readFileSync(SCREENSHOT);
      const shot = (await api('POST', '/v1/inAppPurchaseAppStoreReviewScreenshots', { data: {
        type: 'inAppPurchaseAppStoreReviewScreenshots',
        attributes: { fileName: path.basename(SCREENSHOT), fileSize: file.length },
        relationships: { inAppPurchaseV2: { data: ref } },
      } })).data;
      for (const op of shot.attributes.uploadOperations) {
        const headers = Object.fromEntries((op.requestHeaders || []).map((h) => [h.name, h.value]));
        const r = await fetch(op.url, { method: op.method, headers, body: file.subarray(op.offset, op.offset + op.length) });
        if (!r.ok) throw new Error(`Screenshot upload part failed: ${r.status}`);
      }
      await api('PATCH', `/v1/inAppPurchaseAppStoreReviewScreenshots/${shot.id}`, { data: {
        type: 'inAppPurchaseAppStoreReviewScreenshots', id: shot.id,
        attributes: { uploaded: true, sourceFileChecksum: crypto.createHash('md5').update(file).digest('hex') },
      } });
      console.log('  review screenshot uploaded');
    }
  }
  console.log('\nDone. In App Store Connect each purchase should now show "Ready to Submit".');
}

main().catch((e) => { console.error(`::error::${e.message}`); process.exit(1); });
