/** Wire payload for peer chat messages (Ably event body). */
export type PeerChatMessage = {
  id: string;
  from: string;
  text: string;
  at: number;
};

/** Typing indicator event on the same channel as chat messages. */
export type PeerTypingPayload = {
  from: string;
  typing: boolean;
};

/** One participant in the room (Ably Presence). */
export type PeerPresenceMember = {
  clientId: string;
  name: string;
};
