import * as React from 'react';
import type { SPHttpClient } from '@microsoft/sp-http';
import { DefaultButton, MessageBar, MessageBarType, Spinner, Stack } from '@fluentui/react';
import { listMyAssignedRequests, type RequestItem } from './sharepointRequestsApi';
import { writeAuditLog } from './auditLogApi';

type Props = {
  spHttpClient: SPHttpClient;
  webAbsoluteUrl: string;
  userEmail: string;
};

function mask(value: string): string {
  if (!value) return '';
  if (value.length <= 4) return '••••';
  return `${value.substring(0, 2)}••••${value.substring(value.length - 2)}`;
}

export function MyAssignmentsPage(props: Props): React.ReactElement<Props> {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [items, setItems] = React.useState<RequestItem[]>([]);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const data = await listMyAssignedRequests(props.spHttpClient, props.webAbsoluteUrl, props.userEmail);
      setItems(data);
      // Aggregate view event without PII.
      await writeAuditLog(props.spHttpClient, props.webAbsoluteUrl, 'RequestViewed', undefined, {
        route: 'MyAssignments',
        count: data.length
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error loading assignments.');
    } finally {
      setLoading(false);
    }
  }, [props.spHttpClient, props.userEmail, props.webAbsoluteUrl]);

  React.useEffect(() => {
    refresh().catch(() => {
      // handled via state
    });
  }, [refresh]);

  return (
    <Stack tokens={{ childrenGap: 12 }} styles={{ root: { maxWidth: 900 } }}>
      <Stack horizontal={true} horizontalAlign="space-between" verticalAlign="end">
        <h2>My Assignments</h2>
        <DefaultButton text="Refresh" onClick={refresh} disabled={loading} />
      </Stack>

      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline={true}>
          {error}
        </MessageBar>
      )}

      {loading ? (
        <Spinner label="Loading assigned requests…" />
      ) : items.length === 0 ? (
        <MessageBar messageBarType={MessageBarType.info}>No assigned requests.</MessageBar>
      ) : (
        <Stack tokens={{ childrenGap: 12 }}>
          {items.map(item => (
            <div key={item.Id} style={{ border: '1px solid rgba(74, 107, 96, 0.18)', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ fontWeight: 700 }}>Request #{item.Id}</div>
                <div style={{ color: '#5c6e66' }}>{new Date(item.Created).toLocaleString()}</div>
              </div>
              <div style={{ marginTop: 6, color: '#5c6e66' }}>Status: <strong>{item.Status}</strong></div>

              <div style={{ marginTop: 10 }}>
                <div><strong>Name:</strong> {item.ShowNameToPeer ? (item.RequesterName || '(not provided)') : '(hidden)'}</div>
                <div><strong>Phone:</strong> {item.ShowPhoneToPeer ? item.RequesterPhone : mask(item.RequesterPhone)}</div>
                <div><strong>Email:</strong> {item.ShowEmailToPeer ? item.RequesterEmail : '(hidden)'}</div>
                {item.ShowPreferredContactToPeer && item.PreferredContact && (
                  <div style={{ marginTop: 6 }}><strong>Preferred contact:</strong> {item.PreferredContact}</div>
                )}
                {item.ShowDescriptionToPeer && item.Description && (
                  <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}><strong>Description:</strong> {item.Description}</div>
                )}
              </div>
            </div>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

