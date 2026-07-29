import { corsHeaders, json, type Env } from '../../_lib/store';
import { sweepUnavailableReminders } from '../../_lib/peerAvailability';

type Ctx = { request: Request; env: Env };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

function authorized(request: Request, env: Env): boolean {
  const secret = env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get('Authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const alt = request.headers.get('X-Cron-Secret')?.trim() || '';
  return bearer === secret || alt === secret;
}

/**
 * GET or POST /api/cron/availability-reminders
 * Secured with CRON_SECRET. Sends half-hour emails to staff still marked Unavailable.
 */
export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  return runCron(request, env);
}

export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  return runCron(request, env);
}

async function runCron(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (!env.CRON_SECRET?.trim()) {
    return json({ error: 'CRON_SECRET is not configured.' }, 503, origin);
  }
  if (!authorized(request, env)) {
    return json({ error: 'Unauthorized.' }, 401, origin);
  }
  const result = await sweepUnavailableReminders(env);
  return json({ ok: true, ...result, at: new Date().toISOString() }, 200, origin);
}
