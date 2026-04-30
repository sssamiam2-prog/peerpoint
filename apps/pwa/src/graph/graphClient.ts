import { graphScopes } from '../auth/msalConfig';
import type { IPublicClientApplication } from '@azure/msal-browser';

export async function graphFetch(msal: IPublicClientApplication, url: string, init?: RequestInit): Promise<Response> {
  const account = msal.getActiveAccount() || msal.getAllAccounts()[0];
  if (!account) {
    throw new Error('No signed-in account.');
  }

  const token = await msal.acquireTokenSilent({
    account,
    scopes: graphScopes
  });

  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${token.accessToken}`,
      Accept: 'application/json'
    }
  });
}

