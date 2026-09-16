export type SearchField = "all" | "name" | "code";

export interface StandardLink {
  url: string;
  pwd?: string;
}

export interface StandardItem {
  id: string;
  code: string;
  name: string;
  level: string;
  series: string;
  status: string;
  publishDate?: string;
  implDate?: string;
  links?: Record<string, StandardLink>;
}

export interface SearchResponse {
  items: StandardItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
