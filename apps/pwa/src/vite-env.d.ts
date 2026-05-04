/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_ABLY_KEY?: string;
  /** Set to `true` or `1` to enable `[PeerChat]` console logs in production builds. */
  readonly VITE_PEER_CHAT_DEBUG?: string;
}
