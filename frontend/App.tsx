import { useEffect, useMemo, useState } from "react";
import { searchItems } from "./api";
import type { SearchField, SearchResponse, StandardItem } from "./types";

const PAGE_SIZE = 20;
const fieldLabels: Record<SearchField, string> = {
  all: "全部",
  name: "名称",
  code: "编码",
};

function formatDate(value?: string): string {
  return value || "未提供";
}

function linkLabel(key: string): string {
  const labels: Record<string, string> = {
    baidu: "百度网盘",
    xunlei: "迅雷云盘",
    quark: "夸克网盘",
  };
  return labels[key] ?? key;
}

async function copyText(value: string): Promise<void> {
  const clipboardCopy = navigator.clipboard?.writeText(value);
  if (clipboardCopy) {
    try {
      await Promise.race([
        clipboardCopy,
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("clipboard timeout")), 1200)),
      ]);
      return;
    } catch {
      // Fall through to the legacy textarea path for restricted WebViews.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("copy command failed");
}

function App() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [field, setField] = useState<SearchField>("all");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [page, setPage] = useState(1);
  const [copiedLink, setCopiedLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function runSearch(nextPage = 1, nextQuery = submittedQuery, nextField = field) {
    setLoading(true);
    setError("");
    try {
      const result = await searchItems(nextQuery, nextField, nextPage, PAGE_SIZE);
      setResponse(result);
      setPage(result.page);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void runSearch(1, "", "all");
    // The first request intentionally runs once when the app opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pageRange = useMemo(() => {
    if (!response) return [];
    const start = Math.max(1, page - 2);
    const end = Math.min(response.totalPages, start + 4);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [page, response]);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedQuery(query.trim());
    void runSearch(1, query.trim(), field);
  }

  function clearSearch() {
    setQuery("");
    setSubmittedQuery("");
    setField("all");
    void runSearch(1, "", "all");
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-cream text-ink">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col px-5 py-5 sm:px-8 lg:px-12 lg:py-8">
        <header className="flex items-center justify-between gap-4 border-b border-ink/10 pb-5">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-ink text-lg font-black text-cream shadow-soft">标</div>
            <div>
              <p className="font-display text-lg font-black tracking-tight">标准检索台</p>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/45">LOCAL STANDARD INDEX</p>
            </div>
          </div>
          <div className="hidden items-center gap-3 text-right sm:flex">
            <span className="h-2 w-2 rounded-full bg-mint shadow-[0_0_0_5px_rgba(131,197,190,0.18)]" />
            <div>
              <p className="text-xs font-bold text-ink/70">本地数据已就绪</p>
              <p className="text-[11px] text-ink/40">146 个数据页 · 离线检索</p>
            </div>
          </div>
        </header>

        <section className="relative overflow-hidden py-9 sm:py-12">
          <div className="pointer-events-none absolute -right-24 -top-20 h-64 w-64 rounded-full bg-coral/10 blur-3xl" />
          <div className="relative max-w-3xl">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.28em] text-coral">标准知识库 / 01</p>
            <h1 className="font-display text-4xl font-black leading-[1.05] tracking-[-0.04em] sm:text-6xl">把标准查清楚，<br /><span className="text-coral">从一个关键词开始。</span></h1>
            <p className="mt-5 max-w-xl text-sm leading-6 text-ink/60 sm:text-base">按标准名称或编码快速定位记录，查看发布日期、实施日期与下载入口。所有数据来自本地 JSON 分片，无需联网。</p>
          </div>
        </section>

        <section className="rounded-[28px] bg-ink p-3 shadow-soft sm:p-4">
          <form onSubmit={submitSearch} className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex rounded-2xl bg-white/10 p-1 lg:shrink-0">
              {(Object.keys(fieldLabels) as SearchField[]).map((option) => (
                <button key={option} type="button" aria-pressed={field === option} onClick={() => setField(option)} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${field === option ? "bg-cream text-ink" : "text-white/60 hover:text-white"}`}>
                  {fieldLabels[option]}
                </button>
              ))}
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-white px-4 py-1.5">
              <svg className="h-5 w-5 shrink-0 text-ink/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`输入${fieldLabels[field]}关键词，例如：接触镜 / GB 4234`} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm font-semibold outline-none placeholder:text-ink/35" />
              {query && <button type="button" onClick={() => setQuery("")} className="text-xl leading-none text-ink/30 hover:text-ink">×</button>}
            </div>
            <button type="submit" disabled={loading} className="rounded-2xl bg-coral px-7 py-3 text-sm font-black text-white transition hover:bg-[#db5b40] disabled:cursor-wait disabled:opacity-60">{loading ? "检索中…" : "开始检索"}</button>
            <button type="button" onClick={clearSearch} className="rounded-2xl px-4 py-3 text-sm font-bold text-white/60 transition hover:bg-white/10 hover:text-white">清空</button>
          </form>
        </section>

        <section className="flex flex-1 flex-col py-7">
          <div className="min-w-0">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div><p className="text-xs font-black uppercase tracking-[0.2em] text-ink/40">检索结果</p><h2 className="mt-1 text-2xl font-black tracking-tight">{response ? response.total.toLocaleString("zh-CN") : "—"}<span className="ml-2 text-sm font-bold text-ink/40">条匹配记录</span></h2></div>
              {submittedQuery && <p className="max-w-[48%] truncate rounded-full bg-mint/20 px-3 py-1.5 text-xs font-bold text-ink/70">“{submittedQuery}” · {fieldLabels[field]}</p>}
            </div>
            {response && response.total > 0 && <Pagination page={page} totalPages={response.totalPages} pageRange={pageRange} onChange={(nextPage) => void runSearch(nextPage)} />}
            {error ? <div className="rounded-3xl border border-coral/30 bg-coral/10 p-6 text-sm font-semibold text-coral">{error}<p className="mt-2 text-xs font-normal text-ink/60">请确认使用 `npm run tauri:dev` 启动，并确保 data/ 数据目录存在。</p></div> : loading && !response ? <div className="grid gap-3">{[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-3xl bg-ink/5" />)}</div> : response?.items.length ? <div className="grid gap-3">{response.items.map((item, index) => <ResultRow key={`${item.id}-${index}`} item={item} copiedLink={copiedLink} onCopy={async (url) => { try { await copyText(url); setCopiedLink(url); window.setTimeout(() => setCopiedLink((current) => current === url ? "" : current), 1600); } catch { setError("复制链接失败，请检查系统剪贴板权限。"); } }} />)}</div> : <div className="rounded-3xl border border-dashed border-ink/15 p-12 text-center"><p className="text-lg font-black">没有找到匹配标准</p><p className="mt-2 text-sm text-ink/50">换个名称或编码试试，例如 “GB” 或 “医疗”。</p></div>}
          </div>
        </section>

        <footer className="border-t border-ink/10 py-4 text-xs font-semibold text-ink/35">标准检索台 · 本地数据工具 <span className="mx-2">/</span> Tauri + React</footer>
      </div>
    </main>
  );
}

function ResultRow({ item, copiedLink, onCopy }: { item: StandardItem; copiedLink: string; onCopy: (url: string) => void }) {
  const links = Object.entries(item.links ?? {});
  return <article className="rounded-3xl border border-ink/8 bg-white/70 p-4 transition hover:border-ink/15 hover:shadow-soft sm:p-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><p className="mb-1 truncate text-xs font-black tracking-wide text-coral">{item.code || "未提供编码"}</p><h3 className="text-base font-black leading-6">{item.name || "未提供名称"}</h3></div><span className="w-fit shrink-0 rounded-full bg-mint/20 px-2.5 py-1 text-[11px] font-black text-ink/70">{item.status || "未知状态"}</span></div><dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-ink/8 pt-3 text-xs sm:grid-cols-3 lg:grid-cols-5"><div><dt className="font-bold text-ink/40">实施时间</dt><dd className="mt-0.5 font-black text-ink/80">{formatDate(item.implDate)}</dd></div><div><dt className="font-bold text-ink/40">发布时间</dt><dd className="mt-0.5 font-black text-ink/80">{formatDate(item.publishDate)}</dd></div><div><dt className="font-bold text-ink/40">标准级别</dt><dd className="mt-0.5 font-black text-ink/80">{item.level || "未提供"}</dd></div><div><dt className="font-bold text-ink/40">标准系列</dt><dd className="mt-0.5 font-black text-ink/80">{item.series || "未提供"}</dd></div><div><dt className="font-bold text-ink/40">状态</dt><dd className="mt-0.5 font-black text-ink/80">{item.status || "未提供"}</dd></div></dl><div className="mt-4 border-t border-ink/8 pt-3"><p className="mb-2 text-[11px] font-black uppercase tracking-[0.16em] text-ink/40">可用链接 · {links.length}</p>{links.length ? <div className="flex flex-wrap gap-2">{links.map(([key, link]) => <div key={key} className="flex max-w-full items-center gap-1.5 rounded-xl bg-ink/[0.045] py-1 pl-2.5 pr-1"><span className="max-w-40 truncate text-xs font-bold text-ink/75" title={link.url}>{linkLabel(key)}</span><button type="button" aria-label={`打开${linkLabel(key)}`} onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")} className="rounded-lg bg-white px-2 py-1 text-[11px] font-black text-ink/60 shadow-sm transition hover:bg-mint/20 hover:text-ink">打开</button><button type="button" aria-label={`复制${linkLabel(key)}链接`} onClick={() => onCopy(link.url)} className="rounded-lg px-2 py-1 text-[11px] font-black text-coral transition hover:bg-coral/10">{copiedLink === link.url ? "已复制" : "复制"}</button></div>)}</div> : <p className="text-xs text-ink/40">暂无可用链接</p>}</div></article>;
}

function Pagination({ page, totalPages, pageRange, onChange }: { page: number; totalPages: number; pageRange: number[]; onChange: (page: number) => void }) {
  return <nav className="mt-6 flex flex-wrap items-center justify-between gap-3" aria-label="分页"><p className="text-xs font-bold text-ink/40">第 {page} / {totalPages.toLocaleString("zh-CN")} 页</p><div className="flex items-center gap-1.5"><button type="button" disabled={page === 1} onClick={() => onChange(page - 1)} className="rounded-xl px-3 py-2 text-xs font-black text-ink/60 hover:bg-white disabled:opacity-30">上一页</button>{pageRange.map((pageNumber) => <button type="button" key={pageNumber} onClick={() => onChange(pageNumber)} className={`h-8 min-w-8 rounded-xl px-2 text-xs font-black ${pageNumber === page ? "bg-ink text-cream" : "text-ink/50 hover:bg-white"}`}>{pageNumber}</button>)}<button type="button" disabled={page === totalPages} onClick={() => onChange(page + 1)} className="rounded-xl px-3 py-2 text-xs font-black text-ink/60 hover:bg-white disabled:opacity-30">下一页</button></div></nav>;
}

export default App;
