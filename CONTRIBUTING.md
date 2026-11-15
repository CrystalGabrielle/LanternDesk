# 贡献指南

感谢你愿意改进「灯下 · Lantern Desk」！无论是修 bug、补文档、加格式支持，还是分享自己的部署经验，都欢迎。

## 先读这几条设计原则

这个项目的价值来自几个刻意的取舍，提交 PR 前请确认没有破坏它们：

1. **原文件零搬移** —— 不移动、不重命名、不复制、不删除用户资料。整理只在索引层发生；删除图书默认只是 `hidden=1`。
2. **仅内网** —— 不引入公网入口、穿透、DDNS、遥测、外部 CDN，也不假设有账号体系。
3. **零 npm 运行时依赖** —— 容器里 `COPY` 完就能跑，不执行 `npm install`。前端是原生 JS，PDF.js / JSZip 已内置在 `public/vendor/`。
4. **离线可用** —— 除用户主动配置 AI Key 后的问答请求，不应产生任何外连。
5. **数据安全** —— 静态资源与文件接口必须做路径穿越校验；API Key 等敏感信息不得回传明文，也不得写进日志。

如果新功能与上述原则冲突（例如「同步到云端」「公网分享链接」），建议先开 Issue 讨论，或以可选插件的形式实现。

## 开发环境

```bash
git clone https://github.com/CrystalGabrielle/LanternDesk.git
cd lantern-desk
cp .env.example .env
mkdir -p /tmp/ll-dev/books/小说 /tmp/ll-dev/data /tmp/ll-dev/public
echo "第一章 测试内容" > "/tmp/ll-dev/books/小说/样例.txt"

PORT=18090 DATA_DIR=/tmp/ll-dev/data \
BOOKS_ROOT=/tmp/ll-dev/books PUBLIC_ROOT=/tmp/ll-dev/public \
node --experimental-sqlite server/index.js
```

打开 `http://127.0.0.1:18090`。前端没有构建步骤，改完刷新浏览器；后端改动需重启进程。

代码分布：

| 文件 | 职责 |
| --- | --- |
| `server/core.js` | SQLite 表结构、迁移、分类规则、增量扫描、默认书架、分类镜像 |
| `server/tree.js` | 目录前缀树、套书识别、自然排序、自动展开 |
| `server/covers.js` | 封面解析、缓存、SVG 文字封面 |
| `server/index.js` | 路由、内网校验、口令、导入、AI 代理、静态资源 |
| `public/app.js` | 前端状态、层级视图、阅读器、书架、书签、AI 侧栏、封面队列 |
| `public/style.css` | 全部样式与响应式断点 |
| `public/vendor/` | 上游发行文件，**请勿手工修改** |

## 提交前自检

```bash
# 1. JS 语法
for f in server/*.js public/app.js; do node --check "$f"; done

# 2. 不提交私有配置
git status --short          # 不应出现 .env / data/ / *.db / 截图

# 3. 起一个最小实例，手工验证核心路径
curl -s http://127.0.0.1:18090/api/state
curl -s http://127.0.0.1:18090/api/tree
```

建议至少覆盖：扫描（新增/删除文件）、层级浏览、书架 CRUD、进度读写、书签、导入、封面、AI 配置脱敏。接口清单与示例见 [docs/API.md](docs/API.md)。

CI 会在 PR 时自动执行语法检查、私有配置检查、SVG/XML 校验和 Docker 构建。

## 提交与 PR

- 提交信息建议使用 Conventional Commits：`feat: ...`、`fix: ...`、`docs: ...`、`refactor: ...`、`chore: ...`。
- 一个 PR 聚焦一件事；改动 UI 时请附桌面与窄屏（约 600px）截图。
- 涉及数据库结构时，必须写**幂等的迁移**（参考 `core.js` 里 `PRAGMA table_info` + `ALTER TABLE` 的写法），保证老用户 `docker compose up -d --build` 后不丢数据。
- 涉及配置时，同步更新 `.env.example`、README 的配置表与 `docs/DEPLOYMENT.md`。
- 涉及新增第三方库时，更新 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)，并说明为什么不能在容器内用 npm 安装。

## 报告问题

- 普通 bug / 功能建议：开 Issue，尽量附上环境（Docker / 群晖 / 直跑 Node）、浏览器、复现步骤与容器日志。
- **安全漏洞不要在公开 Issue 里发**，请按 [SECURITY.md](SECURITY.md) 的方式私下报告。

## 行为约定

保持友善、就事论事；尊重维护者与他人的时间。维护者保留为符合上述设计原则而调整或拒绝 PR 的权利。
