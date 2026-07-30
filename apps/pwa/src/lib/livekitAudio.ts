type LiveKitRoom = {
  localParticipant: { setMicrophoneEnabled: (enabled: boolean) => Promise<unknown> };
  disconnect: () => void;
};

let room: LiveKitRoom | null = null;

export async function isLiveKitConfigured(): Promise<boolean> {
  try {
    const response = await fetch('/api/livekit-token', { method: 'OPTIONS' });
    return response.status !== 404;
  } catch {
    return false;
  }
}

export async function joinLiveKitAudio(input: { url: string; token: string }): Promise<void> {
  const { Room } = await import('livekit-client');
  room?.disconnect();
  const next = new Room();
  await next.connect(input.url, input.token);
  await next.localParticipant.setMicrophoneEnabled(true);
  room = next;
}

export async function muteLiveKitAudio(muted: boolean): Promise<void> {
  await room?.localParticipant.setMicrophoneEnabled(!muted);
}

export function leaveLiveKitAudio(): void {
  room?.disconnect();
  room = null;
}
