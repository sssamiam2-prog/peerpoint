import { SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';

export type RequestItem = {
  Id: number;
  Created: string;
  Status: string;
  RequesterName?: string;
  RequesterPhone: string;
  RequesterEmail: string;
  PreferredContact?: string;
  Description?: string;
  ConsentAcknowledged: boolean;
  AssignedPeerSupporter?: { Title?: string; EMail?: string };
  ShowNameToPeer: boolean;
  ShowPhoneToPeer: boolean;
  ShowEmailToPeer: boolean;
  ShowPreferredContactToPeer: boolean;
  ShowDescriptionToPeer: boolean;
};

async function expectOk(resp: SPHttpClientResponse, context: string): Promise<void> {
  if (resp.ok) return;
  const text = await resp.text();
  throw new Error(`${context} (${resp.status}): ${text}`);
}

export async function listOpenRequests(sp: SPHttpClient, webUrl: string): Promise<RequestItem[]> {
  const url =
    `${webUrl}/_api/web/lists/GetByTitle('PeerSupportRequests')/items` +
    `?$select=Id,Created,Status,RequesterName,RequesterPhone,RequesterEmail,PreferredContact,Description,ConsentAcknowledged,` +
    `ShowNameToPeer,ShowPhoneToPeer,ShowEmailToPeer,ShowPreferredContactToPeer,ShowDescriptionToPeer,` +
    `AssignedPeerSupporter/Title,AssignedPeerSupporter/EMail` +
    `&$expand=AssignedPeerSupporter` +
    `&$filter=Status ne 'Closed'` +
    `&$orderby=Created desc`;
  const resp = await sp.get(url, SPHttpClient.configurations.v1, { headers: { Accept: 'application/json;odata=nometadata' } });
  await expectOk(resp, 'Failed to load requests');
  const json: { value: RequestItem[] } = await resp.json();
  return json.value || [];
}

export async function listMyAssignedRequests(sp: SPHttpClient, webUrl: string, userEmail: string): Promise<RequestItem[]> {
  const encoded = userEmail.replace(/'/g, "''");
  const url =
    `${webUrl}/_api/web/lists/GetByTitle('PeerSupportRequests')/items` +
    `?$select=Id,Created,Status,RequesterName,RequesterPhone,RequesterEmail,PreferredContact,Description,ConsentAcknowledged,` +
    `ShowNameToPeer,ShowPhoneToPeer,ShowEmailToPeer,ShowPreferredContactToPeer,ShowDescriptionToPeer,` +
    `AssignedPeerSupporter/Title,AssignedPeerSupporter/EMail` +
    `&$expand=AssignedPeerSupporter` +
    `&$filter=AssignedPeerSupporter/EMail eq '${encoded}' and Status ne 'Closed'` +
    `&$orderby=Created desc`;
  const resp = await sp.get(url, SPHttpClient.configurations.v1, { headers: { Accept: 'application/json;odata=nometadata' } });
  await expectOk(resp, 'Failed to load assigned requests');
  const json: { value: RequestItem[] } = await resp.json();
  return json.value || [];
}

export async function ensureUser(sp: SPHttpClient, webUrl: string, loginName: string): Promise<number> {
  const url = `${webUrl}/_api/web/ensureuser`;
  const resp = await sp.post(url, SPHttpClient.configurations.v1, {
    headers: {
      Accept: 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=nometadata'
    },
    body: JSON.stringify({ logonName: loginName })
  });
  await expectOk(resp, 'Failed to ensure user');
  const json: { Id: number } = await resp.json();
  return json.Id;
}

export async function updateRequest(
  sp: SPHttpClient,
  webUrl: string,
  id: number,
  fields: Record<string, unknown>
): Promise<void> {
  const url = `${webUrl}/_api/web/lists/GetByTitle('PeerSupportRequests')/items(${id})`;
  const resp = await sp.post(url, SPHttpClient.configurations.v1, {
    headers: {
      Accept: 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=nometadata',
      'IF-MATCH': '*',
      'X-HTTP-Method': 'MERGE'
    },
    body: JSON.stringify(fields)
  });
  await expectOk(resp, 'Failed to update request');
}

async function getRoleDefIdByName(sp: SPHttpClient, webUrl: string, roleName: string): Promise<number> {
  const url = `${webUrl}/_api/web/roledefinitions/getbyname('${roleName.replace(/'/g, "''")}')?$select=Id`;
  const resp = await sp.get(url, SPHttpClient.configurations.v1, { headers: { Accept: 'application/json;odata=nometadata' } });
  await expectOk(resp, `Failed to resolve role definition '${roleName}'`);
  const json: { Id: number } = await resp.json();
  return json.Id;
}

async function getSiteGroupIdByName(sp: SPHttpClient, webUrl: string, groupName: string): Promise<number> {
  const url = `${webUrl}/_api/web/sitegroups/getbyname('${groupName.replace(/'/g, "''")}')?$select=Id`;
  const resp = await sp.get(url, SPHttpClient.configurations.v1, { headers: { Accept: 'application/json;odata=nometadata' } });
  await expectOk(resp, `Failed to resolve site group '${groupName}'`);
  const json: { Id: number } = await resp.json();
  return json.Id;
}

async function breakRoleInheritance(sp: SPHttpClient, webUrl: string, id: number): Promise<void> {
  const url =
    `${webUrl}/_api/web/lists/GetByTitle('PeerSupportRequests')/items(${id})/breakroleinheritance(copyRoleAssignments=false, clearSubscopes=true)`;
  const resp = await sp.post(url, SPHttpClient.configurations.v1, {
    headers: { Accept: 'application/json;odata=nometadata' }
  });
  await expectOk(resp, 'Failed to break role inheritance');
}

async function addRoleAssignment(
  sp: SPHttpClient,
  webUrl: string,
  id: number,
  principalId: number,
  roleDefId: number
): Promise<void> {
  const url =
    `${webUrl}/_api/web/lists/GetByTitle('PeerSupportRequests')/items(${id})/roleassignments/addroleassignment(principalid=${principalId},roledefid=${roleDefId})`;
  const resp = await sp.post(url, SPHttpClient.configurations.v1, {
    headers: { Accept: 'application/json;odata=nometadata' }
  });
  await expectOk(resp, 'Failed to add role assignment');
}

/**
 * Applies item-level permissions after assignment.
 *
 * Prereq: SharePoint **site groups** exist with these names and contain the relevant Entra groups/users:
 * - PeerSupport_Admins
 * - PeerSupport_HR
 */
export async function applyItemLevelPermissions(
  sp: SPHttpClient,
  webUrl: string,
  requestId: number,
  assignedUserPrincipalId: number
): Promise<void> {
  const [contributeId, readId] = await Promise.all([
    getRoleDefIdByName(sp, webUrl, 'Contribute'),
    getRoleDefIdByName(sp, webUrl, 'Read')
  ]);

  const [adminsGroupId, hrGroupId] = await Promise.all([
    getSiteGroupIdByName(sp, webUrl, 'PeerSupport_Admins'),
    getSiteGroupIdByName(sp, webUrl, 'PeerSupport_HR')
  ]);

  await breakRoleInheritance(sp, webUrl, requestId);

  await Promise.all([
    addRoleAssignment(sp, webUrl, requestId, adminsGroupId, contributeId),
    addRoleAssignment(sp, webUrl, requestId, hrGroupId, contributeId),
    addRoleAssignment(sp, webUrl, requestId, assignedUserPrincipalId, readId)
  ]);
}

