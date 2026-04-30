import type { Configuration } from '@azure/msal-browser';

const clientId = import.meta.env.VITE_AAD_CLIENT_ID as string | undefined;
const tenantId = import.meta.env.VITE_AAD_TENANT_ID as string | undefined;

if (!clientId) {
  // eslint-disable-next-line no-console
  console.warn('Missing VITE_AAD_CLIENT_ID. Create a .env file based on .env.example.');
}

export const msalConfig: Configuration = {
  auth: {
    clientId: clientId || '00000000-0000-0000-0000-000000000000',
    authority: tenantId ? `https://login.microsoftonline.com/${tenantId}` : 'https://login.microsoftonline.com/common',
    redirectUri: window.location.origin
  },
  cache: {
    cacheLocation: 'localStorage'
  }
};

export const graphScopes = ['User.Read', 'Sites.Read.All'];

