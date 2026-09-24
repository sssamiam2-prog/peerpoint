import { requireStaffOrAdmin } from '../../_lib/staffAuth';
import {
  contactLogMonthKey,
  corsHeaders,
  daysInMonth,
  emptyMonthLog,
  json,
  loadContactLogs,
  normalizeMonthLog,
  saveContactLogs,
  type Env,
  type MonthContactLog
} from '../../_lib/store';

type Ctx = { request: Request; env: Env };

function parseYearMonth(url: URL, body?: Record<string, unknown>): { year: number; month: number } | { error: string } {
  const now = new Date();
  const yearRaw = body?.year ?? url.searchParams.get('year') ?? now.getFullYear();
  const monthRaw = body?.month ?? url.searchParams.get('month') ?? now.getMonth() + 1;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return { error: 'Enter a valid year.' };
  if (!Number.isInteger(month) || month < 1 || month > 12) return { error: 'Enter a valid month (1–12).' };
  return { year, month };
}

function totals(log: MonthContactLog): {
  contactRowTotals: Record<string, number>;
  contactDayTotals: number[];
  contactGrand: number;
  resourceRowTotals: Record<string, number>;
  resourceDayTotals: number[];
  resourceGrand: number;
  days: number;
} {
  const days = daysInMonth(log.year, log.month);
  const sumRow = (row: number[]): number => row.slice(0, days).reduce((a, b) => a + b, 0);
  const contactRowTotals = {
    outreach: sumRow(log.contacts.outreach),
    walkIn: sumRow(log.contacts.walkIn),
    supervisorReferral: sumRow(log.contacts.supervisorReferral),
    ciResponse: sumRow(log.contacts.ciResponse)
  };
  const resourceRowTotals = {
    vestEap: sumRow(log.resources.vestEap),
    handout: sumRow(log.resources.handout)
  };
  const contactDayTotals = Array.from({ length: 31 }, (_, i) =>
    i < days
      ? log.contacts.outreach[i]! +
        log.contacts.walkIn[i]! +
        log.contacts.supervisorReferral[i]! +
        log.contacts.ciResponse[i]!
      : 0
  );
  const resourceDayTotals = Array.from({ length: 31 }, (_, i) =>
    i < days ? log.resources.vestEap[i]! + log.resources.handout[i]! : 0
  );
  return {
    contactRowTotals,
    contactDayTotals,
    contactGrand: contactDayTotals.reduce((a, b) => a + b, 0),
    resourceRowTotals,
    resourceDayTotals,
    resourceGrand: resourceDayTotals.reduce((a, b) => a + b, 0),
    days
  };
}

function monthCsv(log: MonthContactLog): string {
  const t = totals(log);
  const monthName = new Date(log.year, log.month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const days = Array.from({ length: t.days }, (_, i) => String(i + 1));
  const row = (label: string, counts: number[], total: number): string =>
    [label, ...counts.slice(0, t.days).map(String), String(total)].join(',');
  return [
    `${monthName} contact log`,
    ['Contact Type', ...days, 'Total Contact Type'].join(','),
    row('Outreach', log.contacts.outreach, t.contactRowTotals.outreach),
    row('Walk-ins', log.contacts.walkIn, t.contactRowTotals.walkIn),
    row('Supervisor Referral', log.contacts.supervisorReferral, t.contactRowTotals.supervisorReferral),
    row('CI Response', log.contacts.ciResponse, t.contactRowTotals.ciResponse),
    row('Total Contacts', t.contactDayTotals, t.contactGrand),
    '',
    ['Resource Provided', ...days, 'Total'].join(','),
    row('VEST/EAP', log.resources.vestEap, t.resourceRowTotals.vestEap),
    row('Handout', log.resources.handout, t.resourceRowTotals.handout),
    row('Total resources', t.resourceDayTotals, t.resourceGrand)
  ].join('\r\n');
}

export async function onRequestOptions({ request }: Ctx): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}

export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const auth = await requireStaffOrAdmin(request, env);
  if ('error' in auth) return json({ error: auth.error }, auth.status, origin);

  const url = new URL(request.url);
  const parsed = parseYearMonth(url);
  if ('error' in parsed) return json({ error: parsed.error }, 400, origin);

  const store = await loadContactLogs(env);
  const key = contactLogMonthKey(parsed.year, parsed.month);
  const log = normalizeMonthLog(parsed.year, parsed.month, store.months[key] ?? emptyMonthLog(parsed.year, parsed.month));
  const t = totals(log);

  if (url.searchParams.get('format') === 'csv') {
    const headers = new Headers(corsHeaders(origin));
    headers.set('Content-Type', 'text/csv; charset=utf-8');
    headers.set('Content-Disposition', `attachment; filename="peerpoint-contacts-${key}.csv"`);
    return new Response(monthCsv(log), { status: 200, headers });
  }

  return json(
    {
      log,
      totals: t,
      months: Object.keys(store.months).sort()
    },
    200,
    origin
  );
}

export async function onRequestPut({ request, env }: Ctx): Promise<Response> {
  const origin = request.headers.get('Origin');
  const auth = await requireStaffOrAdmin(request, env);
  if ('error' in auth) return json({ error: auth.error }, auth.status, origin);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400, origin);
  }

  const parsed = parseYearMonth(new URL(request.url), body);
  if ('error' in parsed) return json({ error: parsed.error }, 400, origin);

  const incoming = (body.log as Partial<MonthContactLog> | undefined) ?? body;
  const log = normalizeMonthLog(parsed.year, parsed.month, incoming);
  log.updatedAt = new Date().toISOString();
  log.updatedBy = auth.session.username;
  log.updatedByDisplay = auth.session.displayName || auth.session.username;

  const store = await loadContactLogs(env);
  const key = contactLogMonthKey(parsed.year, parsed.month);
  store.months[key] = log;
  await saveContactLogs(env, store);

  return json({ log, totals: totals(log), months: Object.keys(store.months).sort() }, 200, origin);
}
