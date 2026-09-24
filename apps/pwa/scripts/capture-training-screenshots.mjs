/**
 * Capture PEERPoint training screenshots (viewport-sized, role-ready).
 * Saves PNGs to docs/training/screenshots/
 *
 * From apps/pwa:
 *   node scripts/capture-training-screenshots.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MEMBER_BASE = 'https://mypeerpoint.com';
const ADMIN_BASE = 'https://admin.mypeerpoint.com';
const SITE_CODE = 'slcoso';
const STAFF_EMAIL = 'ssmith@saltlakecounty.gov';
const STAFF_TEMP = 'ssmith1234';
const STAFF_NEW_PW = 'SsmithDemo2026!';
const ADMIN_USER = 'admin';
const ADMIN_PW = 'PeersStandWithYou2026!';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../../../docs/training/screenshots');
fs.mkdirSync(OUT, { recursive: true });

async function api(base, method, urlPath, { token, body } = {}) {
  const res = await fetch(`${base}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({
    path: file,
    fullPage: false,
    animations: 'disabled',
    timeout: 60000
  });
  console.log(`  📷 ${name}.png`);
  return file;
}

async function unlockMemberUi(page, { shootGate = false } = {}) {
  const gate = page.locator('.member-access-modal');
  const gateVisible = await gate.isVisible().catch(() => false);
  if (!gateVisible) return true;
  if (shootGate) await shot(page, 'member-01-site-use-code');

  // Prefer Playwright fill (React-friendly) once SW reload is blocked
  const input = page.locator('input[name="peerpoint-site-use-code"]');
  await input.waitFor({ state: 'visible' });
  await input.fill(SITE_CODE);
  await page.waitForTimeout(150);

  const submit = page.locator('.member-access-modal button[type="submit"]');
  const respPromise = page.waitForResponse(
    r => r.url().includes('/api/member-access') && r.request().method() === 'POST',
    { timeout: 20000 }
  );
  await submit.click();
  const resp = await respPromise;
  console.log('  unlock API:', resp.status(), await resp.json().catch(() => ({})));
  try {
    await page.waitForSelector('.member-access-modal', { state: 'hidden', timeout: 15000 });
    await page.waitForTimeout(400);
    return true;
  } catch {
    const err = await page.locator('.member-access-modal').innerText().catch(() => '');
    console.log('  ⚠ unlock failed:', err.slice(0, 200));
    return false;
  }
}

async function ensureUnlockedOn(page, urlPath, shotName) {
  await page.goto(`${MEMBER_BASE}${urlPath}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    try {
      localStorage.setItem('peerpoint_ui_mode', 'classic');
    } catch {
      /* ignore */
    }
  });
  // Gate remounts on every full navigation — unlock each time before shooting.
  await unlockMemberUi(page, { shootGate: shotName === 'member-01-site-use-code' });
  if (shotName === 'member-01-site-use-code') {
    // Already shot the gate; now unlock for subsequent classic pages in this session
    // by staying on the SPA and using in-app nav below.
    return;
  }
  await page.waitForTimeout(600);
  await shot(page, shotName);
}

async function injectStaff(page, base, token, meta) {
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ({ token, meta }) => {
      localStorage.setItem('peerpoint_ui_mode', 'classic');
      sessionStorage.setItem('peerpoint_staff_token', token);
      sessionStorage.setItem('peerpoint_staff_meta', JSON.stringify(meta));
    },
    { token, meta }
  );
}

async function clickTab(page, name) {
  const tab = page.getByRole('tab', { name: new RegExp(`^${name}$`, 'i') });
  if (await tab.isVisible().catch(() => false)) {
    await tab.click();
    await page.waitForTimeout(900);
    return true;
  }
  // Fallback: plain button text
  const btn = page.getByRole('button', { name: new RegExp(`^${name}$`, 'i') });
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(900);
    return true;
  }
  console.log(`  ⚠ tab not found: ${name}`);
  return false;
}

async function passConfidentiality(page, roomCode) {
  if (roomCode) {
    await page.evaluate(room => {
      const key = `peerpoint_confidentiality_ack:room:${String(room).trim().toLowerCase()}`;
      sessionStorage.setItem(key, '1');
    }, roomCode);
  }
  const backdrop = page.locator('.peer-confidentiality-backdrop, .expect-modal-backdrop');
  if (!(await backdrop.first().isVisible().catch(() => false))) return;
  const confCheck = page.locator('.peer-confidentiality-modal__check input[type="checkbox"]');
  if (await confCheck.count()) await confCheck.check({ force: true });
  await page.getByRole('button', { name: /Continue/i }).click({ force: true }).catch(() => undefined);
  await page.waitForTimeout(500);
}

async function main() {
  console.log('Capturing training screenshots →', OUT);

  const adminLogin = await api(MEMBER_BASE, 'POST', '/api/staff/login', {
    body: { username: ADMIN_USER, password: ADMIN_PW }
  });
  if (!adminLogin.ok) throw new Error(`Admin login failed: ${JSON.stringify(adminLogin.data)}`);
  const adminToken = adminLogin.data.token;
  const adminMeta = {
    role: adminLogin.data.role,
    username: adminLogin.data.username,
    displayName: adminLogin.data.displayName,
    mustChangePassword: false
  };

  await api(MEMBER_BASE, 'PATCH', '/api/staff/accounts', {
    token: adminToken,
    body: { username: STAFF_EMAIL, temporaryPassword: STAFF_TEMP, active: true }
  });

  const start = new Date();
  const end = new Date(start.getTime() + 6 * 60 * 60 * 1000);
  await api(MEMBER_BASE, 'PATCH', '/api/staff/requests', {
    token: adminToken,
    body: {
      action: 'addOnCall',
      username: STAFF_EMAIL,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      availabilityAcknowledged: true,
      modalities: 'both'
    }
  });

  let staffLogin = await api(MEMBER_BASE, 'POST', '/api/staff/login', {
    body: { username: STAFF_EMAIL, password: STAFF_TEMP }
  });
  if (!staffLogin.ok) {
    staffLogin = await api(MEMBER_BASE, 'POST', '/api/staff/login', {
      body: { username: STAFF_EMAIL, password: STAFF_NEW_PW }
    });
  }
  if (!staffLogin.ok) throw new Error(`Staff login failed: ${JSON.stringify(staffLogin.data)}`);
  if (staffLogin.data.mustChangePassword) {
    await api(MEMBER_BASE, 'POST', '/api/staff/change-password', {
      token: staffLogin.data.token,
      body: { currentPassword: STAFF_TEMP, newPassword: STAFF_NEW_PW }
    });
    staffLogin = await api(MEMBER_BASE, 'POST', '/api/staff/login', {
      body: { username: STAFF_EMAIL, password: STAFF_NEW_PW }
    });
  }
  const staffToken = staffLogin.data.token;
  const staffMeta = {
    role: staffLogin.data.role,
    username: staffLogin.data.username,
    displayName: staffLogin.data.displayName,
    mustChangePassword: false
  };

  await api(MEMBER_BASE, 'PATCH', '/api/staff/requests', {
    token: staffToken,
    body: { action: 'setPeerAvailable', available: true }
  });

  const existing = await api(MEMBER_BASE, 'GET', '/api/staff/requests', { token: staffToken });
  for (const r of existing.data.requests || []) {
    const mine =
      String(r.assignedPeerUsername || '').toLowerCase() === STAFF_EMAIL.toLowerCase() &&
      (r.status === 'queued' || r.status === 'assigned' || r.status === 'open');
    if (mine) {
      await api(MEMBER_BASE, 'PATCH', '/api/staff/requests', {
        token: staffToken,
        body: { action: 'close', id: r.id }
      });
    }
  }
  await api(MEMBER_BASE, 'PATCH', '/api/staff/requests', {
    token: staffToken,
    body: { action: 'setPeerAvailable', available: true }
  });

  const browser = await chromium.launch({ headless: true });
  const memberCtx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block'
  });
  const staffCtx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block'
  });
  const adminCtx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block'
  });
  const member = await memberCtx.newPage();
  const staff = await staffCtx.newPage();
  const admin = await adminCtx.newPage();

  // ---------- MEMBER ----------
  console.log('\n=== MEMBER ===');
  // Gate-only shot on a throwaway page (never unlock here)
  const gatePage = await memberCtx.newPage();
  await gatePage.goto(`${MEMBER_BASE}/`, { waitUntil: 'domcontentloaded' });
  await gatePage.evaluate(() => localStorage.setItem('peerpoint_ui_mode', 'classic'));
  await gatePage.waitForSelector('.member-access-modal', { timeout: 15000 });
  await shot(gatePage, 'member-01-site-use-code');
  await gatePage.close();

  await member.goto(`${MEMBER_BASE}/`, { waitUntil: 'domcontentloaded' });
  await member.evaluate(() => localStorage.setItem('peerpoint_ui_mode', 'classic'));
  const unlockedHome = await unlockMemberUi(member);
  if (!unlockedHome) throw new Error('Could not unlock member home');
  await shot(member, 'member-02-home-request');

  for (const [pathUrl, name] of [
    ['/self-help', 'member-03-self-help'],
    ['/resources', 'member-04-resources']
  ]) {
    await member.goto(`${MEMBER_BASE}${pathUrl}`, { waitUntil: 'domcontentloaded' });
    await unlockMemberUi(member);
    await member.waitForTimeout(700);
    await shot(member, name);
  }

  // Modern UI shots
  await member.evaluate(() => localStorage.setItem('peerpoint_ui_mode', 'modern'));
  await member.goto(`${MEMBER_BASE}/`, { waitUntil: 'domcontentloaded' });
  await unlockMemberUi(member);
  await shot(member, 'member-02b-modern-home');

  await member.goto(`${MEMBER_BASE}/m/request`, { waitUntil: 'domcontentloaded' });
  await unlockMemberUi(member);
  await member.waitForTimeout(700);
  await shot(member, 'member-05-request-intro');

  // ---------- STAFF ----------
  console.log('\n=== STAFF ===');
  const loginPage = await staffCtx.newPage();
  await loginPage.goto(`${MEMBER_BASE}/staff`, { waitUntil: 'networkidle' });
  await loginPage.evaluate(() => {
    localStorage.setItem('peerpoint_ui_mode', 'classic');
    sessionStorage.clear();
  });
  await loginPage.reload({ waitUntil: 'networkidle' });
  await loginPage.waitForTimeout(500);
  await shot(loginPage, 'staff-01-login');
  await loginPage.close();

  await injectStaff(staff, MEMBER_BASE, staffToken, staffMeta);
  await staff.goto(`${MEMBER_BASE}/staff`, { waitUntil: 'networkidle' });
  await staff.mouse.click(20, 20);
  await staff.waitForTimeout(800);
  await shot(staff, 'staff-02-workspace');

  await clickTab(staff, 'On Call');
  await shot(staff, 'staff-03-on-call');

  await clickTab(staff, 'Requests');

  const created = await api(MEMBER_BASE, 'POST', '/api/peer-queue', {
    body: {
      accessCode: SITE_CODE,
      contactMode: 'chat',
      displayName: 'Training Screenshot Member',
      requesterPhone: '8015550199',
      requesterEmail: 'training-shots@example.com',
      matchMode: 'anyone',
      sexPreference: 'either'
    }
  });
  if (!created.ok) throw new Error(`peer-queue failed: ${JSON.stringify(created.data)}`);
  const { requestId, roomCode } = created.data;
  console.log('  request', requestId, roomCode);

  for (let i = 0; i < 12; i++) {
    if (await staff.locator('.staff-assignment-alert').isVisible().catch(() => false)) break;
    await staff.getByRole('button', { name: /Refresh/i }).click().catch(() => undefined);
    await staff.waitForTimeout(700);
  }
  await staff.mouse.click(40, 40);
  await staff.waitForTimeout(800);
  await shot(staff, 'staff-04-assignment-alert');

  const accept = staff.getByRole('button', { name: /Accept/i }).first();
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
    await staff.waitForTimeout(2000);
  } else {
    await api(MEMBER_BASE, 'PATCH', '/api/staff/requests', {
      token: staffToken,
      body: { action: 'acceptQueue', id: requestId }
    });
    await staff.reload({ waitUntil: 'networkidle' });
    await injectStaff(staff, MEMBER_BASE, staffToken, staffMeta);
    await staff.goto(`${MEMBER_BASE}/staff`, { waitUntil: 'networkidle' });
  }
  await shot(staff, 'staff-05-after-accept');

  // Member in room
  await member.evaluate(() => localStorage.setItem('peerpoint_ui_mode', 'classic'));
  await member.goto(`${MEMBER_BASE}/chat?room=${encodeURIComponent(roomCode)}&from=join`, {
    waitUntil: 'domcontentloaded'
  });
  await member.evaluate(
    ({ code, room }) => {
      sessionStorage.setItem('peerpoint_join_bypass', '1');
      sessionStorage.setItem('peerpoint_site_use_code', code);
      localStorage.setItem('peerpoint_chat_display_name', 'Training Member');
      sessionStorage.setItem(
        `peerpoint_confidentiality_ack:room:${String(room).trim().toLowerCase()}`,
        '1'
      );
    },
    { code: SITE_CODE, room: roomCode }
  );
  await member.reload({ waitUntil: 'networkidle' });
  await passConfidentiality(member, roomCode);
  if (await member.getByRole('button', { name: /Join room/i }).isVisible().catch(() => false)) {
    await member.locator('input').first().fill('Training Member');
    await member.getByRole('button', { name: /Join room/i }).click();
    await member.waitForTimeout(1200);
  }
  await shot(member, 'member-06-waiting-in-room');

  await staff.goto(`${MEMBER_BASE}/chat?room=${encodeURIComponent(roomCode)}`, {
    waitUntil: 'domcontentloaded'
  });
  await staff.evaluate(room => {
    localStorage.setItem('peerpoint_chat_display_name', 'Peer Support Staff');
    sessionStorage.setItem(`peerpoint_confidentiality_ack:room:${String(room).trim().toLowerCase()}`, '1');
  }, roomCode);
  await passConfidentiality(staff, roomCode);
  if (await staff.getByRole('button', { name: /Join room/i }).isVisible().catch(() => false)) {
    await staff.locator('input').first().fill('Peer Support Staff');
    await staff.getByRole('button', { name: /Join room/i }).click();
    await staff.waitForTimeout(2000);
  }
  await shot(staff, 'staff-06-in-chat');

  await member.bringToFront();
  // Presence can take a few seconds to sync via Ably
  for (let i = 0; i < 20; i++) {
    if (await member.locator('.peer-joined-alert').isVisible().catch(() => false)) break;
    await member.waitForTimeout(500);
  }
  if (!(await member.locator('.peer-joined-alert').isVisible().catch(() => false))) {
    // Force a soft reload of presence by typing a no-op wait then re-check
    await member.waitForTimeout(2500);
  }
  await shot(member, 'member-07-peer-joined-alert');

  await api(MEMBER_BASE, 'PATCH', '/api/staff/requests', {
    token: staffToken,
    body: { action: 'close', id: requestId }
  });

  // ---------- ADMIN ----------
  console.log('\n=== ADMIN ===');
  await injectStaff(admin, ADMIN_BASE, adminToken, adminMeta);
  await admin.goto(`${ADMIN_BASE}/`, { waitUntil: 'networkidle' });
  await admin.waitForTimeout(900);
  await shot(admin, 'admin-01-workspace');

  await clickTab(admin, 'Members');
  await shot(admin, 'admin-02-members');

  await clickTab(admin, 'On Call');
  await shot(admin, 'admin-03-on-call');

  await clickTab(admin, 'Content');
  await shot(admin, 'admin-04-content');

  await clickTab(admin, 'Reports');
  await shot(admin, 'admin-05-reports');

  await clickTab(admin, 'Requests');
  await shot(admin, 'admin-06-requests');

  for (const [src, dest] of [
    ['staff-02-workspace', 'leader-01-workspace'],
    ['staff-04-assignment-alert', 'leader-02-assignment-alert'],
    ['admin-02-members', 'leader-03-members-leaders'],
    ['admin-03-on-call', 'leader-04-on-call']
  ]) {
    const a = path.join(OUT, `${src}.png`);
    const b = path.join(OUT, `${dest}.png`);
    if (fs.existsSync(a)) fs.copyFileSync(a, b);
  }

  // cleanup previews
  for (const f of fs.readdirSync(OUT)) {
    if (f.startsWith('_preview_')) fs.unlinkSync(path.join(OUT, f));
  }

  await browser.close();
  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.png'));
  console.log(`\nDone. ${files.length} screenshots in ${OUT}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
