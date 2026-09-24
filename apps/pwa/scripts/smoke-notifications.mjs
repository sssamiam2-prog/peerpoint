/**
 * Smoke demo: notifications as MEMBER + as PEER SUPPORTER.
 * Uses API session inject for reliable staff login, Playwright for UI + screenshots.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://mypeerpoint.com';
const SITE_CODE = 'slcoso';
const STAFF_EMAIL = 'ssmith@saltlakecounty.gov';
const STAFF_TEMP = 'ssmith1234';
const STAFF_NEW_PW = 'SsmithDemo2026!';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'smoke-out');
fs.mkdirSync(OUT, { recursive: true });

const log = (role, step, detail = '') => {
  console.log(`\n>>> [${role}] ${step}`);
  if (detail) console.log(detail);
};

async function api(method, urlPath, { token, body } = {}) {
  const res = await fetch(`${BASE}${urlPath}`, {
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
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  📷 ${name}.png`);
  return file;
}

async function passConfidentiality(page, roomCode) {
  if (roomCode) {
    await page.evaluate(room => {
      const key = `peerpoint_confidentiality_ack:room:${String(room).trim().toLowerCase()}`;
      sessionStorage.setItem(key, '1');
    }, roomCode);
    // If modal already open, reload so ack is honored
    const open = await page.locator('.peer-confidentiality-backdrop').isVisible().catch(() => false);
    if (open) {
      await page.reload({ waitUntil: 'networkidle' });
      return;
    }
  }
  const backdrop = page.locator('.peer-confidentiality-backdrop, .expect-modal-backdrop');
  if (!(await backdrop.first().isVisible().catch(() => false))) return;
  const confCheck = page.locator('.peer-confidentiality-modal__check input[type="checkbox"]');
  await confCheck.check({ force: true });
  await page.getByRole('button', { name: /Continue to peer support/i }).click({ force: true });
  await page.waitForTimeout(800);
}

async function main() {
  log('SETUP', 'Reset Sam temp password, put on call, open browsers');
  const admin = await api('POST', '/api/staff/login', {
    body: { username: 'admin', password: 'PeersStandWithYou2026!' }
  });
  if (!admin.ok) throw new Error(`Admin login failed: ${JSON.stringify(admin.data)}`);
  const adminToken = admin.data.token;

  await api('PATCH', '/api/staff/accounts', {
    token: adminToken,
    body: { username: STAFF_EMAIL, temporaryPassword: STAFF_TEMP, active: true }
  });

  const start = new Date();
  const end = new Date(start.getTime() + 6 * 60 * 60 * 1000);
  await api('PATCH', '/api/staff/requests', {
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

  let staffLogin = await api('POST', '/api/staff/login', {
    body: { username: STAFF_EMAIL, password: STAFF_TEMP }
  });
  if (!staffLogin.ok) throw new Error(`Staff login failed: ${JSON.stringify(staffLogin.data)}`);

  // Finish forced password change via API so UI is usable
  if (staffLogin.data.mustChangePassword) {
    const ch = await api('POST', '/api/staff/change-password', {
      token: staffLogin.data.token,
      body: { currentPassword: STAFF_TEMP, newPassword: STAFF_NEW_PW }
    });
    console.log('  password change:', ch.status, ch.data);
    staffLogin = await api('POST', '/api/staff/login', {
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

  await api('PATCH', '/api/staff/requests', {
    token: staffToken,
    body: { action: 'setPeerAvailable', available: true }
  });

  // Close any leftover queued/assigned requests holding Sam busy from prior smoke runs
  const existing = await api('GET', '/api/staff/requests', { token: staffToken });
  for (const r of existing.data.requests || []) {
    const mine =
      String(r.assignedPeerUsername || '').toLowerCase() === STAFF_EMAIL.toLowerCase() &&
      (r.status === 'queued' || r.status === 'assigned' || r.status === 'open');
    if (mine) {
      await api('PATCH', '/api/staff/requests', {
        token: staffToken,
        body: { action: 'close', id: r.id }
      });
      console.log('  closed leftover request', r.id, r.status);
    }
  }
  await api('PATCH', '/api/staff/requests', {
    token: staffToken,
    body: { action: 'setPeerAvailable', available: true }
  });

  const browser = await chromium.launch({ headless: false, slowMo: 80 });
  const staffCtx = await browser.newContext({ viewport: { width: 1180, height: 920 } });
  const memberCtx = await browser.newContext({ viewport: { width: 1180, height: 920 } });
  const staff = await staffCtx.newPage();
  const member = await memberCtx.newPage();

  // --- PEER SUPPORTER workspace open ---
  log(
    'PEER SUPPORTER (you as Sam)',
    'STEP A — Staff workspace open & available',
    'Session injected; soft audio unlocks on first click'
  );
  await staff.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await staff.evaluate(
    ({ token, meta }) => {
      localStorage.setItem('peerpoint_ui_mode', 'classic');
      sessionStorage.setItem('peerpoint_staff_token', token);
      sessionStorage.setItem('peerpoint_staff_meta', JSON.stringify(meta));
    },
    { token: staffToken, meta: staffMeta }
  );
  await staff.goto(`${BASE}/staff`, { waitUntil: 'networkidle' });
  await staff.mouse.click(20, 20);
  await staff.waitForTimeout(1200);
  await shot(staff, '01-peer-supporter-workspace');

  // --- MEMBER requests support ---
  log(
    'MEMBER (you asking for help)',
    'STEP B — Create peer-support chat request (API = same path as Request Help / peer queue)',
    'This offers the request to on-call Sam and triggers email/SMS (if not paused) + in-app alert'
  );
  const created = await api('POST', '/api/peer-queue', {
    body: {
      accessCode: SITE_CODE,
      contactMode: 'chat',
      displayName: 'Smoke Test Member',
      requesterPhone: '8015550199',
      requesterEmail: 'smoke-member@example.com',
      matchMode: 'anyone',
      sexPreference: 'either'
    }
  });
  console.log('  peer-queue:', created.status, JSON.stringify(created.data));
  if (!created.ok) throw new Error(`peer-queue failed: ${JSON.stringify(created.data)}`);
  const { requestId, roomCode, memberJoinToken, notifySummary, emailedStaff, smsStaff, memberSms } =
    created.data;

  log(
    'BOTH',
    'STEP C — Email + SMS delivery result',
    `notifySummary: ${notifySummary}\nemailedStaff=${emailedStaff} smsStaff=${smsStaff} memberSms=${memberSms}\n(If staff email/SMS skipped: PEERPOINT_PAUSE_STAFF_NOTIFY defaults to paused in production.)`
  );

  log(
    'PEER SUPPORTER',
    'STEP D — IN-APP ASSIGNMENT ALERT + soft looping sound',
    'Banner “Peer support request waiting for you”; sound every ~4s until Clear / Accept'
  );
  await staff.bringToFront();
  await staff.getByRole('button', { name: /Refresh/i }).click().catch(() => {});
  // Polling is 5s; wait for banner
  for (let i = 0; i < 8; i++) {
    if (await staff.locator('.staff-assignment-alert').isVisible().catch(() => false)) break;
    await staff.waitForTimeout(1000);
    await staff.getByRole('button', { name: /Refresh/i }).click().catch(() => {});
  }
  const alertVisible = await staff.locator('.staff-assignment-alert').isVisible().catch(() => false);
  console.log('  assignment alert visible:', alertVisible);
  // Click page to ensure audio context unlocked, then wait one pulse
  await staff.mouse.click(40, 40);
  await staff.waitForTimeout(4500);
  await shot(staff, '02-peer-supporter-assignment-alert');

  log('PEER SUPPORTER', 'STEP E — Accept request (stops alert; room assigned)');
  const accept = staff.getByRole('button', { name: /Accept/i }).first();
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
    await staff.waitForTimeout(2500);
  } else {
    const acc = await api('PATCH', '/api/staff/requests', {
      token: staffToken,
      body: { action: 'acceptQueue', id: requestId }
    });
    console.log('  acceptQueue API:', acc.status, acc.data.roomCode || acc.data.error);
    await staff.reload({ waitUntil: 'networkidle' });
  }
  await shot(staff, '03-peer-supporter-after-accept');

  const liveRoom = roomCode;
  log('MEMBER', 'STEP F — Join chat room (waiting for peer)', `Room ${liveRoom}`);
  await member.bringToFront();
  await member.goto(`${BASE}/chat?room=${encodeURIComponent(liveRoom)}&from=join`, {
    waitUntil: 'domcontentloaded'
  });
  await member.evaluate(
    ({ code, room }) => {
      localStorage.setItem('peerpoint_ui_mode', 'classic');
      sessionStorage.setItem('peerpoint_join_bypass', '1');
      sessionStorage.setItem('peerpoint_join_room', room);
      sessionStorage.setItem('peerpoint_site_use_code', code);
    },
    { code: SITE_CODE, room: liveRoom }
  );
  await member.reload({ waitUntil: 'networkidle' });

  // Confidentiality modal: check then continue
  await passConfidentiality(member, liveRoom);

  const nick = member.locator('input[placeholder*="Nickname"], input[placeholder*="label" i]').first();
  if (await nick.isVisible().catch(() => false)) {
    await nick.fill('Smoke Member');
    await member.getByRole('button', { name: /Join room/i }).click();
  }
  await member.waitForTimeout(2500);
  await shot(member, '04-member-waiting-in-room');

  log('PEER SUPPORTER', 'STEP G — Join the same room (staff enters chat)');
  await staff.bringToFront();
  await staff.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' });
  await staff.evaluate(room => {
    const code = String(room).trim().toUpperCase();
    sessionStorage.setItem(`peerpoint_confidentiality_ack:room:${code.toLowerCase()}`, '1');
    sessionStorage.setItem('peerpoint_chat_display_name', 'Peer Supporter Sam');
    sessionStorage.setItem('peerpoint_join_bypass', '1');
  }, liveRoom);
  await staff.goto(
    `${BASE}/chat?room=${encodeURIComponent(liveRoom)}&from=join`,
    { waitUntil: 'networkidle' }
  );
  await staff.waitForTimeout(2000);
  // If join form still showing, complete it
  const staffNick = staff.locator('input[placeholder*="Nickname"], input[placeholder*="label" i]').first();
  if (await staffNick.isVisible().catch(() => false)) {
    await staffNick.fill('Peer Supporter Sam');
    const joinBtn = staff.getByRole('button', { name: /Join room/i });
    if (await joinBtn.isVisible().catch(() => false)) {
      await joinBtn.click({ force: true });
    }
  }
  // Dismiss confidentiality if still up
  if (await staff.locator('.peer-confidentiality-backdrop').isVisible().catch(() => false)) {
    await staff.locator('.peer-confidentiality-modal__check input[type="checkbox"]').check({ force: true });
    await staff.getByRole('button', { name: /Continue to peer support/i }).click({ force: true });
    await staff.waitForTimeout(1500);
  }
  await staff.waitForTimeout(2500);
  await shot(staff, '05-peer-supporter-joined-room');

  log(
    'MEMBER',
    'STEP H — PEER-JOINED ALERT + soft looping sound',
    'Banner “Someone joined your support room” until Clear notice'
  );
  await member.bringToFront();
  await member.mouse.click(30, 30);
  for (let i = 0; i < 6; i++) {
    if (await member.locator('.peer-joined-alert').isVisible().catch(() => false)) break;
    await member.waitForTimeout(1000);
  }
  console.log(
    '  peer-joined alert visible:',
    await member.locator('.peer-joined-alert').isVisible().catch(() => false)
  );
  await member.waitForTimeout(4000);
  await shot(member, '06-member-peer-joined-alert');
  const clearBtn = member.getByRole('button', { name: /Clear notice/i });
  if (await clearBtn.isVisible().catch(() => false)) await clearBtn.click();

  log(
    'PEER SUPPORTER → MEMBER',
    'STEP I — Staff sends message; MEMBER gets soft message chime'
  );
  await staff.bringToFront();
  await staff.mouse.click(30, 30);
  const staffBox = staff.locator('textarea').last();
  await staffBox.click();
  await staffBox.fill('Hello from your Peer Supporter — this should chime softly for the member.');
  await staff.keyboard.press('Enter');
  await staff.waitForTimeout(1500);
  await shot(staff, '07-peer-supporter-sent-message');

  await member.bringToFront();
  await member.waitForTimeout(2000);
  await shot(member, '08-member-received-message-chime');

  log(
    'MEMBER → PEER SUPPORTER',
    'STEP J — Member replies; PEER SUPPORTER gets soft message chime'
  );
  const memberBox = member.locator('textarea').last();
  await memberBox.click();
  await memberBox.fill('Got it — I heard the soft chime when your message arrived.');
  await member.keyboard.press('Enter');
  await member.waitForTimeout(1500);
  await shot(member, '09-member-replied');
  await staff.bringToFront();
  await staff.waitForTimeout(2000);
  await shot(staff, '10-peer-supporter-received-reply-chime');

  const summary = {
    requestId,
    roomCode,
    memberJoinToken,
    notifySummary,
    emailedStaff,
    smsStaff,
    memberSms,
    screenshots: fs.readdirSync(OUT).filter(f => f.endsWith('.png')).sort()
  };
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log('\n✅ Smoke demo complete. Screenshots in scripts/smoke-out/');
  console.log(JSON.stringify(summary, null, 2));
  console.log('\nLeaving browsers open 25s for you to look…');
  await staff.waitForTimeout(25000);
  await browser.close();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
