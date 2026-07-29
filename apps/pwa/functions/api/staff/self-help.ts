import { corsHeaders, json, newId, type Env } from '../../_lib/store';
import { loadSelfHelp, saveSelfHelp, type SelfHelpArticle } from '../../_lib/content';
import { requireAdmin } from '../../_lib/staffAuth';

type Ctx = { request: Request; env: Env };

function normalizeArticle(raw: Record<string, unknown>, fallbackId?: string): SelfHelpArticle | null {
  const title = String(raw.title ?? '').trim();
  if (!title) return null;
  const sortOrder = Number(raw.sortOrder);
  return {
    id: String(raw.id ?? fallbackId ?? newId()).trim() || newId(),
    title,
    category: String(raw.category ?? '').trim() || 'General',
    body: String(raw.body ?? ''),
    url: String(raw.url ?? '').trim() || undefined,
    videoUrl: String(raw.videoUrl ?? '').trim() || undefined,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 100,
    isPublished: raw.isPublished !== false,
    updatedAt: String(raw.updatedAt ?? '') || undefined,
    updatedBy: String(raw.updatedBy ?? '') || undefined
  };
}

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

/** GET /api/staff/self-help — full catalog for Admin editing. */
export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const auth = await requireAdmin(request, env);
  if ('error' in auth) return json({ error: auth.error }, auth.status, origin);
  const stored = await loadSelfHelp(env);
  return json(
    {
      customized: stored != null && stored.length > 0,
      items: stored ?? []
    },
    200,
    origin
  );
}

/**
 * PATCH /api/staff/self-help
 * - replaceAll: { replaceAll: true, items: [...] }
 * - upsert: { upsert: true, item: {...} }
 * - remove: { remove: true, id }
 * - resetBuiltin: { resetBuiltin: true } clears KV so members see built-in articles again
 */
export async function onRequestPatch({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const auth = await requireAdmin(request, env);
  if ('error' in auth) return json({ error: auth.error }, auth.status, origin);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON.' }, 400, origin);
  }

  const now = new Date().toISOString();
  const by = auth.session.username || 'admin';

  if (body.resetBuiltin === true) {
    await saveSelfHelp(env, []);
    return json({ ok: true, customized: false, items: [] }, 200, origin);
  }

  if (body.replaceAll === true) {
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const items: SelfHelpArticle[] = [];
    for (const row of rawItems) {
      if (!row || typeof row !== 'object') continue;
      const art = normalizeArticle(row as Record<string, unknown>);
      if (!art) continue;
      art.updatedAt = now;
      art.updatedBy = by;
      items.push(art);
    }
    await saveSelfHelp(env, items);
    return json({ ok: true, customized: items.length > 0, items }, 200, origin);
  }

  let list = (await loadSelfHelp(env)) ?? [];

  if (body.remove === true) {
    const id = String(body.id ?? '').trim();
    if (!id) return json({ error: 'id is required.' }, 400, origin);
    list = list.filter(a => a.id !== id);
    await saveSelfHelp(env, list);
    return json({ ok: true, customized: list.length > 0, items: list }, 200, origin);
  }

  if (body.upsert === true) {
    const raw = body.item;
    if (!raw || typeof raw !== 'object') return json({ error: 'item is required.' }, 400, origin);
    const art = normalizeArticle(raw as Record<string, unknown>);
    if (!art) return json({ error: 'Title is required.' }, 400, origin);
    art.updatedAt = now;
    art.updatedBy = by;
    const idx = list.findIndex(a => a.id === art.id);
    if (idx >= 0) list[idx] = art;
    else list.push(art);
    await saveSelfHelp(env, list);
    return json({ ok: true, customized: true, items: list, item: art }, 200, origin);
  }

  return json({ error: 'Unknown action. Use replaceAll, upsert, remove, or resetBuiltin.' }, 400, origin);
}
