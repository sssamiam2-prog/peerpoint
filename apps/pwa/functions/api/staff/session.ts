import { corsHeaders, json, type Env } from '../../_lib/store';
import { availabilityPublicFields } from '../../_lib/peerAvailability';
import { displayNameFor, ensureSeedAdmin, loadUsers, requireStaffOrAdmin } from '../../_lib/staffAuth';
import { listPasskeysForUser } from '../../_lib/webauthn';

type Ctx = { request: Request; env: Env };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

/** GET /api/staff/session — validate Bearer token and return current user profile. */
export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  await ensureSeedAdmin(env);
  const auth = await requireStaffOrAdmin(request, env);
  if ('error' in auth) return json({ error: auth.error }, auth.status, origin);

  const users = await loadUsers(env);
  const meUser = users.find(u => u.username === auth.session.username);
  const avail = availabilityPublicFields(meUser);
  const passkeys = await listPasskeysForUser(env, auth.session.username);

  return json(
    {
      ok: true,
      sessionExpiresAt: auth.session.exp,
      passkeyCount: passkeys.length,
      me: {
        role: auth.session.role,
        username: auth.session.username,
        displayName: auth.session.displayName ?? (meUser ? displayNameFor(meUser) : undefined),
        peerAvailable: avail.peerAvailable,
        unavailableSince: avail.unavailableSince,
        unavailableReason: avail.unavailableReason,
        mustChangePassword: meUser?.mustChangePassword === true
      }
    },
    200,
    origin
  );
}
