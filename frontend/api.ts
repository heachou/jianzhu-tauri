import { invoke } from "@tauri-apps/api/core";
import type { SearchField, SearchResponse, StandardItem } from "./types";

function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

async function searchInBrowser(query: string, field: SearchField, page: number, pageSize: number): Promise<SearchResponse> {
  const manifestResponse = await fetch("/manifest.json");
  if (!manifestResponse.ok) throw new Error(`加载数据清单失败：HTTP ${manifestResponse.status}`);
  const manifest = (await manifestResponse.json()) as { files: string[] };
  const chunks = await Promise.all(manifest.files.map(async (file) => {
    const response = await fetch(`/${file}`);
    if (!response.ok) throw new Error(`加载 ${file} 失败：HTTP ${response.status}`);
    return response.json() as Promise<{ items: StandardItem[] }>;
  }));
  const normalizedQuery = query.trim().toLowerCase();
  const items = chunks.flatMap((chunk) => chunk.items).filter((item) => {
    if (!normalizedQuery) return true;
    const name = item.name?.toLowerCase() ?? "";
    const code = item.code?.toLowerCase() ?? "";
    if (field === "name") return name.includes(normalizedQuery);
    if (field === "code") return code.includes(normalizedQuery);
    return name.includes(normalizedQuery) || code.includes(normalizedQuery);
  });
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = Math.min((page - 1) * pageSize, total);
  return { items: items.slice(start, start + pageSize), total, page, pageSize, totalPages };
}

export async function searchItems(query: string, field: SearchField, page: number, pageSize: number): Promise<SearchResponse> {
  if (!isTauriRuntime()) return searchInBrowser(query, field, page, pageSize);
  return invoke<SearchResponse>("search_items", { request: { query, field, page, pageSize } });
}
