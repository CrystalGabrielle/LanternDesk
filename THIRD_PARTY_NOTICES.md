# 第三方组件声明

「灯下 · Lantern Desk」本身采用 [MIT License](LICENSE)。本项目**完全由 AI 生成**（含 OOXML 解析引擎与展示图）。为了做到**容器内零 npm 依赖、完全离线可用**，仓库内置了以下上游发行文件（未做源码修改），它们的版权归各自作者所有。

| 组件 | 版本 | 用途 | 许可证 | 随仓库附带的文件 |
| --- | --- | --- | --- | --- |
| [PDF.js](https://github.com/mozilla/pdf.js)（`pdfjs-dist`） | 3.11.174 | 网页内渲染 PDF、生成首页封面 | Apache License 2.0 | `public/vendor/pdf.js`、`public/vendor/pdf.worker.js`、`public/vendor/cmaps/*`、`public/vendor/standard_fonts/*` |
| [JSZip](https://github.com/Stuk/jszip) | 3.10.2 | 解析 EPUB / DOCX / PPTX / XLSX 的 ZIP 容器 | MIT 或 GPLv3（双许可，本项目按 **MIT** 条款使用） | `public/vendor/jszip.min.js` |
| [Node.js](https://nodejs.org/) | 22 LTS | 容器基础镜像 `node:22-bookworm-slim`、内置 `node:sqlite` | MIT（及依赖组件的各自许可） | 仅作为基础镜像引用，不随仓库分发 |

## 说明

- `public/vendor/cmaps/` 与 `public/vendor/standard_fonts/` 是 `pdfjs-dist` 发行包中随附的字符映射与标准字体数据，用于正确显示中日韩（CJK）PDF。仓库内保留了上游随附的许可证文本：`public/vendor/cmaps/LICENSE`、`public/vendor/standard_fonts/LICENSE_FOXIT`、`public/vendor/standard_fonts/LICENSE_LIBERATION`，请以这些文件与上游仓库的声明为准。
- `.gitattributes` 把 `.bcmap` / `.pfb` / `.ttf` 等文件标记为二进制，避免跨平台 checkout 时损坏字体与 CMap 数据。
- 上述文件均从 npm 官方 registry 的官方 tarball 中提取，保留原样，未包含任何修改版代码。
- 本项目**不**使用 CDN、外部字体或在线脚本；浏览器加载的资源全部来自容器内的 `public/`。
- **Office 预览没有引入新依赖**：`public/office.js`（浏览器端 OOXML → HTML）与 `server/work.js` 中的 ZIP 中央目录读取都是本项目自研代码，只复用上表已内置的 JSZip 与 Node 内置 `zlib`。Word / PPT / Excel 文件在浏览器本地解析，**不经过任何在线转换服务**。
- [Figma 展示板](docs/figma/README.md)（`docs/figma/`）同样由 AI 生成，为项目原创矢量图，采用 MIT 许可，不含第三方素材。
- 若你升级这些库，请同时更新本表，并确认新版许可证与发行文件结构（尤其是 PDF.js 的 `legacy/build/` 路径与 cMap 资源）。

## 许可证文本

完整的许可证文本请见：

- Apache-2.0：https://www.apache.org/licenses/LICENSE-2.0
- MIT（JSZip / Node.js）：https://opensource.org/license/mit
- GPLv3（JSZip 的另一可选许可）：https://www.gnu.org/licenses/gpl-3.0.html

如需在分发版本中附带完整许可证文本，请从上游仓库获取对应版本的 `LICENSE` 文件一并打包。
