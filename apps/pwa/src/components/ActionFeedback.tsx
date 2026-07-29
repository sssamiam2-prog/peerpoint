import * as React from 'react';

export type SuccessToast = {
  title: string;
  message?: string;
};

type BusyState = {
  label: string;
};

type ActionFeedbackContextValue = {
  runAction: <T>(
    busyLabel: string,
    action: () => Promise<T>,
    success?: SuccessToast | ((result: T) => SuccessToast | undefined)
  ) => Promise<T | undefined>;
  showSuccess: (toast: SuccessToast) => void;
  clearSuccess: () => void;
};

const ActionFeedbackContext = React.createContext<ActionFeedbackContextValue | null>(null);

export function useActionFeedback(): ActionFeedbackContextValue {
  const ctx = React.useContext(ActionFeedbackContext);
  if (!ctx) {
    throw new Error('useActionFeedback must be used within ActionFeedbackProvider');
  }
  return ctx;
}

/** Optional hook when provider may be absent (returns null). */
export function useOptionalActionFeedback(): ActionFeedbackContextValue | null {
  return React.useContext(ActionFeedbackContext);
}

export function ActionFeedbackProvider(props: { children: React.ReactNode }): React.ReactElement {
  const [busy, setBusy] = React.useState<BusyState | null>(null);
  const [success, setSuccess] = React.useState<SuccessToast | null>(null);
  const dismissTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSuccess = React.useCallback((): void => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
    setSuccess(null);
  }, []);

  const showSuccess = React.useCallback(
    (toast: SuccessToast): void => {
      clearSuccess();
      setSuccess(toast);
      dismissTimer.current = setTimeout(() => {
        setSuccess(null);
        dismissTimer.current = null;
      }, 3200);
    },
    [clearSuccess]
  );

  const runAction = React.useCallback(
    async <T,>(
      busyLabel: string,
      action: () => Promise<T>,
      success?: SuccessToast | ((result: T) => SuccessToast | undefined)
    ): Promise<T | undefined> => {
      setBusy({ label: busyLabel });
      try {
        const result = await action();
        setBusy(null);
        const toast = typeof success === 'function' ? success(result) : success;
        if (toast) showSuccess(toast);
        return result;
      } catch (e) {
        setBusy(null);
        throw e;
      }
    },
    [showSuccess]
  );

  React.useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  const value = React.useMemo(
    () => ({ runAction, showSuccess, clearSuccess }),
    [runAction, showSuccess, clearSuccess]
  );

  return (
    <ActionFeedbackContext.Provider value={value}>
      {props.children}
      {busy ? (
        <div className="action-busy-overlay" role="status" aria-live="polite" aria-busy="true">
          <div className="action-busy-card">
            <div className="action-spinner" aria-hidden="true" />
            <p className="action-busy-label">{busy.label}</p>
          </div>
        </div>
      ) : null}
      {success ? (
        <div
          className="action-success-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="action-success-title"
          onClick={clearSuccess}
        >
          <div
            className="action-success-card"
            onClick={e => e.stopPropagation()}
          >
            <div className="action-success-check" aria-hidden="true">
              ✓
            </div>
            <h3 id="action-success-title">{success.title}</h3>
            {success.message ? <p>{success.message}</p> : null}
            <button type="button" onClick={clearSuccess}>
              OK
            </button>
          </div>
        </div>
      ) : null}
    </ActionFeedbackContext.Provider>
  );
}
