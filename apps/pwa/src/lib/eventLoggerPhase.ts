/** When true, member-facing UI is hidden; staff see Peer Support Event Logger only. Admin keeps full workspace. */
export function isEventLoggerPhaseOnly(): boolean {
  const raw = import.meta.env.VITE_PEERPOINT_EVENT_LOGGER_PHASE;
  return raw === '1' || raw === 'true' || raw === 'yes';
}
