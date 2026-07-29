import { corsHeaders, type Env } from '../../_lib/store';
import { getResourceBlob, loadResources } from '../../_lib/content';

type Ctx = { request: Request; env: Env; params: { id: string } };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

/** GET /api/resources/:id — download or inline-view a gallery file. */
export async function onRequestGet({ request, env, params }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const id = decodeURIComponent(String(params.id ?? '')).trim();
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing id.' }), {
      status: 400,
      headers: corsHeaders(origin)
    });
  }

  const list = await loadResources(env);
  const meta = list.find(r => r.id === id);
  if (!meta || meta.kind !== 'file') {
    return new Response(JSON.stringify({ error: 'Resource not found.' }), {
      status: 404,
      headers: corsHeaders(origin)
    });
  }

  const blob = await getResourceBlob(env, id);
  if (!blob) {
    return new Response(JSON.stringify({ error: 'File data missing.' }), {
      status: 404,
      headers: corsHeaders(origin)
    });
  }

  const url = new URL(request.url);
  const asDownload = url.searchParams.get('download') === '1';
  const contentType = meta.contentType || 'application/octet-stream';
  const fileName = meta.fileName || 'resource';
  const disposition = asDownload
    ? `attachment; filename="${fileName.replace(/"/g, '')}"`
    : `inline; filename="${fileName.replace(/"/g, '')}"`;

  return new Response(blob, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': origin ?? '*',
      'Content-Type': contentType,
      'Content-Disposition': disposition,
      'Cache-Control': 'public, max-age=300',
      'Content-Length': String(blob.byteLength)
    }
  });
}
