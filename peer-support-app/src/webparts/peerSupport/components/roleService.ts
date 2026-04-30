import type { MSGraphClientFactory } from '@microsoft/sp-http';

type Role = 'Admin' | 'HR' | 'PeerSupporter';

const groupNames = {
  Admin: 'PeerSupport_Admins',
  HR: 'PeerSupport_HR',
  PeerSupporter: 'PeerSupport_PeerSupporters'
} as const;

type GraphGroup = { displayName?: string };
type GraphPage<T> = { value: T[]; '@odata.nextLink'?: string };

export async function getCurrentUserRoles(msGraphClientFactory: MSGraphClientFactory): Promise<Set<Role>> {
  const roles = new Set<Role>();
  const client = await msGraphClientFactory.getClient('3');

  // Directory objects can be large; use transitive groups to handle nested membership.
  let nextUrl = '/me/transitiveMemberOf?$select=displayName&$top=999';
  for (let guard = 0; guard < 20 && nextUrl; guard++) {
    const page: GraphPage<GraphGroup> = await client.api(nextUrl).get();
    for (const g of page.value || []) {
      const dn = (g.displayName || '').trim();
      if (dn === groupNames.Admin) roles.add('Admin');
      if (dn === groupNames.HR) roles.add('HR');
      if (dn === groupNames.PeerSupporter) roles.add('PeerSupporter');
    }
    nextUrl = page['@odata.nextLink'] ? page['@odata.nextLink'] : '';
    // When nextLink is absolute, msgraph client can handle it as-is.
  }

  return roles;
}

