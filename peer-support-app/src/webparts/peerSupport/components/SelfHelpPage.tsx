import * as React from 'react';
import { SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';
import { DefaultButton, Link, MessageBar, MessageBarType, SearchBox, Spinner, Stack } from '@fluentui/react';
import { writeAuditLog } from './auditLogApi';
import { mergeSelfHelpItems } from './builtInSelfHelpArticles';
import type { SelfHelpItem } from './selfHelpTypes';

type Props = {
  spHttpClient: SPHttpClient;
  webAbsoluteUrl: string;
};

/** 404 from GetByTitle when the list has not been created on the site yet. */
function isSelfHelpListMissing(status: number, body: string): boolean {
  if (status !== 404) {
    return false;
  }
  const t = body.toLowerCase();
  return (
    t.includes('does not exist') ||
    t.includes('cannot find') ||
    t.includes('could not be found') ||
    /list\s+['"]?selfhelpcontent['"]?\s+does\s+not\s+exist/i.test(body)
  );
}

export function SelfHelpPage(props: Props): React.ReactElement<Props> {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [listMissingNotice, setListMissingNotice] = React.useState<string | undefined>(undefined);
  const [items, setItems] = React.useState<SelfHelpItem[]>([]);
  const [query, setQuery] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(undefined);
    setListMissingNotice(undefined);
    try {
      const url =
        `${props.webAbsoluteUrl}/_api/web/lists/GetByTitle('SelfHelpContent')/items` +
        `?$select=Id,Title,Body,Url,Category,SortOrder,IsPublished` +
        `&$filter=IsPublished eq 1` +
        `&$orderby=SortOrder asc,Title asc`;
      const resp: SPHttpClientResponse = await props.spHttpClient.get(url, SPHttpClient.configurations.v1, {
        headers: { Accept: 'application/json;odata=nometadata' }
      });
      if (!resp.ok) {
        const text = await resp.text();
        if (isSelfHelpListMissing(resp.status, text)) {
          setItems(mergeSelfHelpItems([]));
          setListMissingNotice(
            'The SharePoint list SelfHelpContent is not on this site yet. Showing built-in articles only. ' +
              'An owner can create the list (see project docs: docs/sharepoint-lists.md) to add agency-specific items.'
          );
          return;
        }
        throw new Error(`Failed to load Self Help (${resp.status}): ${text}`);
      }
      const json: { value: SelfHelpItem[] } = await resp.json();
      setItems(mergeSelfHelpItems(json.value || []));
      await writeAuditLog(props.spHttpClient, props.webAbsoluteUrl, 'SelfHelpViewed', undefined);
    } catch (e: unknown) {
      setItems(mergeSelfHelpItems([]));
      setError(e instanceof Error ? e.message : 'Unknown error loading Self Help.');
    } finally {
      setLoading(false);
    }
  }, [props.spHttpClient, props.webAbsoluteUrl]);

  React.useEffect(() => {
    load().catch(() => {
      // handled via state
    });
  }, [load]);

  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? items.filter(i => {
        const haystack = `${i.Title ?? ''}\n${i.Body ?? ''}\n${i.Category ?? ''}`.toLowerCase();
        return haystack.includes(normalized);
      })
    : items;

  return (
    <Stack tokens={{ childrenGap: 12 }} styles={{ root: { maxWidth: 900 } }}>
      <Stack horizontal={true} horizontalAlign="space-between" verticalAlign="end">
        <h2>Self Help</h2>
        <DefaultButton text="Refresh" onClick={load} disabled={loading} />
      </Stack>
      <p style={{ margin: 0, color: '#5c6e66', lineHeight: 1.5 }}>
        Articles below include topics relevant to <strong>sworn law enforcement</strong> and{' '}
        <strong>civilian staff at law enforcement agencies</strong> (e.g., stress after critical incidents, vicarious
        trauma, shift work, and crisis resources). Your agency can add more items in the SharePoint{' '}
        <em>SelfHelpContent</em> list.
      </p>

      {listMissingNotice && (
        <MessageBar messageBarType={MessageBarType.warning} isMultiline={true}>
          {listMissingNotice}
        </MessageBar>
      )}

      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline={true}>
          {error}
        </MessageBar>
      )}

      <SearchBox placeholder="Search self help materials" value={query} onChange={(_, v) => setQuery(v || '')} />

      {loading ? (
        <Spinner label="Loading self help materials…" />
      ) : filtered.length === 0 ? (
        <MessageBar messageBarType={MessageBarType.info}>No self help items found.</MessageBar>
      ) : (
        <Stack tokens={{ childrenGap: 12 }}>
          {filtered.map(item => (
            <div key={item.Id} style={{ border: '1px solid rgba(74, 107, 96, 0.18)', borderRadius: 8, padding: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{item.Title}</div>
              {item.Category && <div style={{ marginTop: 4, color: '#5c6e66' }}>{item.Category}</div>}
              {item.Body && <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{item.Body}</div>}
              {item.Url?.Url && (
                <div style={{ marginTop: 8 }}>
                  <Link href={item.Url.Url} target="_blank" rel="noreferrer">
                    {item.Url.Description || item.Url.Url}
                  </Link>
                </div>
              )}
            </div>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

