import type { SelfHelpItem } from './selfHelpTypes';

/**
 * Default self-help articles for sworn law enforcement and agency employees.
 * Merged with SharePoint `SelfHelpContent` items (site list overrides / extends this set).
 */
export const BUILT_IN_SELF_HELP: SelfHelpItem[] = [
  {
    Id: -1,
    Title: 'Cumulative stress in law enforcement work',
    Category: 'Sworn & agency wellness',
    SortOrder: 10,
    IsPublished: true,
    Body: `Rotating shifts, high-alert posture, and repeated exposure to trauma and conflict can build up over time—even when you feel “fine” day to day.

Common signs include sleep disruption, irritability, feeling numb or detached, difficulty “turning off” after work, increased cynicism, or using alcohol to unwind.

Reaching out early is a strength, not a weakness. Consider your agency’s peer support program, employee assistance (EAP), chaplaincy, or a trusted supervisor. If you use this app’s Request Help, your agency’s peer support team can follow up according to local policy.`
  },
  {
    Id: -2,
    Title: 'After a critical incident',
    Category: 'Sworn & agency wellness',
    SortOrder: 20,
    IsPublished: true,
    Body: `Critical incidents (e.g., serious use of force, line-of-duty death, child death, mass casualty, or a near-death event for you or a partner) can affect memory, concentration, sleep, and relationships.

Many agencies use peer support, debriefs, or post-incident wellness check-ins. Participation is often voluntary; your agency sets the rules.

If you are in crisis or thinking about hurting yourself, call or text 988 (Suicide & Crisis Lifeline) or use emergency services (911) when there is immediate danger to life.`
  },
  {
    Id: -3,
    Title: 'Operational stress for civilian law enforcement staff',
    Category: 'Agency employees',
    SortOrder: 30,
    IsPublished: true,
    Body: `Dispatchers, records staff, evidence technicians, analysts, jail and court support staff, and others may experience vicarious trauma from audio, video, reports, or constant exposure to high-stress incidents—even without wearing a badge in the field.

Symptoms can overlap with those seen in sworn roles: hypervigilance, fatigue, anxiety, or feeling disconnected.

Your agency’s EAP, peer support (if extended to civilians), and occupational health resources apply to you too. If your site uses this app, Request Help can route you to the right internal contact.`
  },
  {
    Id: -4,
    Title: 'Family, relationships, and shift work',
    Category: 'Agency employees',
    SortOrder: 40,
    IsPublished: true,
    Body: `Odd hours and missed events can strain partners and children. Secondary stress—carrying work mood or stories home—can build quietly.

Simple habits help: predictable “off duty” rituals, clear communication about when you need space vs. connection, and involving family in agency wellness or family-oriented programs when available.

If stress is affecting safety at home, seek confidential help through EAP or local domestic-violence hotlines as appropriate.`
  },
  {
    Id: -5,
    Title: 'Getting help without shame',
    Category: 'Peer support',
    SortOrder: 50,
    IsPublished: true,
    Body: `Law enforcement culture has improved, but stigma around mental health still exists. Seeking counseling, peer support, or substance-use assessment is consistent with professional readiness—not the opposite.

Many states have confidentiality frameworks for officer wellness programs; details depend on your agency and state law. When in doubt, ask your peer support coordinator or union representative what protections apply.

This PEERPoint tool is one way to start a conversation with your agency’s peer support team.`
  },
  {
    Id: -6,
    Title: 'National 988 Suicide & Crisis Lifeline',
    Category: 'Crisis resources',
    SortOrder: 60,
    IsPublished: true,
    Body: `If you or someone you know is in emotional distress or suicidal crisis, you can call or text 988, 24/7, from the United States.

988 is confidential and staffed by trained counselors. It is not a substitute for 911 when there is an immediate threat to life or public safety—use 911 for emergencies requiring police, fire, or EMS.

Learn more at the official Lifeline site (link below).`,
    Url: { Url: 'https://988lifeline.org/', Description: '988lifeline.org' }
  },
  {
    Id: -7,
    Title: 'SAMHSA National Helpline (treatment referral)',
    Category: 'Crisis resources',
    SortOrder: 70,
    IsPublished: true,
    Body: `The Substance Abuse and Mental Health Services Administration (SAMHSA) National Helpline (1-800-662-4357) is a free, confidential, 24/7 service in English and Spanish for individuals and families facing mental and/or substance use disorders. It can help you find local treatment facilities, support groups, and community organizations.

This is general information—not a diagnosis or endorsement of a specific provider.`,
    Url: { Url: 'https://www.samhsa.gov/find-help/national-helpline', Description: 'SAMHSA National Helpline' }
  },
  {
    Id: -8,
    Title: 'Sleep, nutrition, and recovery between shifts',
    Category: 'Sworn & agency wellness',
    SortOrder: 80,
    IsPublished: true,
    Body: `Irregular sleep worsens mood, decision-making, and cardiovascular risk. Small steps matter: consistent wind-down, limiting alcohol before bed, blackout curtains or eye masks for day sleep, and brief daylight exposure when you wake for night shifts.

Hydration and regular meals (not only caffeine and sugar) support steadier energy. Your agency physician or EAP can help if sleep problems persist.`
  }
];

export function mergeSelfHelpItems(remote: SelfHelpItem[]): SelfHelpItem[] {
  const byKey = new Map<number, SelfHelpItem>();
  for (const item of BUILT_IN_SELF_HELP) {
    byKey.set(item.Id, item);
  }
  for (const item of remote) {
    byKey.set(item.Id, item);
  }
  const combined = Array.from(byKey.values());
  combined.sort((a, b) => {
    const sa = a.SortOrder ?? 999;
    const sb = b.SortOrder ?? 999;
    if (sa !== sb) {
      return sa - sb;
    }
    return (a.Title || '').localeCompare(b.Title || '', undefined, { sensitivity: 'base' });
  });
  return combined;
}
