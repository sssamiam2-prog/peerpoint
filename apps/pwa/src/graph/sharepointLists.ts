import type { IPublicClientApplication } from '@azure/msal-browser';
import { BUILT_IN_SELF_HELP_GRAPH } from '../data/builtInSelfHelp';
import { graphFetch } from './graphClient';

const siteId = import.meta.env.VITE_GRAPH_SITE_ID as string | undefined;
const requestsListId = import.meta.env.VITE_GRAPH_REQUESTS_LIST_ID as string | undefined;
const selfHelpListId = import.meta.env.VITE_GRAPH_SELFHELP_LIST_ID as string | undefined;
const auditListId = import.meta.env.VITE_GRAPH_AUDIT_LIST_ID as string | undefined;

function requireEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing ${name} in .env (see .env.example).`);
  return value;
}

export type SelfHelp = {
  id: string;
  fields: Record<string, unknown>;
};

export async function getSelfHelp(msal: IPublicClientApplication): Promise<SelfHelp[]> {
  const s = requireEnv('VITE_GRAPH_SITE_ID', siteId);
  const l = requireEnv('VITE_GRAPH_SELFHELP_LIST_ID', selfHelpListId);
  const url = `https://graph.microsoft.com/v1.0/sites/${s}/lists/${l}/items?expand=fields($select=Title,Body,Url,Category,SortOrder,IsPublished)`;
  const resp = await graphFetch(msal, url);
  if (!resp.ok) throw new Error(`Graph SelfHelp failed (${resp.status})`);
  const json: { value: Array<{ id: string; fields: Record<string, unknown> }> } = await resp.json();
  const items = json.value || [];
  const remote = items
    .filter(i => i.fields?.IsPublished === true || i.fields?.IsPublished === 1)
    .map(i => ({ id: i.id, fields: i.fields }));
  const merged = [...BUILT_IN_SELF_HELP_GRAPH, ...remote];
  merged.sort((a, b) => {
    const sa = Number(a.fields?.SortOrder ?? 9999);
    const sb = Number(b.fields?.SortOrder ?? 9999);
    if (sa !== sb) {
      return sa - sb;
    }
    return String(a.fields?.Title ?? '').localeCompare(String(b.fields?.Title ?? ''), undefined, {
      sensitivity: 'base'
    });
  });
  return merged;
}

export type CreateRequestInput = {
  requesterName?: string;
  requesterPhone: string;
  requesterEmail: string;
  preferredContact?: string;
  description?: string;
  consentAcknowledged: boolean;
};

export async function createRequest(msal: IPublicClientApplication, input: CreateRequestInput): Promise<void> {
  const s = requireEnv('VITE_GRAPH_SITE_ID', siteId);
  const l = requireEnv('VITE_GRAPH_REQUESTS_LIST_ID', requestsListId);
  const url = `https://graph.microsoft.com/v1.0/sites/${s}/lists/${l}/items`;
  const resp = await graphFetch(msal, url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        Title: `Peer Support Request - ${new Date().toISOString()}`,
        RequesterName: input.requesterName || null,
        RequesterPhone: input.requesterPhone,
        RequesterEmail: input.requesterEmail,
        PreferredContact: input.preferredContact || null,
        Description: input.description || null,
        ConsentAcknowledged: input.consentAcknowledged,
        Status: 'New',
        ShowNameToPeer: true,
        ShowPhoneToPeer: true,
        ShowEmailToPeer: true,
        ShowPreferredContactToPeer: true,
        ShowDescriptionToPeer: true
      }
    })
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Graph create request failed (${resp.status}): ${text}`);
  }
}

export async function writeAudit(msal: IPublicClientApplication, eventType: string, detailsJson?: string): Promise<void> {
  if (!auditListId) return; // optional for local/dev
  const s = requireEnv('VITE_GRAPH_SITE_ID', siteId);
  const l = requireEnv('VITE_GRAPH_AUDIT_LIST_ID', auditListId);
  const url = `https://graph.microsoft.com/v1.0/sites/${s}/lists/${l}/items`;
  await graphFetch(msal, url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        Title: eventType,
        EventType: eventType,
        DetailsJson: detailsJson || null
      }
    })
  });
}

