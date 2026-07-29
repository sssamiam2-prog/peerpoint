/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module '*.css?inline' {
  const css: string;
  export default css;
}

interface ImportMetaEnv {
  /** App semver from package.json (bumped for each release). */
  readonly VITE_APP_VERSION: string;
  /** Local/dev Ably key (prefer VITE_ABLY_AUTH_URL in production). */
  readonly VITE_ABLY_KEY?: string;
  /** Cloudflare Function that returns Ably TokenDetails, e.g. `/api/ably-token`. */
  readonly VITE_ABLY_AUTH_URL?: string;
  /** Set to `true` or `1` to enable `[PeerChat]` console logs in production builds. */
  readonly VITE_PEER_CHAT_DEBUG?: string;
  /**
   * Optional JSON array of extra `RTCIceServer` objects (e.g. TURN) merged with the default public STUN server.
   * Example: `[{"urls":"turn:turn.example.com:3478","username":"u","credential":"p"}]`
   */
  readonly VITE_WEBRTC_ICE_JSON?: string;
}
