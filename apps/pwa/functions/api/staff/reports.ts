import { corsHeaders, json, loadOnCallSlots, loadRequests, type Env } from '../../_lib/store';
import { requireAdmin } from '../../_lib/staffAuth';

type Ctx = { request: Request; env: Env };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

/** GET /api/staff/reports — Admin only. */
export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const auth = await requireAdmin(request, env);
  if ('error' in auth) return json({ error: auth.error }, auth.status, origin);

  const requests = await loadRequests(env);
  const slots = await loadOnCallSlots(env);

  const timeByStaff = new Map<string, { displayName: string; minutes: number; entries: number }>();
  for (const r of requests) {
    for (const t of r.timeEntries ?? []) {
      const key = t.createdBy || 'unknown';
      const cur = timeByStaff.get(key) ?? {
        displayName: t.createdByDisplay || key,
        minutes: 0,
        entries: 0
      };
      cur.minutes += t.minutes;
      cur.entries += 1;
      if (t.createdByDisplay) cur.displayName = t.createdByDisplay;
      timeByStaff.set(key, cur);
    }
  }

  const requestsWithActivity = requests
    .filter(r => (r.notes?.length ?? 0) > 0 || (r.timeEntries?.length ?? 0) > 0)
    .map(r => ({
      id: r.id,
      submittedAt: r.submittedAt,
      status: r.status,
      assignedPeer: r.assignedPeer,
      assignedPeerUsername: r.assignedPeerUsername,
      contactMode: r.contactMode,
      bureau: r.bureau,
      employmentType: r.employmentType,
      notes: r.notes ?? [],
      timeEntries: r.timeEntries ?? [],
      totalMinutes: (r.timeEntries ?? []).reduce((sum, t) => sum + t.minutes, 0)
    }))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  const onCallHistory = [...slots].sort((a, b) => b.startAt.localeCompare(a.startAt));

  return json(
    {
      generatedAt: new Date().toISOString(),
      summary: {
        requestCount: requests.length,
        openCount: requests.filter(r => r.status === 'open').length,
        assignedCount: requests.filter(r => r.status === 'assigned').length,
        closedCount: requests.filter(r => r.status === 'closed').length,
        totalMinutesLogged: [...timeByStaff.values()].reduce((s, x) => s + x.minutes, 0),
        onCallBlocks: slots.length
      },
      timeByStaff: [...timeByStaff.entries()]
        .map(([username, v]) => ({ username, ...v }))
        .sort((a, b) => b.minutes - a.minutes),
      requestsWithActivity,
      onCallHistory
    },
    200,
    origin
  );
}
