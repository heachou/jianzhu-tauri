# 标准检索台

基于 Tauri 2 + React + TypeScript + Tailwind CSS 的本地标准数据检索应用，同时保留 TypeScript 爬虫能力。

## 桌面应用

环境要求：Node.js、Rust 工具链（`rustc`/`cargo`）和 Tauri 系统依赖。

```bash
npm install
npm run tauri:dev
```

构建安装包：

```bash
npm run tauri:build
```

应用支持按名称或编码查询，并展示名称、编码、实施时间、发布时间、标准级别、标准系列、状态和下载链接。Tauri 桌面端通过 Rust IPC 读取 `data/items-pages-*.json`；直接运行 `npm run dev` 时使用浏览器回退读取同一目录，便于前端开发预览。`data/manifest.json` 记录分片清单，新增数据分片时同步更新该文件即可。

## GitHub Actions 打包

工作流位于 `.github/workflows/release.yml`：

- `workflow_dispatch`：手动触发，构建 Windows x64 和 macOS Apple Silicon，并上传 Actions 工件
- 推送 `v*` 标签：构建并创建 Draft GitHub Release，上传 Windows NSIS/MSI 和 macOS DMG

发布示例：

```bash
git tag v0.1.0
git push origin v0.1.0
```

Windows 安装包会生成 `.exe` 和 `.msi`；macOS Apple Silicon 会生成 `.dmg`。标签发布需要 `contents: write` 权限。

如果出现 `Resource not accessible by integration`：

1. 打开仓库 `Settings → Actions → General`。
2. 在 `Workflow permissions` 中选择 `Read and write permissions`，保存后重新运行工作流。
3. 如果组织策略禁止 `GITHUB_TOKEN` 创建 Release，创建一个具备仓库 `Contents: Read and write` 权限的 Fine-grained PAT，并在仓库 `Settings → Secrets and variables → Actions` 中保存为 `RELEASE_TOKEN`。工作流会优先使用该 Secret。

## 数据爬虫

使用 TypeScript 顺序抓取 `https://niaoge123.com/api/items` 的前 146 页，并按每 10 页写入一个 JSON 文件。

## 环境要求

- Node.js 18 或更高版本（需要内置 `fetch`）
- npm

## 安装与运行

```bash
npm install
npm run crawl
```

默认行为：

- 请求 `page=1..146`，每页 `pageSize=100`
- 输出到 `data/`
- 生成 15 个文件：`items-pages-001-010.json` 到 `items-pages-141-146.json`
- 每个文件聚合该页范围内的 `items`，并保留页码范围、总量、总页数等分页信息
- 已经完整写入的分片会自动跳过，支持中断后重新运行
- 请求失败最多在初始请求后重试 3 次，并在请求之间等待 300ms
- 分片会校验页码、页数、每页条数和总条数；前 146 页每页必须返回 100 条，残缺或异常页会重新抓取而不会被缓存

## 常用参数

```bash
# 查看将要生成的分片，不请求接口
npm run crawl:dry-run

# 强制重新抓取并覆盖已有分片
npm run crawl -- --force

# 自定义输出目录、请求间隔和范围
npm run crawl -- --output-dir ./output --delay-ms 500 --start-page 1 --end-page 146
```

## 输出格式

每个文件是一个 JSON 对象：

```json
{
  "items": [],
  "pagination": {
    "pageStart": 1,
    "pageEnd": 10,
    "pagesFetched": 10,
    "pageSize": 100,
    "itemsCount": 1000,
    "pageItemCounts": [100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
    "total": 262048,
    "totalPages": 87350
  },
  "me": null,
  "stats": null
}
```

脚本使用临时文件写入后再原子重命名，避免进程中断时留下看似完整的 JSON 文件。请遵守目标站点的使用条款、访问频率限制和适用法律法规。
