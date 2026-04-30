import * as React from 'react';
import type { MSGraphClientFactory } from '@microsoft/sp-http';
import { getCurrentUserRoles } from './roleService';

export type Role = 'Admin' | 'HR' | 'PeerSupporter';

export function useRoles(msGraphClientFactory: MSGraphClientFactory): {
  loading: boolean;
  error?: string;
  roles: Set<Role>;
} {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [roles, setRoles] = React.useState<Set<Role>>(new Set());

  React.useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      setLoading(true);
      setError(undefined);
      try {
        const r = await getCurrentUserRoles(msGraphClientFactory);
        if (!cancelled) setRoles(r);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error loading roles.';
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run().catch(() => {
      // handled via state
    });
    return () => {
      cancelled = true;
    };
  }, [msGraphClientFactory]);

  return { loading, error, roles };
}

