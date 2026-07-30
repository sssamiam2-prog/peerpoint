export type UiMode = 'classic' | 'modern';

const KEY = 'peerpoint_ui_mode';
const EVENT = 'peerpoint-ui-mode-change';

export function getUiMode(): UiMode {
  try {
    return localStorage.getItem(KEY) === 'modern' ? 'modern' : 'classic';
  } catch {
    return 'classic';
  }
}

export function setUiMode(mode: UiMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* storage can be unavailable */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeUiMode(callback: () => void): () => void {
  const onStorage = (event: StorageEvent): void => {
    if (event.key === KEY) callback();
  };
  window.addEventListener(EVENT, callback);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener('storage', onStorage);
  };
}
