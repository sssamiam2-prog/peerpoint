export type Role = 'Admin' | 'HR' | 'PeerSupporter';

export const EntraGroups = {
  Admins: 'PeerSupport_Admins',
  HR: 'PeerSupport_HR',
  PeerSupporters: 'PeerSupport_PeerSupporters'
} as const;

export type RequestStatus = 'New' | 'Assigned' | 'InProgress' | 'Closed';

export type RequestVisibility = {
  showNameToPeer: boolean;
  showPhoneToPeer: boolean;
  showEmailToPeer: boolean;
  showPreferredContactToPeer: boolean;
  showDescriptionToPeer: boolean;
};

export type PeerSupportRequest = {
  id?: number;
  created?: string;
  createdByEmail?: string;

  requesterName?: string;
  requesterPhone: string;
  requesterEmail: string;
  preferredContact?: string;
  description?: string;
  consentAcknowledged: boolean;

  status: RequestStatus;
  assignedPeerSupporterEmail?: string;
  assignedPeerSupporterDisplayName?: string;

  visibility: RequestVisibility;
};

export type SelfHelpItem = {
  id?: number;
  title: string;
  body?: string;
  url?: string;
  category?: string;
  sortOrder?: number;
  isPublished: boolean;
};

export type AuditEventType =
  | 'RequestCreated'
  | 'RequestAssigned'
  | 'RequestVisibilityChanged'
  | 'RequestStatusChanged'
  | 'RequestViewed'
  | 'SelfHelpViewed';

export type AuditLogItem = {
  id?: number;
  created?: string;
  actorEmail?: string;
  actorDisplayName?: string;
  eventType: AuditEventType;
  requestId?: number;
  detailsJson?: string;
};

