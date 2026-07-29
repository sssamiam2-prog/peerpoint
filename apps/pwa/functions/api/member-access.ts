import { corsHeaders, json, type Env } from '../_lib/store';
import { isValidMemberAccessCode } from '../_lib/memberAccess';

type Ctx = { request: Request; env: Env };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

/**
 * POST /api/member-access
 * Validates the site use code on the server. Valid codes are not listed in the response.
 */
export async function onRequestPost({ request }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400, origin);
  }

  const code = body.code ?? body.accessCode ?? body.siteUseCode;
  if (!isValidMemberAccessCode(code)) {
    return json(
      {
        ok: false,
        error: 'That site use code is not correct. Ask a Peer Support contact at the Sheriff’s Office.'
      },
      403,
      origin
    );
  }

  return json({ ok: true }, 200, origin);
}
