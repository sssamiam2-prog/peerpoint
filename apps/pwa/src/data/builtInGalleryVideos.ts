/**
 * Curated, embeddable self-help videos shown in the Resource Gallery.
 * Sources are official U.S. NIMH YouTube uploads intended for public education/embedding.
 */
export type BuiltInGalleryVideo = {
  id: string;
  title: string;
  description: string;
  /** YouTube watch or share URL — rendered via VideoEmbed */
  videoUrl: string;
  sourceLabel: string;
};

export const BUILT_IN_GALLERY_VIDEOS: BuiltInGalleryVideo[] = [
  {
    id: 'builtin-nimh-dealing-with-stress',
    title: 'Dealing with stress',
    description:
      'NIMH explains how stress affects the brain and body, and offers practical coping strategies you can try when things feel overwhelming.',
    videoUrl: 'https://www.youtube.com/watch?v=sTpo1FuYQ9I',
    sourceLabel: 'National Institute of Mental Health (NIMH)'
  },
  {
    id: 'builtin-nimh-guided-visualization',
    title: 'Guided visualization for stress',
    description:
      'Learn how stress affects the brain’s fight-flight-freeze response, then follow a short guided visualization you can use when you need to reset.',
    videoUrl: 'https://www.youtube.com/watch?v=Dq9odPtHbcg',
    sourceLabel: 'National Institute of Mental Health (NIMH)'
  }
];
