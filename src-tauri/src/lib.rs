use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchRequest {
    query: String,
    field: String,
    page: usize,
    page_size: usize,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchResponse {
    items: Vec<Value>,
    total: usize,
    page: usize,
    page_size: usize,
    total_pages: usize,
}

fn contains_data_files(path: &Path) -> bool {
    fs::read_dir(path)
        .map(|entries| {
            entries.flatten().any(|entry| {
                entry.path().is_file()
                    && entry
                        .file_name()
                        .to_str()
                        .is_some_and(|name| name.starts_with("items-pages-") && name.ends_with(".json"))
            })
        })
        .unwrap_or(false)
}

fn data_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("data"));
        candidates.push(resource_dir.join("_up_").join("data"));
        candidates.push(resource_dir);
    }
    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(current_dir.join("data"));
    }
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../data"));

    candidates
        .into_iter()
        .find(|path| contains_data_files(path))
        .ok_or_else(|| "找不到 data 目录或 items-pages-*.json 文件，请确认数据资源已正确打包。".to_string())
}

fn load_items(data_dir: &Path) -> Result<Vec<Value>, String> {
    let mut files = fs::read_dir(data_dir)
        .map_err(|error| format!("读取数据目录失败：{error}"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension().and_then(|extension| extension.to_str()) == Some("json")
                && path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with("items-pages-"))
        })
        .collect::<Vec<_>>();
    files.sort();

    if files.is_empty() {
        return Err("data 目录中没有找到 items-pages-*.json 文件。".to_string());
    }

    let mut items = Vec::new();
    for file in files {
        let content = fs::read_to_string(&file)
            .map_err(|error| format!("读取 {} 失败：{error}", file.display()))?;
        let chunk: Value = serde_json::from_str(&content)
            .map_err(|error| format!("解析 {} 失败：{error}", file.display()))?;
        let chunk_items = chunk
            .get("items")
            .and_then(Value::as_array)
            .ok_or_else(|| format!("{} 缺少 items 数组。", file.display()))?;
        items.extend(chunk_items.iter().cloned());
    }

    Ok(items)
}

#[tauri::command]
fn search_items(app: AppHandle, request: SearchRequest) -> Result<SearchResponse, String> {
    let query = request.query.trim().to_lowercase();
    let page_size = request.page_size.clamp(1, 100);
    let page = request.page.max(1);
    let items = load_items(&data_directory(&app)?)?;

    let mut filtered = items
        .into_iter()
        .filter(|item| {
            if query.is_empty() {
                return true;
            }

            let name = item.get("name").and_then(Value::as_str).unwrap_or_default();
            let code = item.get("code").and_then(Value::as_str).unwrap_or_default();
            match request.field.as_str() {
                "name" => name.to_lowercase().contains(&query),
                "code" => code.to_lowercase().contains(&query),
                _ => name.to_lowercase().contains(&query) || code.to_lowercase().contains(&query),
            }
        })
        .collect::<Vec<_>>();

    let total = filtered.len();
    let total_pages = total.div_ceil(page_size).max(1);
    let start = (page - 1).saturating_mul(page_size).min(total);
    let end = (start + page_size).min(total);
    let page_items = filtered.drain(start..end).collect::<Vec<_>>();

    Ok(SearchResponse {
        items: page_items,
        total,
        page,
        page_size,
        total_pages,
    })
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![search_items])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}
