import * as Ably from 'ably';
import type { Message, PresenceMessage } from 'ably';
import { resolveAblyClientOptions } from './ablyAuth';
import { channelNameForRoom, explainAblyError, stableBrowserTabClientId } from './peerChatAbly';
import { openDisguisedMicrophone, type VoiceDisguisePreset } from './voiceDisguise';

export const VOICE_SIG_EVENT = 'voice_sig';

export type { VoiceDisguisePreset };

type VoiceSigV1 =
  | { v: 1; kind: 'offer'; sdp: string; fromClientId: string }
  | { v: 1; kind: 'answer'; sdp: string; fromClientId: string }
  | { v: 1; kind: 'ice'; candidate: RTCIceCandidateInit | null; fromClientId: string }
  | { v: 1; kind: 'bye'; fromClientId: string };

function parseVoiceSig(data: unknown): VoiceSigV1 | null {
  if (data === null || data === undefined) return null;
  let o: unknown = data;
  if (typeof data === 'string') {
    try {
      o = JSON.parse(data) as unknown;
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  if (r.v !== 1) return null;
  const fromClientId = typeof r.fromClientId === 'string' ? r.fromClientId.trim() : '';
  if (!fromClientId) return null;
  const kind = r.kind;
  if (kind === 'bye') return { v: 1, kind: 'bye', fromClientId };
  if (kind === 'offer' && typeof r.sdp === 'string') {
    return { v: 1, kind: 'offer', sdp: r.sdp, fromClientId };
  }
  if (kind === 'answer' && typeof r.sdp === 'string') {
    return { v: 1, kind: 'answer', sdp: r.sdp, fromClientId };
  }
  if (kind === 'ice') {
    const c = r.candidate;
    if (c === null) return { v: 1, kind: 'ice', candidate: null, fromClientId };
    if (c && typeof c === 'object') {
      return { v: 1, kind: 'ice', candidate: c as RTCIceCandidateInit, fromClientId };
    }
  }
  return null;
}

function presenceMemberKey(m: PresenceMessage): string | undefined {
  const cid = m.clientId?.trim();
  if (cid) return cid;
  const conn = m.connectionId?.trim();
  if (conn) return conn;
  return undefined;
}

function parseIceServersFromEnv(): RTCIceServer[] {
  const base: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  const raw = import.meta.env.VITE_WEBRTC_ICE_JSON as string | undefined;
  if (!raw || raw.trim() === '') return base;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return [...base, ...(parsed as RTCIceServer[])];
    }
  } catch {
    /* ignore */
  }
  return base;
}

async function waitForRealtimeConnected(client: Ably.Realtime): Promise<void> {
  const initial = client.connection.state;
  if (initial === 'connected') return;
  if (initial === 'failed' || initial === 'closed') {
    throw new Error('Ably connection cannot start (already failed or closed). Check VITE_ABLY_KEY.');
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for Ably (20s). Check network and VITE_ABLY_KEY.'));
    }, 20_000);
    const cleanup = (): void => {
      clearTimeout(timer);
      client.connection.off(onState);
    };
    const onState = (change: Ably.ConnectionStateChange): void => {
      if (change.current === 'connected') {
        cleanup();
        resolve();
      } else if (change.current === 'failed' || change.current === 'closed') {
        cleanup();
        reject(new Error(explainAblyError(new Error(String(change.reason ?? change.current)))));
      }
    };
    client.connection.on(onState);
  });
}

export type PeerVoiceUiState = 'connecting' | 'waiting' | 'ringing' | 'live' | 'ended' | 'error';

export type PeerVoiceSessionApi = {
  localStream: MediaStream;
  setMuted: (muted: boolean) => void;
  close: () => void;
};

/**
 * 1:1 WebRTC audio via Ably signaling on the same channel as text chat (`peerpoint:room:*`).
 * Works best on HTTPS; many networks need a TURN server (set `VITE_WEBRTC_ICE_JSON`).
 */
/** Module-level voice sessions — survives Strict Mode remounts (same pattern as chat). */
const liveVoice = new Map<string, { refCount: number; api: PeerVoiceSessionApi; hardClose: () => void }>();

export async function startPeerVoiceSession(opts: {
  apiKey?: string;
  roomCode: string;
  displayName: string;
  /** Mild on-device voice disguise. Default off. */
  voiceDisguise?: VoiceDisguisePreset;
  onRemoteStream: (stream: MediaStream) => void;
  onUiState: (s: PeerVoiceUiState) => void;
  onStatus: (message: string) => void;
}): Promise<PeerVoiceSessionApi> {
  const fallbackName = opts.displayName.trim() || 'Anonymous';
  const disguise: VoiceDisguisePreset = opts.voiceDisguise ?? 'off';
  const localClientId = stableBrowserTabClientId();
  const mapKey = `${opts.roomCode}::${localClientId}::${disguise}`;

  const existing = liveVoice.get(mapKey);
  if (existing) {
    existing.refCount += 1;
    let released = false;
    return {
      localStream: existing.api.localStream,
      setMuted: existing.api.setMuted,
      close: (): void => {
        if (released) return;
        released = true;
        existing.refCount -= 1;
        if (existing.refCount <= 0) {
          liveVoice.delete(mapKey);
          existing.hardClose();
        }
      }
    };
  }

  opts.onStatus(
    disguise === 'off'
      ? 'Requesting microphone…'
      : `Requesting microphone (voice disguise: ${disguise})…`
  );

  const mic = await openDisguisedMicrophone(disguise);
  const localStream = mic.sendStream;

  const client = new Ably.Realtime(
    resolveAblyClientOptions({
      roomCode: opts.roomCode,
      clientId: localClientId,
      apiKey: opts.apiKey,
      echoMessages: false
    })
  );

  await waitForRealtimeConnected(client);

  const chanName = channelNameForRoom(opts.roomCode);
  const channel = client.channels.get(chanName);
  await channel.attach();

  let pc: RTCPeerConnection | null = null;
  let remoteClientId: string | null = null;
  let destroyed = false;
  let negotiationBusy = false;

  const iceServers = parseIceServersFromEnv();

  const publishSig = async (sig: VoiceSigV1): Promise<void> => {
    if (destroyed) return;
    await channel.publish(VOICE_SIG_EVENT, sig);
  };

  const teardownPc = (): void => {
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.close();
      pc = null;
    }
  };

  const buildPc = (): RTCPeerConnection => {
    const c = new RTCPeerConnection({ iceServers });
    c.ontrack = ev => {
      if (ev.streams[0]) {
        opts.onRemoteStream(ev.streams[0]);
      }
    };
    c.onicecandidate = e => {
      if (destroyed || !pc) return;
      void publishSig({
        v: 1,
        kind: 'ice',
        candidate: e.candidate ? e.candidate.toJSON() : null,
        fromClientId: localClientId
      });
    };
    c.onconnectionstatechange = () => {
      if (!pc || destroyed) return;
      if (pc.connectionState === 'failed') {
        opts.onStatus('Connection failed. Try again, or add a TURN server (see help text).');
        opts.onUiState('error');
      }
    };
    c.oniceconnectionstatechange = () => {
      if (!pc || destroyed) return;
      const ice = pc.iceConnectionState;
      if (ice === 'connected' || ice === 'completed') {
        opts.onUiState('live');
      } else if (ice === 'disconnected' || ice === 'failed' || ice === 'closed') {
        if (!destroyed) opts.onUiState('ringing');
      }
    };
    for (const t of localStream.getTracks()) {
      c.addTrack(t, localStream);
    }
    return c;
  };

  const runNegotiation = async (members: PresenceMessage[]): Promise<void> => {
    if (destroyed || negotiationBusy) return;

    const seen = new Map<string, string>();
    for (const m of members) {
      const id = presenceMemberKey(m);
      if (!id || id === localClientId) continue;
      if (!seen.has(id)) {
        const nm =
          m.data && typeof m.data === 'object' && m.data !== null && 'name' in m.data
            ? String((m.data as { name?: string }).name ?? '').trim()
            : '';
        seen.set(id, nm || 'Peer');
      }
    }
    const others = [...seen.keys()].sort((a, b) => a.localeCompare(b));

    if (others.length === 0) {
      remoteClientId = null;
      teardownPc();
      opts.onUiState('waiting');
      opts.onStatus('Waiting for someone else to join this room with the same code…');
      return;
    }

    if (others.length > 1) {
      teardownPc();
      remoteClientId = null;
      opts.onUiState('error');
      opts.onStatus(
        'Too many people in this voice room (1:1 only). Leave and use a private room code with exactly one peer.'
      );
      return;
    }

    const hasTurn = iceServers.some(s => {
      const u = s.urls;
      const list = Array.isArray(u) ? u : [u];
      return list.some(x => String(x).toLowerCase().startsWith('turn:'));
    });

    const peer = others[0]!;
    if (remoteClientId !== peer) {
      remoteClientId = peer;
      teardownPc();
      pc = buildPc();
      opts.onUiState('ringing');
      opts.onStatus(
        hasTurn
          ? 'Connecting voice…'
          : 'Connecting voice… If this fails, set VITE_WEBRTC_ICE_JSON with a TURN server (many networks block peer-to-peer).'
      );
    }

    if (!pc || destroyed) return;
    negotiationBusy = true;
    try {
      const amCaller = localClientId.localeCompare(peer) < 0;

      if (amCaller) {
        if (pc.signalingState === 'stable' && !pc.remoteDescription) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await publishSig({
            v: 1,
            kind: 'offer',
            sdp: offer.sdp ?? '',
            fromClientId: localClientId
          });
        }
      }
    } catch (e: unknown) {
      opts.onStatus(e instanceof Error ? e.message : String(e));
      opts.onUiState('error');
    } finally {
      negotiationBusy = false;
    }
  };

  const onSig = async (m: Message): Promise<void> => {
    if (destroyed) return;
    const sig = parseVoiceSig(m.data);
    if (!sig || sig.fromClientId === localClientId) return;
    if (remoteClientId && sig.fromClientId !== remoteClientId) return;

    if (sig.kind === 'bye') {
      opts.onStatus('The other person left the voice session.');
      teardownPc();
      remoteClientId = null;
      opts.onUiState('waiting');
      return;
    }

    if (!pc && sig.kind !== 'offer') return;
    if (sig.kind === 'offer') {
      if (!pc) {
        remoteClientId = sig.fromClientId;
        pc = buildPc();
      }
      if (!pc) return;
      try {
        negotiationBusy = true;
        await pc.setRemoteDescription({ type: 'offer', sdp: sig.sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await publishSig({
          v: 1,
          kind: 'answer',
          sdp: answer.sdp ?? '',
          fromClientId: localClientId
        });
        opts.onUiState('ringing');
      } catch (e: unknown) {
        opts.onStatus(e instanceof Error ? e.message : String(e));
        opts.onUiState('error');
      } finally {
        negotiationBusy = false;
      }
      return;
    }

    if (!pc) return;

    if (sig.kind === 'answer') {
      try {
        negotiationBusy = true;
        await pc.setRemoteDescription({ type: 'answer', sdp: sig.sdp });
      } catch (e: unknown) {
        opts.onStatus(e instanceof Error ? e.message : String(e));
        opts.onUiState('error');
      } finally {
        negotiationBusy = false;
      }
      return;
    }

    if (sig.kind === 'ice') {
      try {
        if (sig.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(sig.candidate));
        }
      } catch {
        /* ignore stale ICE */
      }
    }
  };

  await channel.subscribe(VOICE_SIG_EVENT, msg => {
    void onSig(msg);
  });

  try {
    await channel.presence.enter({ name: fallbackName });
  } catch {
    /* presence optional — negotiation may still work poorly */
  }

  opts.onUiState('connecting');
  opts.onStatus('Joined room. Waiting for a peer…');

  const pushPresence = async (): Promise<void> => {
    try {
      const members = await channel.presence.get();
      await runNegotiation(members);
    } catch {
      /* ignore */
    }
  };

  const presenceHandler = (): void => {
    void pushPresence();
  };
  channel.presence.subscribe(presenceHandler);
  await pushPresence();

  const hardClose = (): void => {
    if (destroyed) return;
    destroyed = true;
    void publishSig({ v: 1, kind: 'bye', fromClientId: localClientId }).catch(() => {});
    channel.presence.unsubscribe(presenceHandler);
    channel.unsubscribe(VOICE_SIG_EVENT);
    teardownPc();
    mic.close();
    client.close();
  };

  const setMuted = (muted: boolean): void => {
    mic.setMuted(muted);
  };

  const api: PeerVoiceSessionApi = { localStream, setMuted, close: () => undefined };
  const entry = { refCount: 1, api, hardClose };
  let released = false;
  api.close = (): void => {
    if (released) return;
    released = true;
    entry.refCount -= 1;
    if (entry.refCount <= 0) {
      liveVoice.delete(mapKey);
      hardClose();
    }
  };
  liveVoice.set(mapKey, entry);
  return api;
}
