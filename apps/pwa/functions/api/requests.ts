import {
  corsHeaders,
  json,
  loadRequests,
  newId,
  notifyTeams,
  saveRequests,
  type Env,
  type HelpRequest
} from '../_lib/store';
import { isValidMemberAccessCode } from '../_lib/memberAccess';

type Ctx = { request: Request; env: Env };

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

/** POST /api/requests — public intake (requires shared workplace access code). */
export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400, origin);
  }

  if (!isValidMemberAccessCode(body.accessCode)) {
    return json({ error: 'A valid site use code is required.' }, 403, origin);
  }

  const requesterPhone = String(body.requesterPhone ?? '').trim();
  const requesterEmail = String(body.requesterEmail ?? '').trim();
  const consentAcknowledged = Boolean(body.consentAcknowledged);
  const employmentAttested = Boolean(body.employmentAttested);
  const bureau = String(body.bureau ?? '').trim();
  const employmentTypeRaw = String(body.employmentType ?? '').trim().toLowerCase();
  const contactModeRaw = String(body.contactMode ?? body.requestType ?? 'form').trim();
  const contactMode: HelpRequest['contactMode'] =
    contactModeRaw === 'faceToFace' ? 'faceToFace' : 'form';

  if (!requesterPhone) return json({ error: 'Phone number is required.' }, 400, origin);
  if (!requesterEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail)) {
    return json({ error: 'Valid email is required.' }, 400, origin);
  }
  if (!consentAcknowledged) return json({ error: 'Consent is required.' }, 400, origin);
  if (!employmentAttested) {
    return json(
      { error: 'You must attest that you are currently employed by the Salt Lake County Sheriff’s Office.' },
      400,
      origin
    );
  }
  if (!bureau) return json({ error: 'Bureau is required.' }, 400, origin);
  if (employmentTypeRaw !== 'civilian' && employmentTypeRaw !== 'sworn') {
    return json({ error: 'Select Civilian or Sworn.' }, 400, origin);
  }

  const record: HelpRequest = {
    id: newId(),
    submittedAt: new Date().toISOString(),
    requesterName: String(body.requesterName ?? '').trim() || undefined,
    requesterPhone,
    requesterEmail,
    preferredContact: String(body.preferredContact ?? '').trim() || undefined,
    description: String(body.description ?? '').trim() || undefined,
    consentAcknowledged,
    employmentAttested: true,
    bureau,
    employmentType: employmentTypeRaw,
    contactMode,
    status: 'open'
  };

  const list = await loadRequests(env);
  list.unshift(record);
  await saveRequests(env, list.slice(0, 500));

  const kind = contactMode === 'faceToFace' ? 'face-to-face' : 'follow-up';
  await notifyTeams(
    env,
    `PEERPoint ${kind} request (${record.id})\nBureau: ${bureau} · ${employmentTypeRaw}\nPhone: ${record.requesterPhone}\nEmail: ${record.requesterEmail}\nName: ${record.requesterName ?? '(none)'}`
  );

  return json(
    {
      ok: true,
      id: record.id,
      message:
        contactMode === 'faceToFace'
          ? 'Face-to-face request received. A Peer Support member will follow up to arrange a meeting.'
          : 'Request received. A Peer Support Therapist will follow up and may share a room code for chat or voice.'
    },
    201,
    origin
  );
}
