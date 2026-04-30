export type SelfHelpItem = {
  Id: number;
  Title: string;
  Body?: string;
  Url?: { Url: string; Description?: string };
  Category?: string;
  SortOrder?: number;
  IsPublished?: boolean;
};
