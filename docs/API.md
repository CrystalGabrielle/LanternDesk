# API 文档

「灯下 · Lantern Desk」的所有接口都是同源的 `/api/*` JSON（少数为二进制流），无需 SDK。本文面向想做二次开发、自动化脚本或排查问题的用户。本项目完全由 AI 生成，接口以源码与本文为准。

## 通用约定

| 项目 | 说明 |
| --- | --- |
| 基地址 | `http://<HOST_IP>:<PORT>`，例如 `http://192.168.1.10:8090` |
| 内网校验 | 来源 IP 不在私有网段时一律 `403 {"error":"本站点仅供局域网访问"}` |
| 访问口令 | 若在设置里启用了口令，除 `/api/health`、`/api/login` 外都要求 `ll_token` Cookie；未通过返回 `401 {"error":"需要访问口令","needAuth":true}` |
| 认证方式 | `POST /api/login` 成功后服务端下发 `HttpOnly; SameSite=Lax` Cookie，浏览器自动携带 |
| 请求体 | JSON 接口使用 `Content-Type: application/json`；上传/封面回传为二进制 |
| 错误格式 | `{ "error": "描述", ... }`，HTTP 状态码见下表 |
| 时间 | 毫秒 Unix 时间戳 |
| 文件读取 | `/api/raw/:id` 支持 HTTP `Range`，PDF.js / 音视频播放器依赖它 |

常见状态码：`200` 成功、`400` 参数错误、`401` 需要口令、`403` 非内网或禁止物理删除、`404` 不存在、`413` 请求体过大、`415` 不支持纯文本提取、`502` AI 上游错误。

---

## 数据模型

`book` 对象的主要字段（列表与详情共有）：

```json
{
  "id": 42,
  "path": "小说/克苏鲁/超越时空之影/第03回.pdf",
  "filename": "第03回.pdf",
  "title": "第03回",
  "ext": "pdf",
  "format": "PDF",
  "kind": "ebook",
  "size": 12345678,
  "category": "小说文学",
  "subcategory": "克苏鲁",
  "tags": ["小说文学", "克苏鲁", "PDF"],
  "author": "",
  "dir_path": "小说/克苏鲁/超越时空之影",
  "top_folder": "小说",
  "imported": 0,
  "is_asset": 0,
  "hidden": 0,
  "missing": 0,
  "percent": 42.5,
  "marks": 1,
  "covered": 1,
  "shelves": [{ "id": 1, "name": "小说文学", "color": "#6366f1" }]
}
```

- `is_asset=1`：识别为封面素材的图片，不计入书库数量，但可作为同目录书籍的封面。
- `hidden=1`：已移出图书馆（磁盘文件仍在）。`missing=1`：磁盘上已找不到（扫描时标记，不删记录）。
- `imported=1`：从网页导入的书，是唯一允许物理删除的类型。
- `covered=1`：已有持久化的真实封面缓存。

`locator` 是阅读位置，不同阅读器格式不同：

```json
{ "type": "pdf", "page": 3 }
{ "type": "epub", "idx": 2 }
{ "type": "text", "idx": 5 }
```

---

## 系统状态

### `GET /api/health`

无需口令。返回 `{ "ok": true, "ts": 1731660000000 }`，供容器 HEALTHCHECK 使用。

### `GET /api/state`

```json
{
  "total": 6211, "shelves": 6, "marks": 3, "reading": 12,
  "scan": { "added": 0, "updated": 0, "missing": 0, "total": 6211, "duration_ms": 812 },
  "lastScanAt": 1731660000000, "intervalMin": 10,
  "authEnabled": false, "authenticated": true,
  "ai": { "provider": "deepseek", "baseUrl": "...", "model": "...", "enabled": true, "hasKey": false, "keyHint": "" },
  "mirrorBuiltAt": 1731660000000, "mirrorCount": 6211, "covers": 10
}
```

### `GET /api/facets`

返回 `categories / kinds / formats / subcategories` 四个数组，元素形如 `{ "k": "计算机", "n": 545 }`，用于侧栏筛选。

---

## 目录层级

### `GET /api/tree`

默认视图的数据源。筛选参数与 `/api/books` 完全一致：

| 参数 | 说明 |
| --- | --- |
| `path` | 当前目录（相对资料根目录，用 `/` 分隔，如 `小说/克苏鲁`）；为空表示根 |
| `drill` | `0` 表示停在当前层，不自动展开单链空目录；默认开启自动展开 |
| `q` / `category` / `subcategory` / `kind` / `format` / `shelf` / `reading` / `favorite` | 与平铺列表相同，树只包含命中的书 |
| `page` / `size` | 本层直属图书分页，`size` 最大 200 |

响应：

```json
{
  "path": "小说/克苏鲁",
  "drilled": true,
  "crumbs": [{ "name": "全部藏书", "path": "" }, { "name": "小说", "path": "小说" }],
  "dirs": [
    { "name": "超越时空之影", "path": "小说/克苏鲁/超越时空之影", "count": 9, "direct": 9, "series": true, "coverId": 42 }
  ],
  "books": [],
  "booksTotal": 0,
  "series": {
    "name": "超越时空之影", "count": 9, "coverId": 41,
    "chapters": [{ "id": 42, "title": "第01回", "chapter": 1 }]
  },
  "coverId": 41,
  "total": 52, "page": 1, "size": 60
}
```

- `dirs[].series=true` 表示该目录是序号型分册集合，前端渲染成套书卡片。
- 当**当前目录本身**就是套书时，`series` 非空且 `books` 为空，章节按自然序放在 `series.chapters`。
- `crumbs` 是面包屑；`drilled=true` 表示后端自动跳过了中间的空目录层。

---

## 图书

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/books` | 平铺列表。参数：`page`(默认1)、`size`(默认60，最大200)、`sort`(`recent/title/size/reading/progress`)、`q`、`category`、`subcategory`、`kind`、`format`、`shelf`、`reading`、`favorite`。返回 `{ total, page, size, books }` |
| GET | `/api/books/:id` | 详情，含完整 `shelves` 与 `progress` |
| PATCH | `/api/books/:id` | 可改 `title / author / category / subcategory / tags / shelves`（`shelves` 是书架 id 数组，会整体替换） |
| DELETE | `/api/books/:id` | 默认 `hidden=1` 移出图书馆，**保留磁盘文件** |
| DELETE | `/api/books/:id?purge=1` | 需请求体 `{ "confirm": "DELETE" }`；仅 `imported=1` 的书允许，原始资料返回 403 |
| POST | `/api/books/:id/restore` | 恢复被移出的书 |
| GET | `/api/raw/:id` | 原文件字节流，支持 Range；路径经过前缀校验，不能越界读取 |
| GET | `/api/download/:id` | 以附件形式下载 |
| GET | `/api/text/:id` | 纯文本提取（TXT/MD/CSV/MHT/HTML 自动识别 UTF-8 / GB18030；MOBI/AZW 解 PalmDOC）；不支持时 415 |
| GET | `/api/cover/:id` | 封面：真实图片或 SVG 文字兜底；缺失时前端会异步补 PDF 首页 |
| POST | `/api/cover/:id` | 上传浏览器渲染的封面图（JPEG/PNG/WebP，最大 6 MB），持久化到 `DATA_DIR/covers/` |
| GET | `/api/cover/folder?name=...&count=...` | 文件夹卡片的 SVG 封面（无需图书 id） |

示例：

```bash
curl "http://192.168.1.10:8090/api/books?kind=ebook&category=%E5%B0%8F%E8%AF%B4%E6%96%87%E5%AD%A6&size=20"
curl -X PATCH "http://192.168.1.10:8090/api/books/42" \
  -H 'Content-Type: application/json' -d '{"title":"第03回·修订","shelves":[1,3]}'
curl -H 'Range: bytes=0-65535' "http://192.168.1.10:8090/api/raw/42" -o head.bin
```

---

## 书架

| 方法 | 路径 | 请求体 / 说明 |
| --- | --- | --- |
| GET | `/api/shelves` | 返回 `{ shelves: [...] }`，每项含 `count`（当前有效图书数） |
| POST | `/api/shelves` | `{ name, description?, color?, icon?, sort_order? }`；`name` 唯一 |
| PATCH | `/api/shelves/:id` | 可改 `name / description / color / icon / sort_order` |
| DELETE | `/api/shelves/:id` | 删除书架（不会删除书或文件） |
| POST | `/api/shelves/:id/books` | `{ "bookIds": [1,2,3] }` 批量加入 |
| DELETE | `/api/shelves/:id/books/:bookId` | 从书架移除一本书 |

默认书架由 `core.js` 的 `ensureDefaultShelves()` 按顶层文件夹生成，`auto_from` 字段记录来源文件夹。调整归属只改 `book_shelves` 关联表，不改文件位置。

---

## 阅读进度与书签

### `GET/PUT /api/progress/:id`

```bash
curl -X PUT "http://192.168.1.10:8090/api/progress/42" \
  -H 'Content-Type: application/json' \
  -d '{"locator":{"type":"pdf","page":3},"percent":42.5,"device":"书房 PC"}'
```

`GET` 返回 `{ book_id, locator, percent, device, updated_at }`；没有记录时返回 `{ "percent": 0, "locator": "{}" }`。进度以 `book_id` 为主键，多设备共享。

### 书签

| 方法 | 路径 | 请求体 |
| --- | --- | --- |
| GET | `/api/bookmarks?bookId=42` | 返回 `{ bookmarks: [...] }`，`locator` 已解析成对象 |
| POST | `/api/bookmarks` | `{ bookId, label, note?, locator }` → `{ id }` |
| PATCH | `/api/bookmarks/:id` | `{ label?, note?, locator? }` |
| DELETE | `/api/bookmarks/:id` | 删除 |

---

## 扫描、整理与导入

### `POST /api/scan`

立即执行一次增量扫描，返回：

```json
{ "added": 1, "updated": 0, "missing": 1, "total": 6211, "duration_ms": 812 }
```

`missing` 只表示磁盘上找不到的文件被标记 `missing=1`，**不会删除任何磁盘文件**。响应还包含 `work` 字段：`{ added, updated, missing, total }`，即同一次扫描里工作台的变化。

### `GET /api/scan/status`

返回最近一次扫描结果、`intervalMin` 与 `history`（最近 10 条 `scan_log`）。

### `POST /api/organize/materialize`

生成 / 重建分类镜像硬链接：

```json
{
  "root": "/lanpublic/_图书馆分类",
  "linked": 6211, "skipped": 0, "failed": 0, "removed": 0,
  "total": 6211, "layout": "按分类 → 原始目录层级"
}
```

`removed` 是清理掉的旧链接数；清理前会校验 inode 与源书一致，确保只删本系统生成的硬链接。资料与镜像必须位于同一挂载点，否则 `failed` 会增多（报 `EXDEV`）。

### `POST /api/import`

自定义二进制上传（无 multipart 依赖）：

```bash
curl -X POST "http://192.168.1.10:8090/api/import" \
  -H 'Content-Type: application/octet-stream' \
  -H 'x-file-name: %E6%96%B0%E4%B9%A6.txt' \
  --data-binary @新书.txt
```

- `x-file-name` 必须是 **URL 编码**后的文件名；服务端会 `basename` 并过滤非法字符。
- 文件落到 `BOOKS_ROOT/_导入图书/<分类>/<主题>/`，同名自动加时间戳后缀，不会覆盖。
- 上传临时文件与目标文件位于同一目录，避免跨挂载点 `rename` 失败。
- 返回 `{ ok, filename, category, subcategory, book, scan }`。

---

## 工作台：工作文件智能整理

工作台与书库使用**独立的目录与独立的 SQLite 表**：工作文件根目录是 `${PUBLIC_ROOT}/${WORK_DIR}`（默认 `_工作文件`），不在 `BOOKS_ROOT` 内，所以不会把书混进工作台，也不会把工作文档索引成书。

### 数据模型

`work_files` 的主要字段：

| 字段 | 说明 |
| --- | --- |
| `id` / `root` / `path` | 主键；`root=work` 表示相对工作目录，`root=books` 表示从书库「加入工作台」的引用 |
| `filename` / `title` / `ext` / `size` / `mtime` | 文件基本信息 |
| `project` / `project_source` | 所属项目与识别来源（文件名标记 / 项目库匹配 / 目录推断 / 文件名推断 / 手动指定 / AI 识别 / 待确认） |
| `doc_date` / `date_source` | 业务日期 `YYYY-MM-DD` 与来源（文件名 / 文档属性 / 修改时间 / 手动指定 / AI 识别） |
| `doc_type` | 会议纪要、方案 / 规划、预算 / 财务、数据 / 报表… |
| `tags` / `note` / `status` / `pinned` | 标签（JSON 数组）、备注、状态（待整理 / 进行中 / 已归档）、置顶 |
| `snippet` | 从 OOXML 提取的内容摘录，用于项目匹配与 AI 归档 |
| `locked` | 用户手动修改过的字段列表（逗号分隔），扫描与重跑规则都不会覆盖 |
| `source` / `book_id` / `missing` / `hidden` | `work` 或 `adopted`；加入工作台时关联的图书 id；失效 / 移出标记 |

`work_projects` 存项目名称、颜色与说明；项目名会加入「项目库」，后续导入时命中即自动归档。

### `GET /api/work/files`

查询参数：`project`、`month`（`YYYY-MM`）、`type`、`status`、`q`（标题 / 文件名 / 标签 / 备注 / 项目 / 内容摘录）、`page`、`size`（默认 100，最大 200）、`sort`（`date` / `name` / `size`）。

```json
{
  "total": 3, "page": 1, "size": 100,
  "files": [{
    "id": 1, "root": "work", "path": "星海项目/2026/2026-05/需求评审.docx",
    "filename": "需求评审.docx", "title": "需求评审", "ext": "docx",
    "project": "星海项目", "project_source": "文件名标记",
    "doc_date": "2026-05-12", "date_source": "文件名", "doc_type": "方案 / 规划",
    "tags": ["星海项目", "2026", "2026-05", "方案 / 规划", "DOCX"],
    "note": "", "status": "待整理", "pinned": 0, "locked": [],
    "month": "2026-05", "year": "2026", "size": 18432, "mtime": 1778550000000
  }]
}
```

### `GET /api/work/facets`

返回 `projects`、`months`、`types`、`formats`、`statuses` 聚合，以及 `total` / `pending`（待整理）/ `unassigned`（未归档）计数。`GET /api/state` 的 `work` 字段同样包含这些统计。

### `GET/PATCH/DELETE /api/work/files/:id`

- `PATCH` 可改 `project`、`doc_date`、`doc_type`、`status`、`note`、`pinned`、`tags`、`title`。修改 `project` / `doc_date` / `doc_type` 会写入 `locked` 并把来源改为「手动指定」。
- `DELETE` 只把 `hidden` 置 1（原文件保留）；`POST /api/work/files/:id/restore` 恢复。

```bash
curl -X PATCH "$BASE/api/work/files/1" -H 'Content-Type: application/json' \
  -d '{"project":"官网改版","doc_date":"2026-06-01","status":"已归档","note":"评审通过"}'
```

### `GET/POST/PATCH/DELETE /api/work/projects...`

- `GET /api/work/projects` → `{ projects: [{ id, name, color, description, count }] }`
- `POST /api/work/projects` → `{ name, color?, description? }`
- `PATCH /api/work/projects/:id` → 改名会同步更新该项目下所有文件的 `project`
- `DELETE /api/work/projects/:id` → 删除项目定义，文件改回「未归档」，**不删文件**

### `POST /api/work/import`

与 `/api/import` 同样的二进制上传协议（`x-file-name` 为 URL 编码文件名）。服务端先写同挂载点临时文件，再综合**文件名标记 → 项目库 → 目录名 → 文件名首段 / 文件名日期 → OOXML 文档属性 → 文件修改时间**识别，归档到 `_工作文件/<项目>/<年>/<年-月>/<文件名>`，随后把结果写入索引并触发一次全量同步。

```bash
curl -X POST "$BASE/api/work/import" \
  -H 'Content-Type: application/octet-stream' \
  -H 'x-file-name: %E9%A2%84%E7%AE%97%E8%A1%A8.xlsx' \
  --data-binary @预算表.xlsx
```

```json
{
  "ok": true, "filename": "预算表.xlsx",
  "project": "星海项目", "project_source": "项目库匹配",
  "doc_date": "2026-07-01", "date_source": "文件名（年月）",
  "doc_type": "预算 / 财务", "file": { "...": "work_files 行" },
  "scan": { "added": 0, "updated": 0, "missing": 0, "total": 6211, "work": { "added": 1 } }
}
```

> 导入响应里的项目 / 日期与数据库记录**始终一致**：预识别结果会先落库，避免随后的全量扫描按归档目录名重新推断。

### `POST /api/work/adopt`

`{ "bookId": 42 }`：把书库里已有的文档加入工作台（只新增一条索引引用，原文件位置不变），同样执行项目 / 日期识别。

### `POST /api/work/reclassify` / `POST /api/work/ai-classify`

- `reclassify`：请求体 `{ ids?: number[] }`，不带 ids 时按离线规则重跑最近 200 条；尊重 `locked`。
- `ai-classify`：请求体 `{ ids?: number[] }`，默认挑选「未归档」或「日期来自修改时间」的最多 20 条，用设置里配置的 AI 账户（OpenAI 兼容 `/chat/completions`）批量推断项目 / 日期 / 类型 / 备注，返回 `{ changed, total, model }`。**未配置 API Key 时返回 400**，离线规则不受影响。

### `POST /api/work/organize`

生成 / 重建 `_工作台分类/<项目>/<年-月>/<类型>/` 硬链接镜像，返回 `{ root, linked, skipped, failed, removed, total, layout }`。清理旧链接前也会校验 inode。

### `GET /api/work/raw/:id` `/api/work/text/:id` `/api/work/download/:id`

工作文件的原文件（支持 Range）、纯文本（旧版 Office 文本提取或 OOXML 全文兜底）、附件下载。前端阅读器对没有 `book_id` 的工作文件用**负数 id** 复用同一套进度 / 书签 / AI 历史接口，不会与图书主键冲突。

---

## 设置、AI 与访问口令

### `GET/PUT /api/settings/ai`

`PUT` 可写 `provider / baseUrl / model / enabled / apiKey`，或 `{ "clearKey": true }` 清空。**`GET` 永远不返回明文 Key**，只有 `hasKey` 与 `keyHint`（后 4 位）。

```json
{
  "provider": "doubao",
  "baseUrl": "https://ark.cn-beijing.volces.com/api/v3",
  "model": "doubao-pro-32k",
  "enabled": true, "apiKey": "", "hasKey": true, "keyHint": "••••••••1234"
}
```

`baseUrl` 是任意 OpenAI 兼容服务的根地址，服务端会拼上 `/chat/completions`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/ai/test` | 发送一条测试消息验证连通性 |
| POST | `/api/ai/chat` | 请求体 `{ bookId?, question, context?, history? }`，返回 `text/event-stream` 流式数据（透传上游 SSE），同时把问答写入 `ai_messages` |
| GET | `/api/ai/history?bookId=42` | 最近 40 条会话 |
| DELETE | `/api/ai/history?bookId=42` | 清空会话（不带参数则清空全部） |

### `POST /api/login`

请求体 `{ "pin": "1234" }`，成功下发 Cookie。未启用口令时直接返回 `{ "ok": true }`。

### `PUT /api/settings/pin`

`{ "pin": "1234" }` 启用/修改口令，`{ "pin": "" }` 关闭。口令使用 scrypt 加盐哈希存储，不保存明文。

---

## 一个完整的自动化示例

```bash
BASE=http://192.168.1.10:8090

# 1. 同步磁盘变化
curl -X POST "$BASE/api/scan"

# 2. 找出所有未读完的 PDF
curl "$BASE/api/books?kind=ebook&format=PDF&reading=1&size=200" | python -m json.tool

# 3. 新建书架并放入一本书
SID=$(curl -s -X POST "$BASE/api/shelves" -H 'Content-Type: application/json' \
      -d '{"name":"周末阅读","color":"#f59e0b"}' | python -c 'import sys,json;print(json.load(sys.stdin)["id"])')
curl -X POST "$BASE/api/shelves/$SID/books" -H 'Content-Type: application/json' -d '{"bookIds":[42]}'

# 4. 重建两套分类镜像
curl -X POST "$BASE/api/organize/materialize"
curl -X POST "$BASE/api/work/organize"

# 5. 导入一份工作文件，看自动识别的项目 / 日期 / 类型
curl -s -X POST "$BASE/api/work/import" \
  -H 'Content-Type: application/octet-stream' \
  -H 'x-file-name: report.docx' --data-binary @report.docx | python -m json.tool
curl "$BASE/api/work/files?project=星海项目&sort=date" | python -m json.tool
```

> 所有接口均为局域网内部使用而设计，不含限流、CSRF token 与多租户隔离；请勿暴露到公网。
