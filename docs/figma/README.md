# Figma 展示板 · Lantern Desk

本目录是项目的**产品展示图集**，全部为可编辑矢量 SVG，专为导入 Figma 设计：所有文字、色块、线条都使用内联属性（不依赖 CSS 类），拖进 Figma 后依然是可选中、可改字、可换色的独立图层。

> 这些展示图与项目代码一样，**完全由 AI 生成**。可自由修改、商用与再分发（MIT）。

## 文件清单

| 文件 | 用途 |
| --- | --- |
| [`lantern-desk-showcase.svg`](lantern-desk-showcase.svg) | 总览展示板：7 个画板拼在一张大画布上，可一次拖进 Figma |
| [`lantern-desk-showcase.png`](lantern-desk-showcase.png) | 总览 PNG 预览，供 README / 文档直接引用 |
| [`frames/01-brand.svg`](frames/01-brand.svg) | 01 品牌与定位 |
| [`frames/02-architecture.svg`](frames/02-architecture.svg) | 02 系统架构 |
| [`frames/03-library-ui.svg`](frames/03-library-ui.svg) | 03 书库界面线框（桌面 + 手机） |
| [`frames/04-workdesk-ui.svg`](frames/04-workdesk-ui.svg) | 04 工作台界面线框（项目 / 日期 / 类型） |
| [`frames/05-reader.svg`](frames/05-reader.svg) | 05 Word / PPT / Excel 阅读器 |
| [`frames/06-design-tokens.svg`](frames/06-design-tokens.svg) | 06 色彩、字体与组件 |
| [`frames/07-security.svg`](frames/07-security.svg) | 07 内网安全边界 |
| [`preview.html`](preview.html) | 浏览器里的展示页，逐张查看画板 |
| [`build.py`](build.py) | 生成脚本，改文案 / 配色后重新导出 |

## 导入 Figma

1. 打开 <https://www.figma.com/>，新建或打开一个设计文件。
2. 任选一种方式导入：
   - **拖拽**：把 `lantern-desk-showcase.svg`（或 `frames/` 下任意单张）从文件管理器直接拖到画布；
   - **菜单**：`File → Place image…` 选择 SVG；
   - **整板**：只导 `lantern-desk-showcase.svg`，7 个画板会一起进来，再按需要拆 Frame。
3. 导入后的每个 `<g id="frame-XX">` 是一组矢量图层；选中文字即可改文案，选中色块即可换色。
4. 想改内容而不是手动挪图层，编辑 [`build.py`](build.py) 里的画板函数，然后重新生成：

   ```bash
   python docs/figma/build.py
   ```

### 重新导出 PNG 预览

仓库里的 PNG 由本机 Chrome 无头模式渲染（不需要额外依赖）：

```bash
# macOS / Linux（把路径换成自己的 Chrome）
google-chrome --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=1600,2200 \
  --screenshot=docs/figma/lantern-desk-showcase.png \
  "file://$(pwd)/docs/figma/lantern-desk-showcase.svg"
```

Windows 把可执行文件换成 `"/c/Program Files/Google/Chrome/Application/chrome.exe"`，输出路径用 Windows 绝对路径即可。

## 发布到 Figma 后把链接写进 README

如果希望 README 里有一个可点击的 **Figma 分享链接**：

1. 在 Figma 里点右上角 **Share** → 把访问权限设为 **Anyone with the link can view** → **Copy link**；
   （也可以点 **Publish to Community** 发布到 Figma Community。）
2. 把链接填到仓库根目录 `README.md` 的「Figma 设计展示」章节，替换 `FIGMA_SHARE_URL` 占位符。仓库**不会伪造一个不存在的 Figma 文件链接**。
3. 也可以直接把链接发给维护者/AI 助手，由它一次性替换。

未填写分享链接时，README 里的展示板预览与 SVG 源文件链接依然完全可用，不影响阅读或导入。
