import { requireAdmin, requireStaffOrAdmin } from '../../_lib/staffAuth';
import {
  corsHeaders,
  json,
  loadPeerSupportHelpTypes,
  normalizeHelpTypes,
  savePeerSupportHelpTypes,
  type Env
} from '../../_lib/store';

type Ctx = { request: Request; env: Env };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const auth = await requireStaffOrAdmin(request, env);
  if ('error' in auth) return json({ error: auth.error }, auth.status, origin);
  const helpTypes = await loadPeerSupportHelpTypes(env);
  return json({ helpTypes }, 200, origin);
}

export async function onRequestPut({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const auth = await requireAdmin(request, env);
  if ('error' in auth) return json({ error: auth.error }, auth.status, origin);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400, origin);
  }

  const helpTypes = normalizeHelpTypes(body.helpTypes);
  await savePeerSupportHelpTypes(env, helpTypes);
  return json({ ok: true, helpTypes }, 200, origin);
}
