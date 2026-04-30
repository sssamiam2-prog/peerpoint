import { SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';

async function expectOk(resp: SPHttpClientResponse, context: string): Promise<void> {
  if (resp.ok) return;
  const text = await resp.text();
  throw new Error(`${context} (${resp.status}): ${text}`);
}

export async function writeAuditLog(
  spHttpClient: SPHttpClient,
  webAbsoluteUrl: string,
  eventType: string,
  requestId?: number,
  details?: Record<string, unknown>
): Promise<void> {
  const body: Record<string, unknown> = {
    Title: eventType,
    EventType: eventType,
    RequestId: requestId ?? null,
    DetailsJson: details ? JSON.stringify(details) : null
  };

  const url = `${webAbsoluteUrl}/_api/web/lists/GetByTitle('AuditLog')/items`;
  const resp = await spHttpClient.post(url, SPHttpClient.configurations.v1, {
    headers: {
      Accept: 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=nometadata'
    },
    body: JSON.stringify(body)
  });
  await expectOk(resp, 'Failed to write audit log');
}

