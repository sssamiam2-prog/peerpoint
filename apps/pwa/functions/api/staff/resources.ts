import { corsHeaders, json, type Env } from '../../_lib/store';
import {
  createResourceId,
  deleteResourceBlob,
  loadResources,
  MAX_RESOURCE_BYTES,
  putResourceBlob,
  saveResources,
  type GalleryResource
} from '../../_lib/content';
import { requireAdmin } from '../../_lib/staffAuth';

type Ctx = { request: Request; env: Env };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

/** GET /api/staff/resources — Admin list. */
export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const auth = await requireAdmin(request, env);
  if ('error' in auth) return json({ error: auth.error }, auth.status, origin);
  const items = await loadResources(env);
  return json({ items, maxBytes: MAX_RESOURCE_BYTES }, 200, origin);
}

/**
 * POST /api/staff/resources
 * multipart/form-data: title, description?, file? OR url?
 * OR JSON: { title, description?, url }
 */
export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const auth = await requireAdmin(request, env);
  if ('error' in auth) return json({ error: auth.error }, auth.status, origin);
  if (!env.PEERPOINT_KV) {
    return json({ error: 'PEERPOINT_KV is required for the Resource Gallery.' }, 503, origin);
  }

  const contentType = request.headers.get('Content-Type') || '';
  let title = '';
  let description = '';
  let linkUrl = '';
  let file: File | null = null;

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      title = String(form.get('title') ?? '').trim();
      description = String(form.get('description') ?? '').trim();
      linkUrl = String(form.get('url') ?? '').trim();
      const f = form.get('file');
      if (f instanceof File && f.size > 0) file = f;
    } else {
      const body = (await request.json()) as Record<string, unknown>;
      title = String(body.title ?? '').trim();
      description = String(body.description ?? '').trim();
      linkUrl = String(body.url ?? '').trim();
    }
  } catch {
    return json({ error: 'Could not read upload body.' }, 400, origin);
  }

  if (!title) return json({ error: 'Title is required.' }, 400, origin);
  if (!file && !linkUrl) {
    return json({ error: 'Upload a file or provide a link URL.' }, 400, origin);
  }

  const id = createResourceId();
  const now = new Date().toISOString();
  const uploadedBy = auth.session.username || 'admin';
  const uploadedByDisplay = auth.session.displayName || uploadedBy;

  let item: GalleryResource;

  if (file) {
    if (file.size > MAX_RESOURCE_BYTES) {
      return json(
        {
          error: `File is too large. Max size is ${Math.floor(MAX_RESOURCE_BYTES / (1024 * 1024))} MB.`
        },
        400,
        origin
      );
    }
    const bytes = await file.arrayBuffer();
    await putResourceBlob(env, id, bytes);
    item = {
      id,
      title,
      description: description || undefined,
      kind: 'file',
      fileName: file.name || 'file',
      contentType: file.type || 'application/octet-stream',
      size: file.size,
      uploadedAt: now,
      uploadedBy,
      uploadedByDisplay
    };
  } else {
    try {
      const u = new URL(linkUrl);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad');
    } catch {
      return json({ error: 'Link must be a valid http(s) URL.' }, 400, origin);
    }
    item = {
      id,
      title,
      description: description || undefined,
      kind: 'link',
      url: linkUrl,
      uploadedAt: now,
      uploadedBy,
      uploadedByDisplay
    };
  }

  const list = await loadResources(env);
  list.unshift(item);
  await saveResources(env, list);
  return json({ ok: true, item, items: list, maxBytes: MAX_RESOURCE_BYTES }, 201, origin);
}

/** DELETE /api/staff/resources?id=... or JSON { id } */
export async function onRequestDelete({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const auth = await requireAdmin(request, env);
  if ('error' in auth) return json({ error: auth.error }, auth.status, origin);

  let id = new URL(request.url).searchParams.get('id')?.trim() ?? '';
  if (!id) {
    try {
      const body = (await request.json()) as { id?: string };
      id = String(body.id ?? '').trim();
    } catch {
      /* ignore */
    }
  }
  if (!id) return json({ error: 'id is required.' }, 400, origin);

  const list = await loadResources(env);
  const found = list.find(r => r.id === id);
  if (!found) return json({ error: 'Resource not found.' }, 404, origin);

  const next = list.filter(r => r.id !== id);
  await saveResources(env, next);
  if (found.kind === 'file') await deleteResourceBlob(env, id);
  return json({ ok: true, items: next }, 200, origin);
}
