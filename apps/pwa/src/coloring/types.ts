export type ColoringCategory = 'mandala' | 'nature' | 'geometric';

export type ColoringRegion = {
  id: string;
  d: string;
};

export type ColoringPage = {
  id: string;
  title: string;
  description: string;
  category: ColoringCategory;
  /** Why this page is included for adult mindfulness coloring. */
  why: string;
  viewBox: string;
  strokeWidth: number;
  regions: ColoringRegion[];
};
