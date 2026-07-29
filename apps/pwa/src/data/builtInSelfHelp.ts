import type { SelfHelpListItem } from '../types/selfHelp';

/**
 * Built-in LE / agency self-help (standalone PWA — no remote list).
 */
export const BUILT_IN_SELF_HELP: SelfHelpListItem[] = [
  {
    id: 'builtin--1',
    fields: {
      Title: 'Cumulative stress in law enforcement work',
      Category: 'Sworn & agency wellness',
      SortOrder: 10,
      IsPublished: true,
      Body: `Rotating shifts, high-alert posture, and repeated exposure to trauma and conflict can build up over time—even when you feel “fine” day to day.

Common signs include sleep disruption, irritability, feeling numb or detached, difficulty “turning off” after work, increased cynicism, or using alcohol to unwind.

Reaching out early is a strength, not a weakness. Consider your agency’s peer support program, employee assistance (EAP), chaplaincy, or a trusted supervisor. If you use this app’s Request Help, your agency’s peer support team can follow up according to local policy.`
    }
  },
  {
    id: 'builtin--2',
    fields: {
      Title: 'After a critical incident',
      Category: 'Sworn & agency wellness',
      SortOrder: 20,
      IsPublished: true,
      Body: `Critical incidents (e.g., serious use of force, line-of-duty death, child death, mass casualty, or a near-death event for you or a partner) can affect memory, concentration, sleep, and relationships.

Many agencies use peer support, debriefs, or post-incident wellness check-ins. Participation is often voluntary; your agency sets the rules.

If you are in crisis or thinking about hurting yourself, call or text 988 (Suicide & Crisis Lifeline) or use emergency services (911) when there is immediate danger to life.`
    }
  },
  {
    id: 'builtin--3',
    fields: {
      Title: 'Operational stress for civilian law enforcement staff',
      Category: 'Agency employees',
      SortOrder: 30,
      IsPublished: true,
      Body: `Dispatchers, records staff, evidence technicians, analysts, jail and court support staff, and others may experience vicarious trauma from audio, video, reports, or constant exposure to high-stress incidents—even without wearing a badge in the field.

Symptoms can overlap with those seen in sworn roles: hypervigilance, fatigue, anxiety, or feeling disconnected.

Your agency’s EAP, peer support (if extended to civilians), and occupational health resources apply to you too. If your site uses this app, Request Help can route you to the right internal contact.`
    }
  },
  {
    id: 'builtin--4',
    fields: {
      Title: 'Family, relationships, and shift work',
      Category: 'Agency employees',
      SortOrder: 40,
      IsPublished: true,
      Body: `Odd hours and missed events can strain partners and children. Secondary stress—carrying work mood or stories home—can build quietly.

Simple habits help: predictable “off duty” rituals, clear communication about when you need space vs. connection, and involving family in agency wellness or family-oriented programs when available.

If stress is affecting safety at home, seek confidential help through EAP or local domestic-violence hotlines as appropriate.`
    }
  },
  {
    id: 'builtin--5',
    fields: {
      Title: 'Getting help without shame',
      Category: 'Peer support',
      SortOrder: 50,
      IsPublished: true,
      Body: `Law enforcement culture has improved, but stigma around mental health still exists. Seeking counseling, peer support, or substance-use assessment is consistent with professional readiness—not the opposite.

Many states have confidentiality frameworks for officer wellness programs; details depend on your agency and state law. When in doubt, ask your peer support coordinator or union representative what protections apply.

This PEERPoint tool is one way to start a conversation with your agency’s peer support team.`
    }
  },
  {
    id: 'builtin--6',
    fields: {
      Title: 'National 988 Suicide & Crisis Lifeline',
      Category: 'Crisis resources',
      SortOrder: 60,
      IsPublished: true,
      Body: `If you or someone you know is in emotional distress or suicidal crisis, you can call or text 988, 24/7, from the United States.

988 is confidential and staffed by trained counselors. It is not a substitute for 911 when there is an immediate threat to life or public safety—use 911 for emergencies requiring police, fire, or EMS.

Learn more at the official Lifeline site (link below).`,
      Url: 'https://988lifeline.org/'
    }
  },
  {
    id: 'builtin--7',
    fields: {
      Title: 'SAMHSA National Helpline (treatment referral)',
      Category: 'Crisis resources',
      SortOrder: 70,
      IsPublished: true,
      Body: `The Substance Abuse and Mental Health Services Administration (SAMHSA) National Helpline (1-800-662-4357) is a free, confidential, 24/7 service in English and Spanish for individuals and families facing mental and/or substance use disorders. It can help you find local treatment facilities, support groups, and community organizations.

This is general information—not a diagnosis or endorsement of a specific provider.`,
      Url: 'https://www.samhsa.gov/find-help/national-helpline'
    }
  },
  {
    id: 'builtin--8',
    fields: {
      Title: 'Sleep, nutrition, and recovery between shifts',
      Category: 'Sworn & agency wellness',
      SortOrder: 80,
      IsPublished: true,
      Body: `Irregular sleep worsens mood, decision-making, and cardiovascular risk. Small steps matter: consistent wind-down, limiting alcohol before bed, blackout curtains or eye masks for day sleep, and brief daylight exposure when you wake for night shifts.

Hydration and regular meals (not only caffeine and sugar) support steadier energy. Your agency physician or EAP can help if sleep problems persist.`
    }
  },
  {
    id: 'builtin--9',
    fields: {
      Title: 'Burnout, cynicism, and moral injury',
      Category: 'Sworn & agency wellness',
      SortOrder: 90,
      IsPublished: true,
      Body: `Burnout often shows up as exhaustion, feeling ineffective, and growing cynicism toward the public or the job. Moral injury can occur when your deeply held values clash with what you must do or witness at work.

Neither means you failed. Early signals include dread before shifts, checking out emotionally, or feeling numb after incidents that used to affect you.

Talk with peer support, a chaplain, or EAP about confidential options. Small routines—off-duty recovery time, movement, and staying connected to people you trust—support resilience alongside formal help.`
    }
  },
  {
    id: 'builtin--10',
    fields: {
      Title: 'Peer support, EAP, and clinical care — when to use what',
      Category: 'Peer support',
      SortOrder: 100,
      IsPublished: true,
      Body: `Trained peer supporters offer judgment-free listening, normalization, and navigation toward agency resources; they are not a substitute for licensed therapy or crisis services.

Employee Assistance Programs (EAP) typically offer short-term counseling and referrals and are confidential within limits spelled out in your plan.

Licensed clinicians treat ongoing PTSD, depression, anxiety, and substance use disorders. There is no shame in “going straight to” clinical care if that is what you need.

If you or someone else is in immediate danger, use 911; for suicidal crisis, call or text 988.`
    }
  },
  {
    id: 'builtin--11',
    fields: {
      Title: 'Confidentiality and what peers can (and cannot) promise',
      Category: 'Peer support',
      SortOrder: 110,
      IsPublished: true,
      Body: `Well-run peer programs explain limits up front: for example, information may need to be shared if someone is at imminent risk of harm, some child/elder abuse disclosures follow mandatory reporting rules, and agency policy may apply to certain incidents.

Ask your peer support coordinator or HR how confidentiality works for sworn staff versus civilians in your agency.

Using tools like this app’s anonymous chat or voice (when available) can reduce fear of being tracked through routine IT logs—but no technology replaces clear policy and trust in your peer team.`
    }
  },
  {
    id: 'builtin--12',
    fields: {
      Title: 'Alcohol, prescriptions, and substance use',
      Category: 'Sworn & agency wellness',
      SortOrder: 120,
      IsPublished: true,
      Body: `Stress and shift work can blur lines between “unwinding” and relying on alcohol or non-prescribed substances. If use is increasing, if others have expressed concern, or if you’re driving or reporting for duty when unsafe—those are reasons to reach out.

Your EAP, agency wellness unit, or primary care can discuss confidential assessment and treatment options. The SAMHSA National Helpline (1-800-662-4357) can help locate treatment—see the Crisis resources article with link.

Policy questions (e.g., fitness for duty) belong to your agency; medical privacy rules still apply in many cases—ask a trusted HR or union resource what applies to you.`
    }
  },
  {
    id: 'builtin--13',
    fields: {
      Title: 'Civilian roles: dispatch stress and “second-hand” trauma',
      Category: 'Agency employees',
      SortOrder: 130,
      IsPublished: true,
      Body: `Call-takers and dispatchers often hold others’ worst moments in real time. Repeated high-acuity calls can produce hypervigilance, sleep problems, irritability, or feeling numb—similar stress patterns to field staff.

Agencies increasingly extend peer support and EAP to civilian roles; if you are unsure you’re included, ask your supervisor or wellness coordinator.

Structured debriefs, rotation off high-intensity queues when possible, and breaks between tough calls are organizational fixes that help—advocate for what your floor needs.`
    }
  },
  {
    id: 'builtin--14',
    fields: {
      Title: 'Financial strain, legal stress, and work performance',
      Category: 'Agency employees',
      SortOrder: 140,
      IsPublished: true,
      Body: `Money problems can spike anxiety and shame and spill into focus and safety at work. You are not alone—many public-sector employees face inflation, medical bills, child-care costs, or relationship transitions.

EAP can often refer to financial counseling. Nonprofit credit counseling (NFCC-member agencies) can help with budgeting and debt plans. For legal questions, some EAPs offer a free initial consultation with an attorney.

Separately, if domestic conflict or orders of protection are involved, prioritize safety planning with advocates who know your context (local DV coalitions, victim services).`
    }
  },
  {
    id: 'builtin--15',
    fields: {
      Title: 'Returning after injury or long leave',
      Category: 'Sworn & agency wellness',
      SortOrder: 150,
      IsPublished: true,
      Body: `Coming back from injury, surgery, or extended leave can mix relief with anxiety about fitness for duty, peer perception, or desk reassignment.

Lean on occupational health, your union or association, and peer support to understand timelines and expectations—not rumor.

Resilience grows when agencies normalize check-ins and phased return where clinically appropriate. If mood or sleep worsens during return, tell your treating clinician and consider EAP.`
    }
  },
  {
    id: 'builtin--16',
    fields: {
      Title: 'Grounding and regulation after a tough shift (micro-skills)',
      Category: 'Peer support',
      SortOrder: 160,
      IsPublished: true,
      Body: `Short practices don’t replace therapy, but they can lower baseline arousal: slow exhale longer than inhale for a minute; cold water on wrists or face; brief walk before driving home; naming five things you see and four you hear to orient.

Pair a grounding habit with a transition ritual—changing clothes, showering, or a few minutes of silence before engaging family—so work stress doesn’t land all at once at home.

Peer apps often bundle micro-learning and resilience skills; the goal here is a menu you can try without committing to a long program first.`
    }
  }
];
