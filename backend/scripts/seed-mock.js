'use strict';

/**
 * iMapSU mock data seeder.
 *
 * Wipes every "mockable" collection (keeps up_roles and real user accounts)
 * and re-seeds a complete, self-consistent dataset covering all content types.
 *
 * Usage (backend root): node scripts/seed-mock.js
 *
 * Requires the compiled config in dist/ (run `npm run build` first if dist/config
 * is missing, e.g. after a develop session). The first run downloads real stock
 * photos (Unsplash / picsum) and stores them locally in the media library, so the
 * app works fully offline afterwards.
 *
 * All seeded accounts share the demo password:  iMapSU2026!
 */

const fs = require('fs');
const path = require('path');
require('esbuild-register/dist/node');
const { createStrapi } = require('@strapi/strapi');

const PASSWORD = 'iMapSU2026!';
const ELEC_RATE = 14.0; // PHP per kWh
const WATER_RATE = 110.0; // PHP per m3

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const stamp = (d) => `${d}T09:00:00.000Z`;

// Real stock photos (verified live on images.unsplash.com). Downloading once at
// seed time keeps everything stored locally in Strapi's media library afterwards.
const PHOTO_IDS = {
  restaurant1: 'photo-1414235077428-338989a2e8c0',
  dining: 'photo-1517248135467-4c7edcad34c4',
  dining2: 'photo-1552566626-52f8b828add9',
  cafe: 'photo-1541339907198-e08756dedf3f',
  coffee1: 'photo-1501339847302-ac426a4a7cbb',
  coffee2: 'photo-1554118811-1e0d58224f24',
  snacks: 'photo-1567958451986-2de427a4a0be',
  burger: 'photo-1568901346375-23c9450c58cd',
  kitchen: 'photo-1556911220-bff31c812dba',
  bakery: 'photo-1509440159596-0249088772ff',
  bread: 'photo-1555507036-ab1f4038808a',
  printer: 'photo-1611162617474-5b21e879e113',
  doc1: 'photo-1450101499163-c8848c66ca85',
  doc2: 'photo-1454165804606-c3d57bc86b40',
  doc3: 'photo-1586281380349-632531db7ed4',
  invoice: 'photo-1563013544-824ae1b704d3',
  signing: 'photo-1589829545856-d10d557cf95f',
  tax: 'photo-1554224155-6726b3ff858f',
  bookstore1: 'photo-1507842217343-583bb7270b66',
  bookstore2: 'photo-1524995997946-a1c2e315a42f',
  library: 'photo-1521587760476-6c12a4b040da',
  clothing: 'photo-1441986300917-64674bd600d8',
  grocery: 'photo-1542838132-92c53300491e',
  office1: 'photo-1497366754035-f200968a6e72',
  office2: 'photo-1497366811353-6870744d04b2',
  pupitre: 'photo-1531297484001-80022131f5a1',
  board: 'photo-1518770660439-4636190af475',
  laundry: 'photo-1604335398980-ededcadcc37d',
  tools1: 'photo-1530124566582-a618bc2615dc',
  tools2: 'photo-1504148455328-c376907d081c',
  vacant1: 'photo-1762279938691-7effe62a77b7',
  vacant2: 'photo-1719474815675-70b264f18962',
  vacant3: 'photo-1753911372180-f4c2713f29ea',
  meterElec: 'photo-1762115106003-30a83b29f609',
  meterWater1: 'photo-1618776382458-ec07a950ff59',
  meterWater2: 'photo-1572257023685-106f9575ebf1',
  receipt1: 'photo-1545941962-1b6654eb8072',
  receipt2: 'photo-1731686602391-7484df33a03c',
  receipt3: 'photo-1763958470434-bf7f5065cc3b',
};

const SPACE_PHOTOS = {
  'DL-001': ['restaurant1', 'dining'],
  'DL-002': ['coffee2', 'bread'],
  'DL-003': ['printer', 'doc3'],
  'DL-004': ['vacant1', 'vacant2'],
  'MO-001': ['pupitre', 'board'],
  'AB-001': ['clothing', 'bookstore2'],
  'BA-001': ['coffee1', 'snacks'],
  'BA-002': ['bookstore1', 'library'],
  'CB-001': ['vacant1', 'vacant2'],
  'CB-002': ['laundry', 'office2'],
  'C-001': ['grocery', 'bakery'],
  'UH-001': ['office1', 'office2'],
  'UH-002': ['vacant1', 'vacant3'],
  'M-001': ['vacant1', 'vacant2'],
  'NO-001': ['bread', 'bakery'],
  'AA-001': ['printer', 'doc3'],
  'UFC-001': ['restaurant1', 'dining'],
  'UFC-002': ['coffee2', 'snacks'],
  'UFC-003': ['burger', 'kitchen'],
  'UFC-004': ['cafe', 'bread'],
  'UFC-005': ['vacant1', 'vacant2'],
  'UFC-006': ['vacant1', 'vacant3'],
  'PFW-001': ['coffee1', 'dining2'],
};
const VACANT_KEYS = ['vacant1', 'vacant2'];

const imgUrl = (key) => `https://images.unsplash.com/${PHOTO_IDS[key]}?w=900&q=80&auto=format&fit=crop`;
const dlCache = {};
async function downloadPhoto(name, key) {
  if (dlCache[name]) return dlCache[name];
  const dir = path.join(__dirname, '..', '.tmp', 'seed-media');
  fs.mkdirSync(dir, { recursive: true });
  const filepath = path.join(dir, `${name}.jpg`);
  let buf;
  if (key && PHOTO_IDS[key]) {
    try {
      buf = await fetchWithRetry(imgUrl(key));
    } catch (e) {
      console.log(`  [img] ${name} unsplash failed (${e.message}), trying picsum`);
      try {
        buf = await fetchWithRetry(urlPicsum(name));
      } catch (e2) {
        console.log(`  [img] ${name} picsum failed too - using blank fallback`);
        dlCache[name] = fallbackFile(name);
        return dlCache[name];
      }
    }
  } else {
    try {
      buf = await fetchWithRetry(urlPicsum(name));
    } catch (e) {
      console.log(`  [img] ${name} picsum failed - using blank fallback`);
      dlCache[name] = fallbackFile(name);
      return dlCache[name];
    }
  }
  fs.writeFileSync(filepath, buf);
  const f = { filepath, originalFilename: `${name}.jpg`, mimetype: 'image/jpeg', size: fs.statSync(filepath).size };
  dlCache[name] = f;
  return f;
}
const urlPicsum = (name) => `https://picsum.photos/seed/${name.replace(/[^A-Za-z0-9]/g, '-')}/900/600`;
async function fetchWithRetry(url, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}
function fallbackFile(name) {
  const dir = path.join(__dirname, '..', '.tmp', 'seed-media');
  fs.mkdirSync(dir, { recursive: true });
  const filepath = path.join(dir, `${name}.png`);
  fs.writeFileSync(filepath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
  return { filepath, originalFilename: `${name}.png`, mimetype: 'image/png', size: fs.statSync(filepath).size };
}
async function downloadPhoto(name, key) {
  if (dlCache[name]) return dlCache[name];
  const dir = path.join(__dirname, '..', '.tmp', 'seed-media');
  fs.mkdirSync(dir, { recursive: true });
  const filepath = path.join(dir, `${name}.jpg`);
  let buf;
  if (key && PHOTO_IDS[key]) {
    try {
      buf = await fetchWithRetry(imgUrl(key));
    } catch (e) {
      console.log(`  [img] ${name} unsplash failed (${e.message}), trying picsum`);
      try {
        buf = await fetchWithRetry(urlPicsum(name));
      } catch (e2) {
        console.log(`  [img] ${name} picsum failed too - using blank fallback`);
        dlCache[name] = fallbackFile(name);
        return dlCache[name];
      }
    }
  } else {
    try {
      buf = await fetchWithRetry(urlPicsum(name));
    } catch (e) {
      console.log(`  [img] ${name} picsum failed - using blank fallback`);
      dlCache[name] = fallbackFile(name);
      return dlCache[name];
    }
  }
  fs.writeFileSync(filepath, buf);
  const f = { filepath, originalFilename: `${name}.jpg`, mimetype: 'image/jpeg', size: fs.statSync(filepath).size };
  dlCache[name] = f;
  return f;
}

const CLEANUP_ORDER = [
  'api::status-history.status-history',
  'api::announcement-acknowledgment.announcement-acknowledgment',
  'api::notification.notification',
  'api::audit-log.audit-log',
  'api::meter-reading.meter-reading',
  'api::bill.bill',
  'api::feedback.feedback',
  'api::maintenance-ticket.maintenance-ticket',
  'api::renewal-intent.renewal-intent',
  'api::rental-application.rental-application',
  'api::tenancy.tenancy',
  'api::map-zone.map-zone',
  'api::property-space.property-space',
  'api::map-label.map-label',
  'api::announcement.announcement',
];

const STOP = new Set(['building', 'buildings', 'the', 'of', 'and', 'extension', 'complex']);
function codePrefix(building) {
  const words = String(building ?? '').split(/[^A-Za-z0-9]+/).filter(Boolean);
  const significant = words.filter((w) => !STOP.has(w.toLowerCase()));
  const picked = (significant.length ? significant : words).slice(0, 3);
  return picked.map((w) => w[0].toUpperCase()).join('') || 'SP';
}

(async () => {
  const appDir = process.cwd();
  const distDir = path.join(appDir, 'dist');
  const strapi = await createStrapi({ appDir, distDir }).load();
  try {
    const create = (uid, data) => strapi.entityService.create(uid, { data });
    const wipe = async (uid) => {
      const res = await strapi.db.query(uid).deleteMany({});
      const n = Array.isArray(res) ? res.length : Number(res?.count ?? '0');
      if (n) console.log(`wiped ${n} x ${uid}`);
      return n;
    };

    const roleByType = {};
    for (const r of await strapi.db.query('plugin::users-permissions.role').findMany()) {
      roleByType[r.type] = r.id;
    }

    // ------------------------------------------------------------------ wipe
    let wipedCount = 0;
    for (const uid of CLEANUP_ORDER) wipedCount += await wipe(uid);
    const upFiles = await strapi.db.query('plugin::upload.file').deleteMany({});
    wipedCount += upFiles;
    const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
    fs.rmSync(uploadsDir, { recursive: true, force: true });
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log(`wiped ${wipedCount} total rows + upload store`);

    const uploaded = []; // { path, filename }

    async function attach(uid, entityId, field, files) {
      const list = Array.isArray(files) ? files : [files];
      if (!list.length) return;
      const res = await strapi.plugin('upload').service('upload').upload({
        data: { ref: uid, refId: entityId, field },
        files: list,
      });
      for (const f of res || []) uploaded.push({ uid, entityId, field, filename: f.name });
      return res;
    }

    // ----------------------------------------------------------------- users
    const userSvc = strapi.plugin('users-permissions').service('user');
    async function makeUser(u) {
      const existing = await strapi.db.query('plugin::users-permissions.user').findOne({ where: { email: u.email } });
      if (existing) {
        await userSvc.edit(existing.id, { password: PASSWORD, confirmed: true, blocked: false });
        return { id: existing.id, documentId: existing.documentId, username: existing.username, roleType: u.roleType };
      }
      const base = {
        username: u.username,
        email: u.email,
        password: PASSWORD,
        provider: 'local',
        confirmed: true,
        blocked: false,
        role: roleByType[u.roleType],
        full_name: u.full_name,
        contact_number: u.contact_number,
        position: u.position,
        department: u.department,
        employee_id: u.employee_id ?? null,
        office_location: u.office_location ?? '',
        bio: u.bio ?? '',
      };
      const user = await userSvc.add(base);
      return { id: user.id, documentId: user.documentId, username: user.username, roleType: u.roleType };
    }

    const users = {};
    const people = [
      // OAS staff
      { k: 'oas', username: 'marites.ocampo', email: 'marites.ocampo@imapsu.local', roleType: 'oas', full_name: 'Marites Ocampo', contact_number: '0917 555 0101', position: 'Property Administrator', department: 'Office of Auxiliary Services', employee_id: 'OAS-2019-014', office_location: 'Admin Building, Room 204', bio: 'Handles stall leasing, bills, and meter reading verification.' },
      // Admin
      { k: 'admin', username: 'gilbert.santos', email: 'gilbert.santos@imapsu.local', roleType: 'admin', full_name: 'Gilbert Santos', contact_number: '0917 555 0102', position: 'Director', department: 'Office of Auxiliary Services', employee_id: 'OAS-2015-003', office_location: 'Admin Building, Room 210', bio: 'Director of Auxiliary Services.' },
      // Current tenants
      { k: 't1', username: 'ramon.torres', email: 'ramon.torres@imapsu.local', roleType: 'current-tenant', full_name: 'Ramon Torres', contact_number: '0917 555 0201', position: 'Tenant - Lutong Kapitolyo', department: 'Food and Beverage', bio: 'Family-run rice meals and bibingka stall since 2022.' },
      { k: 't2', username: 'carlita.mendoza', email: 'carlita.mendoza@imapsu.local', roleType: 'current-tenant', full_name: 'Carlita Mendoza', contact_number: '0917 555 0202', position: 'Tenant - The Kape Lanbanero', department: 'Food and Beverage', bio: 'Coffee, milk teas, and pan de bistro.' },
      { k: 't3', username: 'paolo.delacruz', email: 'paolo.delacruz@imapsu.local', roleType: 'current-tenant', full_name: 'Paolo Dela Cruz', contact_number: '0917 555 0203', position: 'Tenant - Print Hub Central', department: 'Services', bio: 'Printing, photocopying, and ID lamination services.' },
      { k: 't4', username: 'jasmine.reyes', email: 'jasmine.reyes@imapsu.local', roleType: 'current-tenant', full_name: 'Jasmine Reyes', contact_number: '0917 555 0204', position: 'Tenant - ICT Solutions PH', department: 'Services', bio: 'Computer repairs, accessories, and load selling.' },
      { k: 't5', username: 'leandro.aguila', email: 'leandro.aguila@imapsu.local', roleType: 'current-tenant', full_name: 'Leandro Aguila', contact_number: '0917 555 0205', position: 'Tenant - Campus Souvenirs', department: 'Retail', bio: 'University memorabilia, school uniforms, and IDs.' },
      { k: 't6', username: 'kaye.bautista', email: 'kaye.bautista@imapsu.local', roleType: 'current-tenant', full_name: 'Kaye Bautista', contact_number: '0917 555 0206', position: 'Tenant - Aurora Cafe', department: 'Food and Beverage', bio: 'Specialty coffee and pastries for students.' },
      { k: 't7', username: 'don.francisco', email: 'don.francisco@imapsu.local', roleType: 'current-tenant', full_name: 'Don Francisco', contact_number: '0917 555 0207', position: 'Tenant - Rex Bookstore Annex', department: 'Retail', bio: 'Review materials, books, and school supplies.' },
      { k: 't8', username: 'isabel.mercado', email: 'isabel.mercado@imapsu.local', roleType: 'current-tenant', full_name: 'Isabel Mercado', contact_number: '0917 555 0208', position: 'Tenant - Iron Press Laundry', department: 'Services', bio: 'Same-day laundry and dry cleaning.' },
      { k: 't9', username: 'rafael.velasco', email: 'rafael.velasco@imapsu.local', roleType: 'current-tenant', full_name: 'Rafael Velasco', contact_number: '0917 555 0209', position: 'Tenant - SU Coop Grocery', department: 'Retail', bio: 'Condominium grocery and school canteen supplies.' },
      { k: 't10', username: 'lotis.santos', email: 'lotis.santos@imapsu.local', roleType: 'current-tenant', full_name: 'Lotis Santos', contact_number: '0917 555 0210', position: 'Tenant - Suman sa Hostel', department: 'Food and Beverage', bio: 'Homemade suman, bibingka, and kakanin.' },
      { k: 't11', username: 'gina.soriano', email: 'gina.soriano@imapsu.local', roleType: 'current-tenant', full_name: 'Gina Soriano', contact_number: '0917 555 0211', position: 'Tenant - Bread & Butter Bakery', department: 'Food and Beverage', bio: 'Bakery goods; tenancy ended June 2026, renewing.' },
      { k: 't12', username: 'mini.arias', email: 'mini.arias@imapsu.local', roleType: 'current-tenant', full_name: 'Mini Arias', contact_number: '0917 555 0212', position: 'Tenant - Kusina ni Nanay', department: 'Food and Beverage', bio: 'Home-style rice meals at the University Food Center.' },
      { k: 't13', username: 'brenda.cruz', email: 'brenda.cruz@imapsu.local', roleType: 'current-tenant', full_name: 'Brenda Cruz', contact_number: '0917 555 0213', position: 'Tenant - Brew Bites', department: 'Food and Beverage', bio: 'Coffee and baked bites at the food center entrance.' },
      { k: 't14', username: 'ernesto.lopez', email: 'ernesto.lopez@imapsu.local', roleType: 'current-tenant', full_name: 'Ernesto Lopez', contact_number: '0917 555 0214', position: 'Tenant - Sizzle Station', department: 'Food and Beverage', bio: 'Grilled plates and sizzlers near the college buildings.' },
      { k: 't15', username: 'selena.ramos', email: 'selena.ramos@imapsu.local', roleType: 'current-tenant', full_name: 'Selena Ramos', contact_number: '0917 555 0215', position: 'Tenant - Katabay Milktea', department: 'Food and Beverage', bio: 'Milk tea and fruit tea bar on the UFC mezzanine.' },
      { k: 't16', username: 'delia.fernandez', email: 'delia.fernandez@imapsu.local', roleType: 'current-tenant', full_name: 'Delia Fernandez', contact_number: '0917 555 0216', position: 'Tenant - Honorio Corner Cafe', department: 'Food and Beverage', bio: 'Coffee and light meals beside the wellness center.' },
      // Aspiring tenants
      { k: 'a1', username: 'nick.bustamante', email: 'nick.bustamante@imapsu.local', roleType: 'aspiring-tenant', full_name: 'Nick Bustamante', contact_number: '0917 555 0301', position: 'Aspiring Tenant', department: 'Food and Beverage', bio: 'Looking to lease a space for a milk tea franchise.' },
      { k: 'a2', username: 'mylene.sevilla', email: 'mylene.sevilla@imapsu.local', roleType: 'aspiring-tenant', full_name: 'Mylene Sevilla', contact_number: '0917 555 0302', position: 'Aspiring Tenant', department: 'Services', bio: 'Wants to open a mobile-load and gadget accessories shop.' },
      { k: 'a3', username: 'arlyn.torres', email: 'arlyn.torres@imapsu.local', roleType: 'aspiring-tenant', full_name: 'Arlyn Torres', contact_number: '0917 555 0303', position: 'Aspiring Tenant', department: 'Retail', bio: 'Planning a school supplies and novelties store.' },
      // Students
      { k: 's1', username: 'juan.luna', email: 'juan.luna@imapsu.local', roleType: 'student', full_name: 'Juan Luna', contact_number: '0917 555 0401', position: 'BS Information Technology', department: 'College of Engineering', office_location: 'DHVSU Main Campus', bio: '2nd year IT student.' },
      { k: 's2', username: 'priya.sharma', email: 'priya.sharma@imapsu.local', roleType: 'student', full_name: 'Priya Sharma', contact_number: '0917 555 0402', position: 'BS Accountancy', department: 'College of Business Administration', office_location: 'CBA Building', bio: '3rd year Accountancy student.' },
    ];
    for (const p of people) users[p.k] = await makeUser(p);
    console.log(`created ${Object.keys(users).length} mock users (demo password: ${PASSWORD})`);

    // ------------------------------------------- administrator role access
    // The 'Administrator' role is custom, so its content-API access has to be
    // granted explicitly (bills, meter readings, properties, tickets, ...).
    // Give it the union of its own actions and everything the OAS role can do
    // so the admin pages show the full OAS dataset without losing admin-only
    // actions. Idempotent across seed runs.
    {
      const roleSvc = strapi.plugin('users-permissions').service('role');
      const permSvc = strapi.plugin('users-permissions').service('permission');
      const adm = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'admin' } });
      const oas = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'oas' } });
      const actionSet = new Set();
      for (const r of [adm, oas]) {
        for (const p of await permSvc.findRolePermissions(r.id)) actionSet.add(p.action);
      }
      const perms = {};
      for (const act of actionSet) {
        const [t, ctrl, a] = act.split('.');
        perms[t] ??= { controllers: {} };
        perms[t].controllers[ctrl] ??= {};
        perms[t].controllers[ctrl][a] = { enabled: true };
      }
      await roleSvc.updateRole(adm.id, { permissions: perms });
    }

    // ------------------------------------------------------ property spaces
    const spaces = [
      { code: 'DL-001', building: 'DHVSU Library', floor: 'Ground', name: 'Stall 1', classification: 'Food and Beverage', businessName: 'Lutong Kapitolyo', monthlyRent: 20000, area: 28, status: 'Occupied', desc: 'Corners the library entrance; great foot traffic at lunch.', products: 'Rice meals, lutong-bahay viands, chilled drinks.', ops: 'Mon–Fri 7:00 AM–7:00 PM, Sat 8:00 AM–3:00 PM.' },
      { code: 'DL-002', building: 'DHVSU Library', floor: 'Ground', name: 'Stall 2', classification: 'Food and Beverage', businessName: 'The Kape Lanbanero', monthlyRent: 18500, area: 24, status: 'Occupied', desc: 'Coffee bar beside the reading area.', products: 'Brewed coffee, milk tea, pan de bistro.', ops: 'Mon–Sat 6:30 AM–8:00 PM.' },
      { code: 'AA-001', building: 'AI Annex', floor: 'Ground', name: 'Stall 1', classification: 'Services', businessName: 'Print Hub Central', monthlyRent: 15000, area: 18, status: 'Occupied', desc: 'Printing and ID service point.', products: 'Printing, photocopy, lamination, e-load.', ops: 'Mon–Fri 8:00 AM–5:00 PM.' },
      { code: 'DL-004', building: 'DHVSU Library', floor: 'Ground', name: 'Stall 4', classification: 'Food and Beverage', businessName: '', monthlyRent: 17500, area: 22, status: 'Vacant', desc: 'Freshly vacated; ready for turnover in October.', products: '', ops: '' },
      { code: 'MO-001', building: 'MIS Office', floor: '1', name: 'Stall 101', classification: 'Services', businessName: 'ICT Solutions PH', monthlyRent: 13500, area: 16, status: 'Occupied', desc: 'Small bay across the MIS annex corridor.', products: 'Computer repair, accessories, load.', ops: 'Mon–Sat 9:00 AM–6:00 PM.' },
      { code: 'AB-001', building: 'Admin Building', floor: 'Ground', name: 'Stall A', classification: 'Retail', businessName: 'Campus Souvenirs', monthlyRent: 15500, area: 20, status: 'Occupied', desc: 'Souvenir kiosk near the main lobby.', products: 'School uniforms, ID laces, memorabilia.', ops: 'Mon–Fri 8:00 AM–5:00 PM.' },
      { code: 'BA-001', building: 'Business Administration Building', floor: '2', name: 'Stall 201', classification: 'Food and Beverage', businessName: 'Aurora Cafe', monthlyRent: 22000, area: 30, status: 'Occupied', desc: 'Corner stall on the CBA building second floor.', products: 'Specialty coffee, pastries, sandwiches.', ops: 'Mon–Fri 7:00 AM–7:00 PM.' },
      { code: 'BA-002', building: 'Business Administration Building', floor: '1', name: 'Stall 102', classification: 'Retail', businessName: 'Rex Bookstore Annex', monthlyRent: 14000, area: 26, status: 'Occupied', desc: 'Book exchange point along the foyer.', products: 'Books, reviewers, school supplies.', ops: 'Mon–Sat 8:00 AM–6:00 PM.' },
      { code: 'CB-001', building: 'CBA Building', floor: '1', name: 'Stall 1', classification: 'Food and Beverage', businessName: 'CDO Food Kiosk', monthlyRent: 19000, area: 20, status: 'Vacant', desc: 'Frozen-food kiosk slot; water line available.', products: '', ops: '' },
      { code: 'CB-002', building: 'CBA Building', floor: '1', name: 'Stall 2', classification: 'Services', businessName: 'Iron Press Laundry', monthlyRent: 12000, area: 24, status: 'Occupied', desc: 'Laundry drop-off and pick-up bay.', products: 'Wash, dry, fold; dry cleaning.', ops: 'Mon–Sun 7:00 AM–8:00 PM.' },
      { code: 'C-001', building: 'COOP', floor: 'Ground', name: 'COOP Space A', classification: 'Retail', businessName: 'SU Coop Grocery', monthlyRent: 30000, area: 60, status: 'Occupied', desc: 'Largest retail bay inside the university cooperative.', products: 'Groceries, canteen staples, toiletries.', ops: 'Mon–Sat 7:00 AM–8:00 PM.' },
      { code: 'UH-001', building: 'University Hostel', floor: 'Ground', name: 'Hostel Stall 1', classification: 'Food and Beverage', businessName: 'Suman sa Hostel', monthlyRent: 8000, area: 12, status: 'Occupied', desc: 'Micro-stall near the hostel gate.', products: 'Suman, bibingka, kakanin.', ops: 'Mon–Sun 6:00 AM–6:00 PM.' },
      { code: 'UH-002', building: 'University Hostel', floor: 'Ground', name: 'Hostel Stall 2', classification: 'Services', businessName: '', monthlyRent: 9500, area: 14, status: 'Vacant', desc: 'Study nook / internet cafe slot.', products: '', ops: '' },
      { code: 'M-001', building: 'Motorpool', floor: 'Ground', name: 'Motorpool Bay 1', classification: 'Retail', businessName: '', monthlyRent: 11000, area: 18, status: 'Vacant', desc: 'Service bay along the motorpool driveway.', products: '', ops: '' },
      { code: 'NO-001', building: 'NSTP/ROTC Office', floor: 'Ground', name: 'NSTP Kiosk', classification: 'Food and Beverage', businessName: 'Bread & Butter Bakery', monthlyRent: 17000, area: 24, status: 'Occupied', desc: 'Bakery kiosk beside the NSTP grounds.', products: 'Bread, pastry, breakfast combos.', ops: 'Mon–Sat 5:30 AM–6:00 PM.' },
      { code: 'UFC-001', building: 'University Food Center', floor: '1', name: 'UFC Stall 1', classification: 'Food and Beverage', businessName: 'Kusina ni Nanay', monthlyRent: 18000, area: 26, status: 'Occupied', desc: 'Home-style meals along the main food center counter.', products: 'Rice meals, sinaing, paksiw, fresh buko juice.', ops: 'Mon–Sat 8:00 AM–7:00 PM.' },
      { code: 'UFC-002', building: 'University Food Center', floor: '1', name: 'UFC Stall 2', classification: 'Food and Beverage', businessName: 'Brew Bites', monthlyRent: 16000, area: 22, status: 'Occupied', desc: 'Coffee and pastries across the food center entrance.', products: 'Brewed coffee, cookies, donuts, sandwiches.', ops: 'Mon–Sat 6:30 AM–7:30 PM.' },
      { code: 'UFC-003', building: 'University Food Center', floor: '1', name: 'UFC Stall 3', classification: 'Food and Beverage', businessName: 'Sizzle Station', monthlyRent: 19000, area: 24, status: 'Occupied', desc: 'Grill counter on the food center north aisle.', products: 'Sizzling sisig, bangus, burgers, fries.', ops: 'Mon–Fri 9:00 AM–7:00 PM.' },
      { code: 'UFC-004', building: 'University Food Center', floor: '2', name: 'UFC Stall 4', classification: 'Food and Beverage', businessName: 'Katabay Milktea', monthlyRent: 17000, area: 20, status: 'Occupied', desc: 'Milk tea bar on the mezzanine level.', products: 'Milk teas, fruit teas, cheese foam.', ops: 'Mon–Sun 10:00 AM–8:00 PM.' },
      { code: 'UFC-005', building: 'University Food Center', floor: '2', name: 'UFC Stall 5', classification: 'Food and Beverage', businessName: '', monthlyRent: 16500, area: 21, status: 'Vacant', desc: 'Mezzanine stall; water line and vent available.', products: '', ops: '' },
      { code: 'UFC-006', building: 'University Food Center', floor: '2', name: 'UFC Stall 6', classification: 'Food and Beverage', businessName: '', monthlyRent: 16000, area: 20, status: 'Vacant', desc: 'Small counter slot for a snack or dessert concept.', products: '', ops: '' },
      { code: 'PFW-001', building: 'Physical Facilities and Wellness Center', floor: 'Ground', name: 'Café Corner', classification: 'Food and Beverage', businessName: 'Honorio Corner Cafe', monthlyRent: 21000, area: 34, status: 'Occupied', desc: 'Corner cafe by the wellness center entrance.', products: 'Brewed coffee, smoothies, pastries, rice meals.', ops: 'Mon–Fri 6:30 AM–7:00 PM.' },
    ];
    const propertySpaces = {};
    const propCounters = {};
    for (const s of spaces) {
      let code = s.code;
      if (!code) {
        const prefix = codePrefix(s.building);
        propCounters[prefix] = (propCounters[prefix] ?? 1);
        code = `${prefix}-${String(propCounters[prefix]).padStart(3, '0')}`;
        propCounters[prefix] += 1;
      }
      const space = await create('api::property-space.property-space', {
        propertyCode: code,
        name: s.name,
        building: s.building,
        campus: 'Main Campus',
        floor: s.floor,
        description: s.desc,
        area: s.area,
        rentalClassification: s.classification,
        businessName: s.businessName,
        productsServices: s.products,
        operatingDetails: s.ops,
        space_status: s.status,
        monthlyRent: s.monthlyRent,
      });
      propertySpaces[s.businessName || s.name] = { id: space.id, documentId: space.documentId, code: space.propertyCode, space: s };
      const keys = s.status === 'Occupied' ? (SPACE_PHOTOS[s.code] || ['office1', 'office2']) : VACANT_KEYS;
      await attach('api::property-space.property-space', space.id, 'photos', [
        await downloadPhoto(`ps-${space.propertyCode.toLowerCase()}-1`, keys[0]),
        await downloadPhoto(`ps-${space.propertyCode.toLowerCase()}-2`, keys[1]),
      ]);
      if (s.status === 'Occupied') {
        await attach('api::property-space.property-space', space.id, 'tenantPhotos', [
          await downloadPhoto(`tp-${space.propertyCode.toLowerCase()}-1`, keys[0]),
        ]);
      }
    }
    console.log(`created ${spaces.length} property spaces`);

    // ----------------------------------------------------------- map labels
    const labelMap = {
      'DHVSU Library': 'Library',
      'MIS Office': 'MIS Office',
      'Admin Building': 'Admin Building',
      'Business Administration Building': 'Business Admin',
      'CBA Building': 'CBA Building',
      'COOP': 'Cooperative Store',
      'University Hostel': 'University Hostel',
      'Motorpool': 'Motorpool',
      'NSTP/ROTC Office': 'NSTP / ROTC',
      'AI Annex': 'AI Annex',
      'Ewan': 'Ewan Hall',
      'University Food Center': 'University Food Center',
      'Physical Facilities and Wellness Center': 'Cafe Honorio',
      'Main Quadrangle': 'Main Quadrangle',
      'Covered Court': 'Covered Court',
      'Front Parking': 'Front Parking',
    };
    for (const [key, label] of Object.entries(labelMap)) {
      await create('api::map-label.map-label', { buildingKey: key, label });
    }
    console.log(`created ${Object.keys(labelMap).length} map labels`);

    // ------------------------------------------------------------ map zones
    const footprints = {
      'DHVSU Library': [{ x: -40, z: 18 }, { x: -20, z: 18 }, { x: -20, z: 42 }, { x: -40, z: 42 }],
      'MIS Office': [{ x: -18, z: 56 }, { x: -2, z: 56 }, { x: -2, z: 72 }, { x: -18, z: 72 }],
      'Admin Building': [{ x: -46, z: -12 }, { x: -28, z: -12 }, { x: -28, z: 8 }, { x: -46, z: 8 }],
      'Business Administration Building': [{ x: 16.34, z: 69.56 }, { x: 22.82, z: 32.66 }, { x: 36.18, z: 35.02 }, { x: 29.68, z: 71.92 }],
      'CBA Building': [{ x: -13.02, z: 89.72 }, { x: -12.4, z: 79.98 }, { x: 27.28, z: 82.52 }, { x: 26.36, z: 96.88 }, { x: -9.9, z: 94.54 }],
      'COOP': [{ x: 20, z: 20 }, { x: 40, z: 20 }, { x: 40, z: 40 }, { x: 20, z: 40 }],
      'University Hostel': [{ x: 21.1, z: -36.1 }, { x: 23.7, z: -52.14 }, { x: 52.76, z: -47.44 }, { x: 46.8, z: -10.48 }, { x: 31.32, z: -12.98 }],
      'Motorpool': [{ x: 50, z: 60 }, { x: 62, z: 60 }, { x: 62, z: 74 }, { x: 50, z: 74 }],
      'NSTP/ROTC Office': [{ x: 40, z: -12 }, { x: 54, z: -12 }, { x: 54, z: 0 }, { x: 40, z: 0 }],
      'AI Annex': [{ x: -6, z: -45 }, { x: 14, z: -45 }, { x: 14, z: -28 }, { x: -6, z: -28 }],
      'Ewan': [{ x: 46.54, z: -50.84 }, { x: 48.8, z: -64.76 }, { x: 57.36, z: -63.38 }, { x: 55.12, z: -49.46 }],
      'University Food Center': [{ x: 44, z: 20 }, { x: 60, z: 20 }, { x: 60, z: 36 }, { x: 44, z: 36 }],
      'Physical Facilities and Wellness Center': [{ x: -46, z: -58 }, { x: -34, z: -58 }, { x: -34, z: -44 }, { x: -46, z: -44 }],
    };
    const landmarks = {
      'Main Quadrangle': [{ x: -34, z: 20 }, { x: 34, z: 20 }, { x: 34, z: 78 }, { x: -34, z: 78 }],
      'Covered Court': [{ x: 24, z: 46 }, { x: 46, z: 46 }, { x: 46, z: 60 }, { x: 24, z: 60 }],
      'Front Parking': [{ x: -26, z: -36 }, { x: 2, z: -36 }, { x: 2, z: -18 }, { x: -26, z: -18 }],
    };
    let order = 0;
    for (const [name, corners] of Object.entries(footprints)) {
      const linked = Object.values(propertySpaces).find((e) => e.space.building === name);
      await create('api::map-zone.map-zone', {
        name,
        description: `${name} building footprint`,
        type: 'Property',
        color: '#d4af37',
        height: 6,
        baseY: 0,
        corners,
        order: order++,
        propertySpace: linked ? linked.id : null,
      });
    }
    for (const [name, corners] of Object.entries(landmarks)) {
      await create('api::map-zone.map-zone', {
        name,
        description: name,
        type: 'Landmark',
        color: name === 'Covered Court' ? '#3b82f6' : name === 'Front Parking' ? '#94a3b8' : '#7f9b6b',
        height: name === 'Covered Court' ? 8 : 1,
        baseY: 0,
        corners,
        order: order++,
      });
    }
    console.log(`created ${Object.keys(footprints).length + Object.keys(landmarks).length} map zones`);

    // -------------------------------------------------------------- tenancies
    const tenancies = {};
    const occupied = Object.keys(propertySpaces).filter((k) => propertySpaces[k].space.status === 'Occupied');
    const occupantFor = (business) => {
      const map = {
        'Lutong Kapitolyo': 't1', 'The Kape Lanbanero': 't2', 'Print Hub Central': 't3',
        'ICT Solutions PH': 't4', 'Campus Souvenirs': 't5', 'Aurora Cafe': 't6', 'Rex Bookstore Annex': 't7',
        'Iron Press Laundry': 't8', 'SU Coop Grocery': 't9', 'Suman sa Hostel': 't10', 'Bread & Butter Bakery': 't11',
        'Kusina ni Nanay': 't12', 'Brew Bites': 't13', 'Sizzle Station': 't14', 'Katabay Milktea': 't15', 'Honorio Corner Cafe': 't16',
      };
      return map[business];
    };
    const tenancySpecs = [
      { space: 'Lutong Kapitolyo', start: '2025-09-01', rent: 20000, status: 'Active' },
      { space: 'The Kape Lanbanero', start: '2025-11-01', rent: 18500, status: 'Active' },
      { space: 'Print Hub Central', start: '2026-01-15', rent: 15000, status: 'Active' },
      { space: 'ICT Solutions PH', start: '2026-03-01', rent: 13500, status: 'Active' },
      { space: 'Campus Souvenirs', start: '2025-12-01', rent: 15500, status: 'Active' },
      { space: 'Aurora Cafe', start: '2026-05-01', rent: 22000, status: 'Active' },
      { space: 'Rex Bookstore Annex', start: '2025-08-01', rent: 14000, status: 'Active' },
      { space: 'Iron Press Laundry', start: '2025-10-01', rent: 12000, status: 'Terminated', end: '2026-03-31' },
      { space: 'SU Coop Grocery', start: '2024-06-01', rent: 30000, status: 'Active' },
      { space: 'Suman sa Hostel', start: '2026-02-01', rent: 8000, status: 'Active' },
      { space: 'Bread & Butter Bakery', start: '2025-07-01', rent: 17000, status: 'Ended', end: '2026-06-30' },
      { space: 'Kusina ni Nanay', start: '2026-06-01', rent: 18000, status: 'Active' },
      { space: 'Brew Bites', start: '2026-07-01', rent: 16000, status: 'Active' },
      { space: 'Sizzle Station', start: '2026-03-01', rent: 19000, status: 'Active' },
      { space: 'Katabay Milktea', start: '2026-05-01', rent: 17000, status: 'Active' },
      { space: 'Honorio Corner Cafe', start: '2026-04-01', rent: 21000, status: 'Active' },
    ];
    for (const spec of tenancySpecs) {
      const prop = propertySpaces[spec.space];
      const tenantKey = occupantFor(spec.space);
      const tenancy = await create('api::tenancy.tenancy', {
        user: users[tenantKey].id,
        propertySpace: prop.id,
        startDate: spec.start,
        endDate: spec.end ?? null,
        status: spec.status,
        monthlyRent: spec.rent,
      });
      tenancies[spec.space] = { id: tenancy.id, documentId: tenancy.documentId, ...spec };
    }
    console.log(`created ${tenancySpecs.length} tenancies`);

    // --------------------------------------------------------- meter readings
    const meterReadings = {};
    const monthSeq = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
    function billingMonths(spec) {
      const months = [];
      for (const m of monthSeq) {
        if (m < spec.start.slice(0, 7)) continue;
        if (spec.end && m > spec.end.slice(0, 7)) continue;
        months.push(m);
      }
      return months;
    }
    const baseE = { 'Lutong Kapitolyo': 4200, 'The Kape Lanbanero': 3100, 'Print Hub Central': 1800, 'ICT Solutions PH': 1200, 'Campus Souvenirs': 2600, 'Aurora Cafe': 3900, 'Rex Bookstore Annex': 1700, 'Iron Press Laundry': 2500, 'SU Coop Grocery': 6800, 'Suman sa Hostel': 700, 'Bread & Butter Bakery': 2200, 'Kusina ni Nanay': 2400, 'Brew Bites': 900, 'Sizzle Station': 3000, 'Katabay Milktea': 1500, 'Honorio Corner Cafe': 2800 };
    const baseW = { 'Lutong Kapitolyo': 62, 'The Kape Lanbanero': 48, 'Print Hub Central': 20, 'ICT Solutions PH': 12, 'Campus Souvenirs': 26, 'Aurora Cafe': 55, 'Rex Bookstore Annex': 18, 'Iron Press Laundry': 95, 'SU Coop Grocery': 110, 'Suman sa Hostel': 30, 'Bread & Butter Bakery': 52, 'Kusina ni Nanay': 40, 'Brew Bites': 18, 'Sizzle Station': 25, 'Katabay Milktea': 22, 'Honorio Corner Cafe': 35 };
    let mReadCount = 0;
    for (const b of Object.keys(tenancies)) {
      const spec = tenancies[b];
      const months = billingMonths(spec);
      let ePrev = baseE[b] * 0.6, wPrev = baseW[b] * 0.55;
      meterReadings[b] = {};
      for (const m of months) {
        const mo = Number(m.slice(5));
        const eUse = Math.round((200 + (spec.rent / 100)) * (1 + ((mo * 7) % 40) / 100));
        const wUse = Math.round(6 + (mo * 3) % 22);
        const eCur = ePrev + eUse, wCur = wPrev + wUse;
        const mth = await create('api::meter-reading.meter-reading', {
          tenancy: spec.id,
          electricMeterReading: eCur,
          waterMeterReading: wCur,
          readingDate: `${m}-28`,
          notes: 'End-of-billing-cycle reading.',
          recordedBy: users.oas.id,
        });
        const mcode = propertySpaces[b].code.toLowerCase();
        // Real meter photos: the electric and water meter readouts used for this
        // month's billing, attached to every reading for the office's records.
        await attach('api::meter-reading.meter-reading', mth.id, 'electricMeterImage', await downloadPhoto(`meter-${mcode}-elec-${m}`, 'meterElec'));
        await attach('api::meter-reading.meter-reading', mth.id, 'waterMeterImage', await downloadPhoto(`meter-${mcode}-water-${m}`, mo % 2 === 0 ? 'meterWater1' : 'meterWater2'));
        const periodIndex = monthSeq.indexOf(m);
        meterReadings[b][m] = { id: mth.id, documentId: mth.documentId, ePrev, eCur, wPrev, wCur, eUse, wUse, periodIndex };
        ePrev = eCur; wPrev = wCur;
        mReadCount += 1;
      }
    }
    console.log(`created ${mReadCount} meter readings`);

    // ------------------------------------------------------------------ bills
    let billCount = 0;
    let orCounter = 100001;
    const bills = {};
    for (const b of Object.keys(tenancies)) {
      const spec = tenancies[b];
      const months = billingMonths(spec);
      bills[b] = {};
      for (const [j, m] of months.entries()) {
        const mr = meterReadings[b][m];
        const electricCharge = r2(mr.eUse * ELEC_RATE);
        const waterCharge = r2(mr.wUse * WATER_RATE);
        const additionalCharges = r2((j * 47) % 5 === 0 ? 250 : 0);
        const amount = r2(spec.rent + electricCharge + waterCharge + additionalCharges);
        const [y, mo] = m.split('-').map(Number);
        const dueDate = new Date(Date.UTC(y, mo, 10)).toISOString().slice(0, 10);
        const isLast = j === months.length - 1;
        const isSecondLast = j === months.length - 2;
        let status = 'Verified';
        let paidAt = `2026-${String(mo + 1).padStart(2, '0')}-15`;
        let orNumber = `OR-2026-${orCounter++}`;
        let verificationNote = null;
        if (isLast) { status = 'Unpaid'; paidAt = null; orNumber = null; }
        else if (isSecondLast) { status = 'For Verification'; paidAt = null; orNumber = null; }
        else if (b === 'Campus Souvenirs' && m === '2026-03') { status = 'Rejected'; paidAt = null; orNumber = null; verificationNote = 'Receipt image was unreadable. Please resubmit with your official receipt.'; }
        else if (b === 'ICT Solutions PH' && m === '2026-04') { status = 'Overdue'; paidAt = null; orNumber = null; }
        bills[b][m] = { amount, status };
        const bill = await create('api::bill.bill', {
          tenancy: spec.id,
          period: m,
          amount,
          electricMeterPrevious: mr.ePrev,
          electricMeterCurrent: mr.eCur,
          electricRate: ELEC_RATE,
          electricCharge,
          waterMeterPrevious: mr.wPrev,
          waterMeterCurrent: mr.wCur,
          waterRate: WATER_RATE,
          waterCharge,
          additionalCharges,
          dueDate,
          status,
          verificationNote,
          paidAt,
          orNumber,
        });
        if (status === 'Verified' || status === 'For Verification' || status === 'Rejected') {
          // A real receipt scan is attached for every bill with a payment on
          // file — verified payments, receipts still awaiting review, and the
          // rejected one that was unreadable.
          const receiptKey = ['receipt1', 'receipt2', 'receipt3'][j % 3];
          await attach('api::bill.bill', bill.id, 'receipt', await downloadPhoto(`receipt-${propertySpaces[b].code}-${m}`, receiptKey));
        }
        billCount += 1;
      }
    }
    console.log(`created ${billCount} bills`);

    // ---------------------------------------------------- rental applications
    const apps = [];
    const appSpecs = [
      { user: 'a1', space: 'DL-004', status: 'Pending', message: 'Requesting the just-vacated library stall 4 for a milk tea concept.', productsServices: 'Bubble tea, fruit teas, coffee.' },
      { user: 'a1', space: 'CB-001', status: 'For Review', message: 'Backup option: CDO frozen food kiosk in the CBA building.', productsServices: 'Frozen hotdogs, siomai, fries.' },
      { user: 'a2', space: 'UH-002', status: 'For Recommendation', message: 'Hostel stall 2 for gadget accessories and load selling.', productsServices: 'Phone cases, chargers, e-load.', appearanceDate: stamp('2026-09-18'), appearanceConfirmed: true, evaluation: 'Strong track record operating a similar stall in Bacolor. Recommended for consideration.' },
      { user: 'a3', space: 'M-001', status: 'Approved', message: 'School supplies and novelties for the motorpool service bay.', productsServices: 'Notebooks, pens, uniforms.', appearanceDate: stamp('2026-09-10'), appearanceConfirmed: true, evaluation: 'Good fit for the motorpool foot traffic.', recommendation: 'Approve for a one (1) year lease at PHP 11,000/mo.' },
      { user: 's2', space: 'BA-001', status: 'Declined', message: 'Inquiry about the Aurora Cafe space.', productsServices: 'Secondhand books.' },
      { user: 'a3', space: 'MO-001', status: 'Cancelled', message: 'Withdrew to pursue the motorpool approval.', productsServices: 'Office supplies.' },
    ];
    for (const a of appSpecs) {
      const prop = propertySpaces[a.space] || null;
      const app = await create('api::rental-application.rental-application', {
        user: users[a.user].id,
        propertySpace: prop ? prop.id : null,
        status: a.status,
        message: a.message,
        letterOfIntent: undefined,
        productsServices: a.productsServices,
        appearanceDate: a.appearanceDate ?? null,
        appearanceConfirmed: a.appearanceConfirmed ?? false,
        evaluation: a.evaluation ?? null,
        recommendation: a.recommendation ?? null,
      });
      await attach('api::rental-application.rental-application', app.id, 'letterOfIntent', await downloadPhoto(`loi-${a.user}`, ['doc1', 'doc2', 'doc3', 'signing'][apps.length % 4]));
      if (a.status === 'For Recommendation' || a.status === 'Approved') {
        await attach('api::rental-application.rental-application', app.id, 'dtiDocuments', [await downloadPhoto(`dti-${a.user}-1`, 'doc2'), await downloadPhoto(`dti-${a.user}-2`, 'doc3')]);
        await attach('api::rental-application.rental-application', app.id, 'birDocuments', await downloadPhoto(`bir-${a.user}`, 'tax'));
        await attach('api::rental-application.rental-application', app.id, 'businessPermits', [await downloadPhoto(`perm-${a.user}`, 'signing')]);
      }
      apps.push({ id: app.id, documentId: app.documentId, ...a });
    }
    console.log(`created ${apps.length} rental applications`);

    // -------------------------------------------------------- renewal intents
    const renewals = [];
    const renewalSpecs = [
      { user: 't11', tenancy: 'Bread & Butter Bakery', status: 'Pending', message: 'Tenancy ended June 30. Requesting a one-year renewal at the same rate.' },
      { user: 't9', tenancy: 'SU Coop Grocery', status: 'Approved', message: 'Long-standing tenant renewing the supermarket bay.' },
    ];
    for (const spec of renewalSpecs) {
      const ten = tenancies[spec.tenancy];
      const rn = await create('api::renewal-intent.renewal-intent', {
        user: users[spec.user].id,
        tenancy: ten.id,
        letterOfRenewal: undefined,
        message: spec.message,
        status: spec.status,
      });
      await attach('api::renewal-intent.renewal-intent', rn.id, 'letterOfRenewal', await downloadPhoto(`renewal-${spec.user}`, 'signing'));
      renewals.push(rn);
    }
    console.log(`created ${renewals.length} renewal intents`);

    // ----------------------------------------------------- maintenance tickets
    const tickets = [];
    const ticketSpecs = [
      { reporter: 't1', space: 'Lutong Kapitolyo', category: 'Plumbing', priority: 'High', description: 'Kitchen sink drain is clogged; wastewater backs up during peak hours.', status: 'In Progress', actionNotes: 'Plumber dispatched; pipe partially cleared, awaiting replacement of worn elbow joint.' },
      { reporter: 't5', space: 'Campus Souvenirs', category: 'Electrical', priority: 'Normal', description: 'Fluorescent ceiling lights flicker intermittently near the counter.', status: 'Completed', actionNotes: 'Replaced two failing ballasts. Wiring checked and stable.', completedAt: stamp('2026-09-21') },
      { reporter: 't6', space: 'Aurora Cafe', category: 'Structural', priority: 'Critical', description: 'Ceiling leak above the espresso station during heavy rain; water dripping near electrical outlets.', status: 'Pending' },
      { reporter: 't9', space: 'SU Coop Grocery', category: 'Internet', priority: 'Normal', description: 'Wi-Fi router keeps dropping; customers cannot use e-wallet payments.', status: 'Completed', actionNotes: 'Restarted router, updated firmware, relocated access point for better coverage.', completedAt: stamp('2026-09-25'), followUps: [{ action: 'Confirmed stable for 48 hours.', by: 'Marites Ocampo', at: '2026-09-27T10:00:00.000Z' }] },
      { reporter: 't8', space: 'Iron Press Laundry', category: 'Plumbing', priority: 'Low', description: 'Comfort room flush valve runs continuously.', status: 'Completed', actionNotes: 'Adjusted float valve.', completedAt: stamp('2026-08-30') },
      { reporter: 't10', space: 'Suman sa Hostel', category: 'Other', priority: 'Normal', description: 'Folding table and two stools are wobbly; hinge on the counter door is loose.', status: 'Pending', followUps: [] },
    ];
    for (const spec of ticketSpecs) {
      const tk = await create('api::maintenance-ticket.maintenance-ticket', {
        reporter: users[spec.reporter].id,
        propertySpace: propertySpaces[spec.space].id,
        category: spec.category,
        priority: spec.priority,
        description: spec.description,
        status: spec.status,
        actionNotes: spec.actionNotes ?? null,
        completedAt: spec.completedAt ?? null,
        followUps: spec.followUps ?? null,
      });
      if (spec.status === 'Completed') {
        await attach('api::maintenance-ticket.maintenance-ticket', tk.id, 'images', [await downloadPhoto(`mt-${tk.id}`, tickets.length % 2 === 0 ? 'tools1' : 'tools2')]);
      }
      tickets.push({ id: tk.id, documentId: tk.documentId, ...spec });
    }
    console.log(`created ${tickets.length} maintenance tickets`);

    // ---------------------------------------------------------------- feedback
    const feedbacks = [];
    const feedbackSpecs = [
      { author: 's1', space: 'Lutong Kapitolyo', category: 'Product', rating: 5, comment: 'Rice meals are sulit and consistently hot at lunch time.' },
      { author: 's2', space: 'The Kape Lanbanero', category: 'Service', rating: 4, comment: 'Fast service, but ordering can get crowded between classes.' },
      { author: 's1', space: 'Print Hub Central', category: 'Staff', rating: 5, comment: 'The attendant helped me re-encode my thesis cover at no extra charge.', staffAction: 'Compliment logged under the quarterly staff incentive.' },
      { author: 's2', space: 'Aurora Cafe', category: 'Cleanliness', rating: 3, comment: 'Cafe is nice but the tables were sticky in the afternoon.', staffAction: 'Cleaning schedule for the dining area moved to hourly peak-time rounds.' },
      { author: 't5', space: 'Campus Souvenirs', category: 'Other', rating: 4, comment: 'Good supplier for uniform accessories.' },
      { author: 's1', space: 'Iron Press Laundry', category: 'Service', rating: 2, comment: 'Pick-up was one day late; clothes were fine though.' },
    ];
    for (const spec of feedbackSpecs) {
      const fb = await create('api::feedback.feedback', {
        author: users[spec.author].id,
        propertySpace: propertySpaces[spec.space].id,
        tenantName: propertySpaces[spec.space].space.businessName || spec.space,
        category: spec.category,
        rating: spec.rating,
        comment: spec.comment,
        staffAction: spec.staffAction ?? null,
      });
      feedbacks.push(fb);
    }
    console.log(`created ${feedbacks.length} feedback`);

    // ----------------------------------------------------------- announcements
    const announcements = {};
    const annSpecs = [
      { title: 'SU Fun Run 2026 is back', body: 'Registration is now open for the annual University Fun Run on November 21. Stalls along the route may extend operating hours. See the OAS office for details.', audience: 'Everyone', pinned: true, publishAt: '2026-08-05T09:00:00.000Z' },
      { title: 'October rent bills now available', body: 'Monthly rent and utility bills for the October billing period are now posted. Kindly settle on or before the due date to avoid late charges.', audience: 'Tenants', publishAt: '2026-08-25T09:00:00.000Z', expireAt: '2026-09-10T23:59:00.000Z' },
      { title: 'Quiet hours at the Library Annex during exams', body: 'To help everyone prepare for midterms, amplified audio and group chatter are prohibited inside the Library Annex from October 5 to 12.', audience: 'Students', publishAt: '2026-09-28T09:00:00.000Z' },
      { title: 'Fire drill this Thursday, 10:00 AM', body: 'A scheduled campus-wide fire drill will take place this Thursday at 10:00 AM. All tenants should post their evacuation plan and secure hot oil/supply during the drill.', audience: 'Everyone', publishAt: '2026-10-01T08:00:00.000Z' },
    ];
    for (const spec of annSpecs) {
      const ann = await create('api::announcement.announcement', {
        title: spec.title,
        body: spec.body,
        audience: spec.audience,
        pinned: spec.pinned,
        publishAt: spec.publishAt,
        expireAt: spec.expireAt ?? null,
      });
      announcements[spec.title] = { id: ann.id, documentId: ann.documentId, publishAt: spec.publishAt };
    }
    for (const key of Object.keys(announcements)) {
      await strapi.entityService.update('api::announcement.announcement', announcements[key].id, { data: { publishedAt: announcements[key].publishAt } });
    }
    console.log(`created ${annSpecs.length} announcements`);

    // ------------------------------------------------- acknowledgments
    const ackTargets = [
      ['SU Fun Run 2026 is back', ['s1', 's2', 't1', 't9']],
      ['Fire drill this Thursday, 10:00 AM', ['oas', 't2', 't6']],
    ];
    let ackCount = 0;
    for (const [title, userKeys] of ackTargets) {
      for (const uk of userKeys) {
        await create('api::announcement-acknowledgment.announcement-acknowledgment', {
          announcement: announcements[title].documentId,
          user: users[uk].id,
          acknowledgedAt: stamp('2026-10-02'),
        });
        ackCount += 1;
      }
    }
    console.log(`created ${ackCount} announcement acknowledgments`);

    // ----------------------------------------------------------- notifications
    const notifSpecs = [
      { recipient: 'oas', type: 'application', entityType: 'rental-application', entityId: String(apps[0].id), entityLabel: 'Nick Bustamante - DL-004', title: 'New rental application received', description: 'Nick Bustamante applied for Stall 4 (DHVSU Library).', read: false, actorUsername: 'nick.bustamante' },
      { recipient: 'a1', type: 'application', entityType: 'rental-application', entityId: String(apps[0].id), entityLabel: 'DL-004 application', title: 'Application is now pending', description: 'Your application for Stall 4 is awaiting OAS review.', read: false },
      { recipient: 'a2', type: 'application', entityType: 'rental-application', entityId: String(apps[2].id), entityLabel: 'UH-002 application', title: 'Application moved for recommendation', description: 'Your application has passed review and is now for recommendation.', read: true, actorUsername: 'marites.ocampo' },
      { recipient: 'a3', type: 'application', entityType: 'rental-application', entityId: String(apps[3].id), entityLabel: 'M-001 application', title: 'Application approved', description: 'Congratulations! Your application for Motorpool Bay 1 was approved.', read: true, actorUsername: 'marites.ocampo' },
      { recipient: 't1', type: 'ticket', entityType: 'maintenance-ticket', entityId: String(tickets[0].id), entityLabel: 'Plumbing ticket', title: 'Ticket marked in progress', description: 'The plumber has been scheduled for your sink clog ticket.', read: false, actorUsername: 'marites.ocampo' },
      { recipient: 't5', type: 'ticket', entityType: 'maintenance-ticket', entityId: String(tickets[1].id), entityLabel: 'Electrical ticket', title: 'Ticket completed', description: 'Your lighting issue has been resolved.', read: true, actorUsername: 'marites.ocampo' },
      { recipient: 't1', type: 'receipt', entityType: 'bill', entityId: '', entityLabel: 'Bill 2026-06', title: 'Receipt verified', description: 'Your June 2026 bill payment has been verified.', read: true, actorUsername: 'marites.ocampo' },
      { recipient: 't6', type: 'receipt', entityType: 'bill', entityId: '', entityLabel: 'Bill 2026-07', title: 'Payment pending verification', description: 'Your July 2026 payment is awaiting receipt verification.', read: false, actorUsername: 'marites.ocampo' },
      { recipient: 't5', type: 'follow-up', entityType: 'bill', entityId: '', entityLabel: 'Bill 2026-03', title: 'Receipt rejected', description: 'Your March 2026 payment was rejected - receipt unreadable. Please resubmit.', read: false, actorUsername: 'marites.ocampo' },
      { recipient: 't1', type: 'announcement', entityType: 'announcement', entityId: String(announcements['SU Fun Run 2026 is back'].id), entityLabel: 'SU Fun Run 2026', title: 'New announcement', description: 'SU Fun Run 2026 is back - read the details.', read: true, actorUsername: 'gilbert.santos' },
    ];
    for (const n of notifSpecs) {
      await create('api::notification.notification', {
        type: n.type,
        recipient: users[n.recipient].id,
        entityType: n.entityType,
        entityId: n.entityId,
        entityLabel: n.entityLabel,
        title: n.title,
        description: n.description,
        read: n.read,
        actorUsername: n.actorUsername,
      });
    }
    console.log(`created ${notifSpecs.length} notifications`);

    // ----------------------------------------------------------- status history
    const historySpecs = [
      { entityType: 'rental-application', entityId: String(apps[0].id), fromStatus: null, toStatus: 'Pending', changedBy: 'oas', changedAt: '2026-10-01' },
      { entityType: 'rental-application', entityId: String(apps[0].id), fromStatus: 'Pending', toStatus: 'For Review', changedBy: 'oas', changedAt: '2026-10-02' },
      { entityType: 'rental-application', entityId: String(apps[2].id), fromStatus: 'Pending', toStatus: 'For Review', changedBy: 'oas', changedAt: '2026-09-19' },
      { entityType: 'rental-application', entityId: String(apps[2].id), fromStatus: 'For Review', toStatus: 'For Recommendation', changedBy: 'oas', changedAt: '2026-09-22' },
      { entityType: 'rental-application', entityId: String(apps[3].id), fromStatus: 'For Recommendation', toStatus: 'Approved', changedBy: 'oas', changedAt: '2026-09-11' },
      { entityType: 'renewal-intent', entityId: String(renewals[0].id), fromStatus: null, toStatus: 'Pending', changedBy: 'oas', changedAt: '2026-09-15' },
      { entityType: 'maintenance-ticket', entityId: String(tickets[0].id), fromStatus: 'Pending', toStatus: 'In Progress', changedBy: 'oas', changedAt: '2026-09-29' },
      { entityType: 'maintenance-ticket', entityId: String(tickets[1].id), fromStatus: 'Pending', toStatus: 'In Progress', changedBy: 'oas', changedAt: '2026-09-20' },
      { entityType: 'maintenance-ticket', entityId: String(tickets[1].id), fromStatus: 'In Progress', toStatus: 'Completed', changedBy: 'oas', changedAt: '2026-09-21' },
      { entityType: 'tenancy', entityId: String(tenancies['Iron Press Laundry'].id), fromStatus: 'Active', toStatus: 'Terminated', changedBy: 'oas', changedAt: '2026-03-31' },
      { entityType: 'tenancy', entityId: String(tenancies['Bread & Butter Bakery'].id), fromStatus: 'Active', toStatus: 'Ended', changedBy: 'oas', changedAt: '2026-06-30' },
    ];
    for (const h of historySpecs) {
      await create('api::status-history.status-history', {
        entityType: h.entityType,
        entityId: h.entityId,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        changedBy: users[h.changedBy].id,
        changedAt: stamp(h.changedAt),
      });
    }
    console.log(`created ${historySpecs.length} status history entries`);

    // --------------------------------------------------------------- audit log
    const auditSpecs = [
      { action: 'login-success', entityType: 'auth', entityId: String(users.admin.id), entityLabel: users.admin.username, description: `${users.admin.username} signed in as admin`, actorId: users.admin.id, actorUsername: users.admin.username, actorRole: 'admin' },
      { action: 'login-success', entityType: 'auth', entityId: String(users.oas.id), entityLabel: users.oas.username, description: `${users.oas.username} signed in as oas`, actorId: users.oas.id, actorUsername: users.oas.username, actorRole: 'oas' },
      { action: 'account-created', entityType: 'user', entityLabel: users.t1.username, description: `Seeded account created for ${users.t1.username}`, actorId: users.admin.id, actorUsername: users.admin.username, actorRole: 'admin' },
      { action: 'account-created', entityType: 'user', entityLabel: users.a1.username, description: `Seeded account created for ${users.a1.username}`, actorId: users.admin.id, actorUsername: users.admin.username, actorRole: 'admin' },
      { action: 'role-changed', entityType: 'user', entityLabel: users.t11.username, description: 'Role remained current-tenant while renewal is processed', actorId: users.oas.id, actorUsername: users.oas.username, actorRole: 'oas' },
      { action: 'system-error', entityType: 'email', entityLabel: 'smtp.gmail.com', description: 'Transient SMTP timeout on a verification email (retried successfully)', actorId: null, actorUsername: 'system', actorRole: 'system' },
    ];
    for (const a of auditSpecs) {
      await create('api::audit-log.audit-log', {
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        entityLabel: a.entityLabel,
        description: a.description,
        actorId: a.actorId,
        actorUsername: a.actorUsername,
        actorRole: a.actorRole,
      });
    }
    console.log(`created ${auditSpecs.length} audit logs`);

    console.log('\n===== SEED COMPLETE =====');
    console.log(`mock users       : ${Object.keys(users).length} (password: ${PASSWORD})`);
    console.log(`property spaces  : ${spaces.length} (${occupied.length} occupied)`);
    console.log(`map zones/labels : ${Object.keys(footprints).length + Object.keys(landmarks).length} / ${Object.keys(labelMap).length}`);
    console.log(`tenancies        : ${Object.keys(tenancies).length}`);
    console.log(`meter readings   : ${mReadCount}`);
    console.log(`bills            : ${billCount}`);
    console.log(`applications     : ${apps.length} | renewals: ${renewals.length}`);
    console.log(`tickets          : ${tickets.length} | feedback: ${feedbacks.length}`);
    console.log(`announcements    : ${annSpecs.length} | acknowledgments: ${ackCount}`);
    console.log(`notifications    : ${notifSpecs.length} | histories: ${historySpecs.length} | audit: ${auditSpecs.length}`);
    console.log(`media files      : ${uploaded.length}`);
  } catch (err) {
    console.error('SEED FAILED:', err);
    process.exitCode = 1;
  } finally {
    await strapi.destroy();
  }
})();