// POST /api/lead
// Saves a "Not sure where to start?" inquiry as a contact in Prism's HighLevel
// sub-account. Pattern copied from ATX K9 (GrowWithAmeliorateLLC/atx-k9).
//
// The HighLevel Private Integration token lives in the GHL_PIT environment
// variable (Netlify > prism-therapy > Environment variables). It never reaches the browser.
//
// What gets saved: name, email, phone, who it's for, closest location.
// Nothing clinical is collected here. Care details are gathered in IntakeQ.
//
// Bot protection (same as ATX K9):
//   1. Honeypot: prism-form.js adds a hidden "company_website" field. Humans never fill it.
//   2. Time trap: prism-form.js sends "_elapsed". Missing, under 3 seconds or over 24 hours is rejected.
//   3. Gibberish check: random-letter names like "SlbXHEDPSkHJDVKLZpV".
// Rejected submissions get a normal-looking 200 but are never sent to HighLevel.

const LOCATION_ID = 'qm05VObT68XJbw7v9DzE';
const API = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';
const ALLOWED_ORIGINS = [
  'https://prismtherapyatx.com',
  'https://www.prismtherapyatx.com',
  'https://prism-therapy.netlify.app',
];
const ALLOWED_ORIGIN_PATTERN = /^https:\/\/[a-z0-9-]+--prism-therapy\.netlify\.app$/;
const MIN_FILL_MS = 3000;
const MAX_FILL_MS = 24 * 60 * 60 * 1000;

const WHO = ['My child', 'Myself', 'Someone else'];
const LOC = ['South Austin', 'Round Rock', 'Either / not sure'];

let fieldMapCache = null;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const ghlHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Version: VERSION,
  'Content-Type': 'application/json',
  Accept: 'application/json',
});

const clean = (v, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const pick = (v, list) => (list.includes(v) ? v : '');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function toE164(raw) {
  const d = (raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10) return '+1' + d;
  return '+' + d;
}

function splitName(n) {
  const i = n.indexOf(' ');
  return i === -1 ? { f: n, l: '' } : { f: n.slice(0, i), l: n.slice(i + 1) };
}

function looksRandom(text) {
  return (text || '').split(/\s+/).some((w) => {
    if (!/^[A-Za-z]{10,}$/.test(w)) return false;
    return (w.slice(1).match(/[A-Z]/g) || []).length >= 3;
  });
}

function botReason(b, name) {
  if (clean(b.company_website, 200)) return 'honeypot';
  const elapsed = Number(b._elapsed);
  if (!Number.isFinite(elapsed)) return 'no-timer';
  if (elapsed < MIN_FILL_MS) return 'too-fast';
  if (elapsed > MAX_FILL_MS) return 'stale';
  if (looksRandom(name)) return 'gibberish';
  return '';
}

async function getFieldMap(token) {
  if (fieldMapCache) return fieldMapCache;
  const r = await fetch(`${API}/locations/${LOCATION_ID}/customFields`, { headers: ghlHeaders(token) });
  if (!r.ok) throw new Error(`GHL customFields ${r.status}`);
  const j = await r.json();
  const m = {};
  for (const f of j.customFields || []) if (f.fieldKey) m[f.fieldKey] = f.id;
  fieldMapCache = m;
  return m;
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const origin = req.headers.get('origin') || '';
  if (origin && !ALLOWED_ORIGINS.includes(origin) && !ALLOWED_ORIGIN_PATTERN.test(origin)) {
    return json(403, { error: 'Forbidden' });
  }

  const token = process.env.GHL_PIT;
  if (!token) {
    console.error('GHL_PIT env var is not set');
    return json(500, { error: 'Server not configured' });
  }

  let b;
  try {
    b = await req.json();
  } catch {
    return json(400, { error: 'Invalid request' });
  }

  const name = clean(b.name, 200);
  const email = clean(b.email, 200);
  const phone = toE164(clean(b.phone, 40));
  if (!name || (!email && !phone)) return json(400, { error: 'Name and email or phone are required' });

  const reason = botReason(b, name);
  if (reason) {
    console.warn('Lead blocked:', reason, '| origin:', origin || 'none');
    return json(200, { ok: true });
  }

  const who = pick(clean(b.who, 40), WHO);
  const loc = pick(clean(b.loc, 40), LOC);
  const source = clean(b.source, 60) || 'Website';

  let map = {};
  try {
    map = await getFieldMap(token);
  } catch (e) {
    console.error(e);
  }

  const customFields = [
    { id: map['contact.this_is_for'], field_value: who },
    { id: map['contact.closest_location'], field_value: loc },
  ].filter((c) => c.id && c.field_value);

  // Tags drive the HighLevel automation ("website inquiry") and make filtering easy.
  const tags = ['website inquiry'];
  if (who) tags.push('for: ' + slug(who));
  if (loc) tags.push('location: ' + slug(loc));

  const nm = splitName(name);
  const payload = {
    firstName: nm.f,
    lastName: nm.l,
    email,
    phone,
    locationId: LOCATION_ID,
    source: `Website: ${source}`,
    tags,
    customFields,
  };

  const res = await fetch(`${API}/contacts/upsert`, {
    method: 'POST',
    headers: ghlHeaders(token),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error('GHL upsert failed', res.status, await res.text());
    return json(502, { error: 'Could not save inquiry' });
  }

  return json(200, { ok: true });
};

export const config = { path: '/api/lead' };
