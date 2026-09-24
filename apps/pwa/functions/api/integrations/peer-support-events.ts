import {
  corsHeaders,
  integrationAuthorized,
  integrationSecret,
  json,
  loadAndMaintainPeerSupportEvents,
  markPeerSupportEventsImported,
  purgePeerSupportEventsSyncedAndExpired,
  savePeerSupportEvents,
  type Env,
  type PeerSupportEvent
} from '../../_lib/store';

type Ctx = { request: Request; env: Env };

function exportRow(e: PeerSupportEvent): Record<string, unknown> {
  return {
    id: e.id,
    eventDate: e.eventDate,
    recordedAt: e.recordedAt,
    prpsBureau: e.prpsBureau,
    prpsGender: e.prpsGender,
    helpType: e.helpType,
    providerDisplayName: e.providerDisplayName,
    providerUsername: e.providerUsername,
    totalMinutes: e.totalMinutes,
    createdBy: e.createdBy,
    createdByDisplay: e.createdByDisplay,
    sharePointImportedAt: e.sharePointImportedAt ?? null
  };
}

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

/**
 * GET /api/integrations/peer-support-events
 * Secured with PEERPOINT_INTEGRATION_SECRET (or CRON_SECRET). For Power Automate → SharePoint list sync.
 *
 * Query: since (ISO), limit (max 2000), pendingOnly=1 (rows not yet marked imported)
 */
export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (!integrationSecret(env)) {
    return json({ error: 'PEERPOINT_INTEGRATION_SECRET is not configured.' }, 503, origin);
  }
  if (!integrationAuthorized(request, env)) {
    return json({ error: 'Unauthorized.' }, 401, origin);
  }

  const url = new URL(request.url);
  const store = await loadAndMaintainPeerSupportEvents(env);
  let events = [...store.events].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));

  const since = url.searchParams.get('since')?.trim();
  if (since) {
    const t = Date.parse(since);
    if (Number.isFinite(t)) {
      events = events.filter(e => Date.parse(e.recordedAt) >= t);
    }
  }

  if (url.searchParams.get('pendingOnly') === '1') {
    events = events.filter(e => !e.sharePointImportedAt);
  }

  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw ? Math.min(Math.max(Number(limitRaw), 1), 2000) : 2000;
  events = events.slice(0, limit);

  return json(
    {
      siteUrlHint: 'https://slcounty.sharepoint.com/sites/SH-PS',
      listTitleHint: 'PeerSupportEvents',
      exportedAt: new Date().toISOString(),
      count: events.length,
      events: events.map(exportRow)
    },
    200,
    origin
  );
}

/**
 * POST /api/integrations/peer-support-events
 * Body: { "importedIds": ["uuid", ...] } — call after rows are in SharePoint.
 * Marks imported, then purges app copies older than 5 days that are marked imported.
 */
export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (!integrationSecret(env)) {
    return json({ error: 'PEERPOINT_INTEGRATION_SECRET is not configured.' }, 503, origin);
  }
  if (!integrationAuthorized(request, env)) {
    return json({ error: 'Unauthorized.' }, 401, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400, origin);
  }

  const rawIds = body.importedIds ?? body.ids ?? body.eventIds;
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return json({ error: 'importedIds array is required.' }, 400, origin);
  }
  const ids = rawIds.map(v => String(v ?? '').trim()).filter(Boolean);
  if (ids.length === 0) return json({ error: 'importedIds array is required.' }, 400, origin);

  const store = await loadAndMaintainPeerSupportEvents(env);
  const marked = markPeerSupportEventsImported(store, ids);
  const { store: purged, removed } = purgePeerSupportEventsSyncedAndExpired(store);
  await savePeerSupportEvents(env, purged);

  return json(
    {
      ok: true,
      marked,
      purgedAfterSharePoint: removed,
      at: new Date().toISOString()
    },
    200,
    origin
  );
}
