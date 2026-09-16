import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

interface Item {
  [key: string]: unknown;
}

interface Pagination {
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  [key: string]: unknown;
}

interface ApiResponse {
  items: Item[];
  pagination?: Pagination;
  me?: unknown;
  stats?: unknown;
  [key: string]: unknown;
}

interface CrawlOptions {
  baseUrl: string;
  query: string;
  pageSize: number;
  startPage: number;
  endPage: number;
  chunkSize: number;
  outputDir: string;
  requestDelayMs: number;
  retryCount: number;
  timeoutMs: number;
  force: boolean;
  dryRun: boolean;
}

interface ChunkFile {
  items: Item[];
  pagination: {
    pageStart: number;
    pageEnd: number;
    pagesFetched: number;
    pageSize: number;
    itemsCount: number;
    pageItemCounts: number[];
    total?: number;
    totalPages?: number;
  };
  me: unknown;
  stats: unknown;
}

const defaultOptions: CrawlOptions = {
  baseUrl: "https://niaoge123.com/api/items",
  query: "",
  pageSize: 100,
  startPage: 1,
  endPage: 146,
  chunkSize: 10,
  outputDir: resolve("data"),
  requestDelayMs: 300,
  retryCount: 3,
  timeoutMs: 30_000,
  force: false,
  dryRun: false,
};

function parsePositiveInt(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer, received: ${value}`);
  }
  return parsed;
}

function parseNonNegativeInt(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer, received: ${value}`);
  }
  return parsed;
}

function parseArgs(argv: string[]): CrawlOptions {
  const options = { ...defaultOptions };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case "--output-dir":
        if (!next) throw new Error("--output-dir requires a value");
        options.outputDir = resolve(next);
        index += 1;
        break;
      case "--page-size":
        if (!next) throw new Error("--page-size requires a value");
        options.pageSize = parsePositiveInt(next, "--page-size");
        index += 1;
        break;
      case "--start-page":
        if (!next) throw new Error("--start-page requires a value");
        options.startPage = parsePositiveInt(next, "--start-page");
        index += 1;
        break;
      case "--end-page":
        if (!next) throw new Error("--end-page requires a value");
        options.endPage = parsePositiveInt(next, "--end-page");
        index += 1;
        break;
      case "--delay-ms":
        if (!next) throw new Error("--delay-ms requires a value");
        options.requestDelayMs = Number(next);
        if (!Number.isInteger(options.requestDelayMs) || options.requestDelayMs < 0) {
          throw new Error(`--delay-ms must be a non-negative integer, received: ${next}`);
        }
        index += 1;
        break;
      case "--retries":
        if (!next) throw new Error("--retries requires a value");
        options.retryCount = parseNonNegativeInt(next, "--retries");
        index += 1;
        break;
      case "--timeout-ms":
        if (!next) throw new Error("--timeout-ms requires a value");
        options.timeoutMs = parsePositiveInt(next, "--timeout-ms");
        index += 1;
        break;
      case "--force":
        options.force = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.endPage < options.startPage) {
    throw new Error("--end-page must be greater than or equal to --start-page");
  }

  return options;
}

function printHelp(): void {
  console.log(`Usage: npm run crawl -- [options]

Options:
  --output-dir <dir>  Output directory (default: ./data)
  --page-size <n>     API page size (default: 100)
  --start-page <n>    First page to crawl (default: 1)
  --end-page <n>      Last page to crawl (default: 146)
  --delay-ms <n>      Delay between requests (default: 300)
  --retries <n>       Retries after the initial request (default: 3)
  --timeout-ms <n>    Request timeout (default: 30000)
  --force             Rewrite existing chunk files
  --dry-run           Print planned chunks without network requests
  --help              Show this help
`);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function getChunkRange(options: CrawlOptions, chunkIndex: number): { start: number; end: number } {
  const start = options.startPage + chunkIndex * options.chunkSize;
  const end = Math.min(start + options.chunkSize - 1, options.endPage);
  return { start, end };
}

function getChunkPath(options: CrawlOptions, start: number, end: number): string {
  const startLabel = String(start).padStart(3, "0");
  const endLabel = String(end).padStart(3, "0");
  return join(options.outputDir, `items-pages-${startLabel}-${endLabel}.json`);
}

async function fetchPage(options: CrawlOptions, page: number): Promise<ApiResponse> {
  const url = new URL(options.baseUrl);
  url.searchParams.set("q", options.query);
  url.searchParams.set("page", String(page));
  url.searchParams.set("pageSize", String(options.pageSize));

  let lastError: unknown;
  const maxAttempts = options.retryCount + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          accept: "*/*",
          "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
          "content-type": "application/json",
          referer: "https://niaoge123.com/",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || !Array.isArray((body as { items?: unknown }).items)) {
        throw new Error("API response does not contain an items array");
      }

      return body as ApiResponse;
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) break;
      const backoffMs = Math.min(10_000, 500 * 2 ** (attempt - 1));
      console.warn(`Page ${page} failed (attempt ${attempt}/${maxAttempts}); retrying in ${backoffMs}ms`);
      await sleep(backoffMs);
    } finally {
      clearTimeout(timeout);
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Failed to fetch page ${page}: ${message}`);
}

async function writeJsonAtomically(filePath: string, data: ChunkFile): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

async function isExistingChunkValid(filePath: string, pageStart: number, pageEnd: number): Promise<boolean> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return false;

    const candidate = parsed as Partial<ChunkFile>;
    const pagination = candidate.pagination;
    if (!Array.isArray(candidate.items) || !pagination) return false;

    const expectedPages = pageEnd - pageStart + 1;
    const itemCounts = pagination.pageItemCounts;
    return (
      pagination.pageStart === pageStart &&
      pagination.pageEnd === pageEnd &&
      pagination.pagesFetched === expectedPages &&
      pagination.itemsCount === candidate.items.length &&
      Array.isArray(itemCounts) &&
      itemCounts.length === expectedPages &&
      itemCounts.every((count) => count === pagination.pageSize) &&
      itemCounts.reduce((sum, count) => sum + count, 0) === candidate.items.length
    );
  } catch {
    return false;
  }
}

async function crawlChunk(options: CrawlOptions, pageStart: number, pageEnd: number): Promise<void> {
  const outputPath = getChunkPath(options, pageStart, pageEnd);

  if (!options.force && (await isExistingChunkValid(outputPath, pageStart, pageEnd))) {
    console.log(`Skipping existing chunk: ${outputPath}`);
    return;
  }

  const items: Item[] = [];
  let total: number | undefined;
  let totalPages: number | undefined;
  let me: unknown = null;
  let stats: unknown = null;
  const pageItemCounts: number[] = [];

  for (let page = pageStart; page <= pageEnd; page += 1) {
    const result = await fetchPage(options, page);
    if (result.items.length !== options.pageSize) {
      throw new Error(`Page ${page} returned ${result.items.length} items; expected ${options.pageSize}`);
    }
    items.push(...result.items);
    pageItemCounts.push(result.items.length);
    total ??= result.pagination?.total;
    totalPages ??= result.pagination?.totalPages;
    me = result.me ?? null;
    stats = result.stats ?? null;
    console.log(`Fetched page ${page}/${options.endPage}: ${result.items.length} items`);

    if (page < pageEnd && options.requestDelayMs > 0) {
      await sleep(options.requestDelayMs);
    }
  }

  const chunk: ChunkFile = {
    items,
    pagination: {
      pageStart,
      pageEnd,
      pagesFetched: pageEnd - pageStart + 1,
      pageSize: options.pageSize,
      itemsCount: items.length,
      pageItemCounts,
      total,
      totalPages,
    },
    me,
    stats,
  };

  await writeJsonAtomically(outputPath, chunk);
  console.log(`Wrote ${items.length} items to ${outputPath}`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const chunkCount = Math.ceil((options.endPage - options.startPage + 1) / options.chunkSize);

  if (options.dryRun) {
    for (let index = 0; index < chunkCount; index += 1) {
      const { start, end } = getChunkRange(options, index);
      console.log(`${start}-${end}: ${getChunkPath(options, start, end)}`);
    }
    return;
  }

  await mkdir(options.outputDir, { recursive: true });
  for (let index = 0; index < chunkCount; index += 1) {
    const { start, end } = getChunkRange(options, index);
    await crawlChunk(options, start, end);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

export { fetchPage, getChunkPath, parseArgs };
