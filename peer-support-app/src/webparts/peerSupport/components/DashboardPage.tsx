import * as React from 'react';
import type { SPHttpClient } from '@microsoft/sp-http';
import {
  DefaultButton,
  DetailsList,
  DetailsListLayoutMode,
  IColumn,
  MessageBar,
  MessageBarType,
  PrimaryButton,
  Spinner,
  Stack,
  TextField,
  Checkbox
} from '@fluentui/react';
import { applyItemLevelPermissions, ensureUser, listOpenRequests, type RequestItem, updateRequest } from './sharepointRequestsApi';
import { writeAuditLog } from './auditLogApi';
import { calmPrimaryButtonStyles } from './calmFluentUi';

type Props = {
  spHttpClient: SPHttpClient;
  webAbsoluteUrl: string;
};

export function DashboardPage(props: Props): React.ReactElement<Props> {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [items, setItems] = React.useState<RequestItem[]>([]);
  const [selected, setSelected] = React.useState<RequestItem | undefined>(undefined);

  const [assigneeEmail, setAssigneeEmail] = React.useState('');
  const [assigneeLoginName, setAssigneeLoginName] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const [vis, setVis] = React.useState({
    ShowNameToPeer: true,
    ShowPhoneToPeer: true,
    ShowEmailToPeer: true,
    ShowPreferredContactToPeer: true,
    ShowDescriptionToPeer: true
  });

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const data = await listOpenRequests(props.spHttpClient, props.webAbsoluteUrl);
      setItems(data);
      if (selected) {
        const nextSelected = data.find(d => d.Id === selected.Id);
        setSelected(nextSelected);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error loading dashboard.');
    } finally {
      setLoading(false);
    }
  }, [props.spHttpClient, props.webAbsoluteUrl, selected]);

  React.useEffect(() => {
    refresh().catch(() => {
      // handled via state
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!selected) return;
    setAssigneeEmail(selected.AssignedPeerSupporter?.EMail || '');
    setVis({
      ShowNameToPeer: !!selected.ShowNameToPeer,
      ShowPhoneToPeer: !!selected.ShowPhoneToPeer,
      ShowEmailToPeer: !!selected.ShowEmailToPeer,
      ShowPreferredContactToPeer: !!selected.ShowPreferredContactToPeer,
      ShowDescriptionToPeer: !!selected.ShowDescriptionToPeer
    });
  }, [selected]);

  const columns: IColumn[] = [
    { key: 'created', name: 'Created', fieldName: 'Created', minWidth: 120, onRender: (i: RequestItem) => new Date(i.Created).toLocaleString() },
    { key: 'status', name: 'Status', fieldName: 'Status', minWidth: 90 },
    { key: 'name', name: 'Name', fieldName: 'RequesterName', minWidth: 120 },
    { key: 'assigned', name: 'Assigned', minWidth: 140, onRender: (i: RequestItem) => i.AssignedPeerSupporter?.Title || i.AssignedPeerSupporter?.EMail || '' }
  ];

  const onAssign = async (): Promise<void> => {
    if (!selected) return;
    if (!assigneeEmail.trim() && !assigneeLoginName.trim()) {
      setError('Enter an assignee email or login name.');
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      // ensureuser expects a claim/login. If only email is provided, try it directly first; tenants often accept it.
      const login = assigneeLoginName.trim() || assigneeEmail.trim();
      const userId = await ensureUser(props.spHttpClient, props.webAbsoluteUrl, login);

      await updateRequest(props.spHttpClient, props.webAbsoluteUrl, selected.Id, {
        AssignedPeerSupporterId: userId,
        Status: 'Assigned',
        ...vis
      });

      await applyItemLevelPermissions(props.spHttpClient, props.webAbsoluteUrl, selected.Id, userId);
      await writeAuditLog(props.spHttpClient, props.webAbsoluteUrl, 'RequestAssigned', selected.Id, {
        // Avoid logging PII; this is metadata only.
        assignedLogin: login,
        visibility: { ...vis }
      });
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error assigning request.');
    } finally {
      setSaving(false);
    }
  };

  const onSetStatus = async (status: 'InProgress' | 'Closed'): Promise<void> => {
    if (!selected) return;
    setSaving(true);
    setError(undefined);
    try {
      await updateRequest(props.spHttpClient, props.webAbsoluteUrl, selected.Id, { Status: status });
      await writeAuditLog(props.spHttpClient, props.webAbsoluteUrl, 'RequestStatusChanged', selected.Id, { status });
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error updating status.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack tokens={{ childrenGap: 12 }} styles={{ root: { maxWidth: 1100 } }}>
      <Stack horizontal={true} horizontalAlign="space-between" verticalAlign="end">
        <h2>Admin / HR Dashboard</h2>
        <DefaultButton text="Refresh" onClick={refresh} disabled={loading || saving} />
      </Stack>

      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline={true}>
          {error}
        </MessageBar>
      )}

      {loading ? (
        <Spinner label="Loading requests…" />
      ) : (
        <DetailsList
          items={items}
          columns={columns}
          layoutMode={DetailsListLayoutMode.justified}
          selectionMode={0}
          onItemInvoked={item => setSelected(item)}
        />
      )}

      {selected && (
        <div style={{ marginTop: 16, padding: 12, border: '1px solid rgba(74, 107, 96, 0.18)', borderRadius: 8 }}>
          <h3>Request #{selected.Id}</h3>
          <div style={{ color: '#5c6e66' }}>Status: <strong>{selected.Status}</strong></div>

          <Stack tokens={{ childrenGap: 10 }} styles={{ root: { marginTop: 12, maxWidth: 720 } }}>
            <TextField
              label="Assign to (email)"
              value={assigneeEmail}
              onChange={(_, v) => setAssigneeEmail(v || '')}
              disabled={saving}
            />
            <TextField
              label="Assign to (login name / claim) — optional"
              placeholder="i:0#.f|membership|user@domain.com"
              value={assigneeLoginName}
              onChange={(_, v) => setAssigneeLoginName(v || '')}
              disabled={saving}
            />

            <div style={{ fontWeight: 700, marginTop: 8 }}>What the Peer Supporter can see</div>
            <Checkbox label="Name" checked={vis.ShowNameToPeer} onChange={(_, c) => setVis(s => ({ ...s, ShowNameToPeer: !!c }))} />
            <Checkbox label="Phone" checked={vis.ShowPhoneToPeer} onChange={(_, c) => setVis(s => ({ ...s, ShowPhoneToPeer: !!c }))} />
            <Checkbox label="Email" checked={vis.ShowEmailToPeer} onChange={(_, c) => setVis(s => ({ ...s, ShowEmailToPeer: !!c }))} />
            <Checkbox label="Preferred contact details" checked={vis.ShowPreferredContactToPeer} onChange={(_, c) => setVis(s => ({ ...s, ShowPreferredContactToPeer: !!c }))} />
            <Checkbox label="Description" checked={vis.ShowDescriptionToPeer} onChange={(_, c) => setVis(s => ({ ...s, ShowDescriptionToPeer: !!c }))} />

            <PrimaryButton
              text={saving ? 'Saving…' : 'Assign & save visibility'}
              onClick={onAssign}
              disabled={saving}
              styles={calmPrimaryButtonStyles}
            />

            <Stack horizontal={true} tokens={{ childrenGap: 8 }}>
              <DefaultButton text="Mark In Progress" onClick={() => onSetStatus('InProgress')} disabled={saving} />
              <DefaultButton text="Close request" onClick={() => onSetStatus('Closed')} disabled={saving} />
            </Stack>
          </Stack>

          <div style={{ marginTop: 12 }}>
            <MessageBar messageBarType={MessageBarType.info} isMultiline={true}>
              Assignment applies item-level permissions: Admin/HR retain access; the assigned Peer Supporter gets access to this item.
            </MessageBar>
          </div>
        </div>
      )}
    </Stack>
  );
}

