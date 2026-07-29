import { corsHeaders, json, type Env } from '../_lib/store';
import { loadSelfHelp } from '../_lib/content';

type Ctx = { request: Request; env: Env };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

/** GET /api/self-help — published articles for members. */
export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const stored = await loadSelfHelp(env);
  if (!stored || stored.length === 0) {
    return json({ useBuiltin: true, items: [] }, 200, origin);
  }
  const items = stored
    .filter(a => a.isPublished)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  return json({ useBuiltin: false, items }, 200, origin);
}
