/** Official contact channels for Salt Lake County peer support (in-app quick actions). */
export const PEER_SUPPORT_EMAIL = 'slcosopeersupport@saltlakecounty.gov';
export const PEER_SUPPORT_PHONE_DISPLAY = '801-548-8002';
/** E.164-style digits for tel:/sms: links */
const PEER_SUPPORT_PHONE_E164 = '+18015488002';

export const PEER_SUPPORT_MAILTO = `mailto:${PEER_SUPPORT_EMAIL}?subject=${encodeURIComponent('Peer support')}`;
export const PEER_SUPPORT_TEL = `tel:${PEER_SUPPORT_PHONE_E164}`;
export const PEER_SUPPORT_SMS = `sms:${PEER_SUPPORT_PHONE_E164}`;
export const LIFELINE_988_TEL = 'tel:988';
