import { corsHeaders, json, type Env } from '../_lib/store';
import { loadResources } from '../_lib/content';

type Ctx = { request: Request; env: Env };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

/** GET /api/resources — public gallery metadata (no file bytes). */
export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const items = await loadResources(env);
  const publicItems = items
    .map(r => ({
      id: r.id,
      title: r.title,
      description: r.description,
      kind: r.kind,
      fileName: r.fileName,
      contentType: r.contentType,
      size: r.size,
      url: r.kind === 'link' ? r.url : undefined,
      downloadPath: r.kind === 'file' ? `/api/resources/${encodeURIComponent(r.id)}` : undefined,
      uploadedAt: r.uploadedAt
    }))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  return json({ items: publicItems }, 200, origin);
}
