export type Topic = 'Models' | 'Research' | 'Open Source' | 'Policy' | 'Industry' | 'Tools';

export interface Story {
  id: string;
  title: string;
  summary: string;
  body: string;
  topic: Topic;
  source: string;
  sourceUrl: string;
  author: string;
  publishedAt: string;
  featured?: boolean;
  readTime: number;
}

export const TOPICS: Topic[] = [
  'Models',
  'Research',
  'Open Source',
  'Policy',
  'Industry',
  'Tools',
];
