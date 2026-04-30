import type { SPHttpClient } from '@microsoft/sp-http';
import type { MSGraphClientFactory } from '@microsoft/sp-http';

export interface IPeerSupportProps {
  isDarkTheme: boolean;
  hasTeamsContext: boolean;
  userDisplayName: string;
  userEmail: string;
  spHttpClient: SPHttpClient;
  msGraphClientFactory: MSGraphClientFactory;
  webAbsoluteUrl: string;
}
