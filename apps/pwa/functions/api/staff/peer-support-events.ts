import { loadUsers, requireStaffOrAdmin } from '../../_lib/staffAuth';
import {
  clampEventMinutes,
  corsHeaders,
  filterPeerSupportEventsForStaffApp,
  json,
  loadAndMaintainPeerSupportEvents,
  loadPeerSupportHelpTypes,
  newId,
  normalizePrpsGender,
  normalizeWorkRelatedIncident,
  parseEventDate,
  savePeerSupportEvents,
  type Env,
  type PeerSupportEvent
} from '../../_lib/store';

type Ctx = { request: Request; env: Env };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const auth = await requireStaffOrAdmin(request, env);
  if ('error' in auth) return json({ error: auth.error }, auth.status, origin);

  const url = new URL(request.url);
  const store = await loadAndMaintainPeerSupportEvents(env);
  let events = filterPeerSupportEventsForStaffApp(store.events, auth.session).sort(
    (a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt)
  );

  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw ? Math.min(Math.max(Number(limitRaw), 1), 500) : 100;
  events = events.slice(0, limit);

  const helpTypes = await loadPeerSupportHelpTypes(env);
  const users = await loadUsers(env);
  const providers = users
    .filter(u => u.active && u.setupComplete)
    .map(u => ({
      username: u.username,
      displayName: u.displayName || `${u.firstName} ${u.lastName}`.trim() || u.username
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return json(
    {
      events,
      helpTypes,
      providers,
      retentionDays: 5
    },
    200,
    origin
  );
}

export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const auth = await requireStaffOrAdmin(request, env);
  if ('error' in auth) return json({ error: auth.error }, auth.status, origin);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400, origin);
  }

  const prpsBureau = String(body.prpsBureau ?? '').trim();
  if (!prpsBureau) return json({ error: 'Bureau of the person receiving peer support is required.' }, 400, origin);

  const prpsGender = normalizePrpsGender(body.prpsGender);
  if (!prpsGender) return json({ error: 'Select a valid gender for the person receiving peer support.' }, 400, origin);

  const helpTypes = await loadPeerSupportHelpTypes(env);
  const helpType = String(body.helpType ?? '').trim();
  if (!helpType || !helpTypes.includes(helpType)) {
    return json({ error: 'Select a valid Resources / Referrals option.' }, 400, origin);
  }

  const workRelatedIncident = normalizeWorkRelatedIncident(body.workRelatedIncident);
  if (!workRelatedIncident) {
    return json({ error: 'Select whether this was a work related incident (Yes or No).' }, 400, origin);
  }

  const providerDisplayName = String(body.providerDisplayName ?? '').trim();
  const providerUsername = String(body.providerUsername ?? auth.session.username).trim();
  if (!providerDisplayName) {
    return json({ error: 'Person providing peer support is required.' }, 400, origin);
  }

  const totalMinutes = clampEventMinutes(body.totalMinutes);
  if (totalMinutes == null) {
    return json({ error: 'Enter total time spent (minutes, at least 1).' }, 400, origin);
  }

  const today = new Date().toISOString().slice(0, 10);
  const eventDate = parseEventDate(body.eventDate) ?? today;

  const event: PeerSupportEvent = {
    id: newId(),
    eventDate,
    recordedAt: new Date().toISOString(),
    prpsBureau,
    prpsGender,
    workRelatedIncident,
    helpType,
    providerDisplayName,
    providerUsername,
    totalMinutes,
    createdBy: auth.session.username,
    createdByDisplay: auth.session.displayName || auth.session.username
  };

  const store = await loadAndMaintainPeerSupportEvents(env);
  store.events.unshift(event);
  await savePeerSupportEvents(env, store);

  return json({ ok: true, event }, 201, origin);
}
