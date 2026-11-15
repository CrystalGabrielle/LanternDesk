#!/usr/bin/env python3
"""生成 Figma 展示板：一个总览 SVG + 可逐张拖进 Figma 的独立画板 SVG。

所有文字与形状都使用「内联属性」而不是 CSS 类，这样 SVG 导入 Figma 后
每个图层仍然是可编辑的矢量对象（文字可改、色块可换色、画板可复用）。

    python docs/figma/build.py

输出：lantern-desk-showcase.svg、frames/*.svg
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
FRAMES_DIR = os.path.join(HERE, 'frames')
os.makedirs(FRAMES_DIR, exist_ok=True)

BG, CARD, BORDER = '#F5F6FA', '#FFFFFF', '#E3E6F0'
TEXT, TEXT2, TEXT3 = '#1C2030', '#6A7185', '#9AA1B3'
PRIMARY, SOFT = '#5B5BD6', '#ECECFC'
GREEN, AMBER, ROSE, SKY, PURPLE, TEAL = '#16A34A', '#D97706', '#E11D48', '#0284C7', '#8B5CF6', '#14B8A6'
FONT = 'Microsoft YaHei, PingFang SC, Arial, sans-serif'


def esc(s):
    return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def t(x, y, s, size=13, color=TEXT, weight=400, anchor='start', opacity=None):
    op = f' opacity="{opacity}"' if opacity else ''
    return (f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" '
            f'font-weight="{weight}" fill="{color}" text-anchor="{anchor}"{op}>{esc(s)}</text>')


def r(x, y, w, h, fill=CARD, rx=10, stroke=BORDER, sw=1, opacity=None, dash=None):
    op = f' opacity="{opacity}"' if opacity else ''
    st = '' if stroke == 'none' else f' stroke="{stroke}" stroke-width="{sw}"'
    da = f' stroke-dasharray="{dash}"' if dash else ''
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"{st}{da}{op}/>'


def ln(x1, y1, x2, y2, color=BORDER, sw=1.5, dash=None):
    da = f' stroke-dasharray="{dash}"' if dash else ''
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{sw}"{da}/>'


def arrow(x1, y1, x2, y2, color=PRIMARY, sw=1.6, dash=None):
    da = f' stroke-dasharray="{dash}"' if dash else ''
    return (f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{sw}"{da} '
            f'marker-end="url(#arrowhead)"/>')


def pill(x, y, w, label, fill=SOFT, color=PRIMARY, size=11, h=26):
    return r(x, y, w, h, fill=fill, rx=13, stroke='none') + t(x + w / 2, y + 17, label, size, color, 600, 'middle')


def card(x, y, w, h, color=PRIMARY, label='', sub=''):
    s = [r(x, y, w, h, fill=CARD, rx=10)]
    s.append(r(x + 10, y + 10, w - 20, h * .62, fill=color, rx=7, stroke='none', opacity='.85'))
    s.append(r(x + 10, y + h * .68, w * .7, 7, fill=BORDER, rx=3, stroke='none'))
    s.append(r(x + 10, y + h * .68 + 13, w * .45, 6, fill=BORDER, rx=3, stroke='none'))
    if label:
        s.append(t(x + w / 2, y + h * .62 + 4, label, 10, '#FFFFFF', 700, 'middle'))
    return ''.join(s)


def defs():
    return f'''<defs>
  <marker id="arrowhead" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
    <path d="M0 0 L8 4.5 L0 9 Z" fill="{PRIMARY}"/>
  </marker>
  <linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="{PRIMARY}"/><stop offset="100%" stop-color="#9B6DF0"/>
  </linearGradient>
  <linearGradient id="softGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#EEF0FF"/><stop offset="100%" stop-color="#F7F8FC"/>
  </linearGradient>
</defs>'''


# ---------------------------------------------------------------- 画板 1：品牌
def f1(w=720, h=420):
    s = [r(28, 28, 292, 292, fill='url(#brandGrad)', rx=22, stroke='none')]
    s.append('<circle cx="174" cy="150" r="72" fill="#FFFFFF" opacity="0.14"/>')
    s.append('<path d="M126 104 L222 104 L242 154 L106 154 Z" fill="#FFFFFF" opacity="0.95"/>')
    s.append('<path d="M106 154 L242 154 L282 272 L66 272 Z" fill="#FFFFFF" opacity="0.13"/>')
    s.append('<path d="M96 262 Q140 246 174 262 L174 296 Q140 280 96 294 Z" fill="#FFFFFF" opacity="0.95"/>')
    s.append('<path d="M174 262 Q208 246 252 262 L252 294 Q208 280 174 296 Z" fill="#FFFFFF" opacity="0.8"/>')
    s.append(ln(174, 262, 174, 296, '#5B5BD6', 1.5))
    s.append(t(28, 356, 'LAN + Lantern · 只在局域网点一盏灯', 11, TEXT3))

    s.append(t(352, 82, '灯下', 42, TEXT, 700))
    s.append(t(352, 116, 'Lantern Desk', 22, PRIMARY, 700))
    s.append(t(352, 142, 'LAN-only Library & Workdesk', 12, TEXT2))
    s.append(pill(352, 160, 96, '零搬移整理'))
    s.append(pill(456, 160, 104, '书库 + 工作台'))
    s.append(pill(568, 160, 72, '仅内网'))
    s.append(t(352, 222, '把一个资料文件夹变成私人书库与工作文档中心，', 12.5, TEXT2))
    s.append(t(352, 242, '原文件一个字节都不动；分类、层级、项目与日期', 12.5, TEXT2))
    s.append(t(352, 262, '全部只是 SQLite 索引里的记录。', 12.5, TEXT2))
    s.append(ln(352, 284, 688, 284, BORDER, 1))
    s.append(pill(352, 300, 196, '100% AI-GENERATED · MIT', '#FFF4E5', AMBER, 10.5, 28))
    s.append(t(352, 356, 'Node.js 22 · SQLite · 零 npm 运行时依赖', 11, TEXT3))
    s.append(t(352, 376, 'Windows / macOS / iOS / Android · 响应式', 11, TEXT3))
    return ''.join(s)


# ---------------------------------------------------------------- 画板 2：架构
def f2(w=720, h=420):
    s = [t(24, 34, '客户端 · 只需浏览器', 12, TEXT2, 600)]
    for i, (x, label) in enumerate([(24, 'Windows'), (152, 'macOS'), (280, '手机 / 平板')]):
        s.append(r(x, 48, 116, 44, fill=CARD, rx=9))
        s.append(t(x + 58, 76, label, 12, TEXT, 600, 'middle'))
    s.append(arrow(340, 96, 340, 122))
    s.append(r(24, 128, 672, 132, fill='url(#softGrad)', rx=12, stroke='#D9DCF2'))
    s.append(t(40, 152, 'Docker 容器 · 单个服务', 13, PRIMARY, 700))
    for i, (x, label) in enumerate([(40, 'HTTP / API'), (196, '扫描与分类'), (352, '封面服务'), (508, '工作台')]):
        s.append(r(x, 166, 140, 40, fill=CARD, rx=8, stroke='#D9DCF2'))
        s.append(t(x + 70, 191, label, 11.5, TEXT, 600, 'middle'))
    s.append(r(40, 216, 184, 30, fill=SOFT, rx=8, stroke='none'))
    s.append(t(132, 236, 'SQLite · library.db', 11, PRIMARY, 600, 'middle'))
    s.append(t(240, 236, '进度 / 书签 / 书架 / 项目 / 日期 / AI 设置', 11, TEXT2))
    s.append(arrow(340, 264, 340, 290))
    boxes = [(24, '学习资料/  · 只读索引'), (256, '_工作文件/  · 工作文档'), (488, '_图书馆分类/ + _工作台分类/')]
    for x, label in boxes:
        s.append(r(x, 296, 208, 60, fill=CARD, rx=9))
        s.append(t(x + 104, 322, label, 10.5, TEXT, 600, 'middle'))
        s.append(t(x + 104, 340, '硬链接 · 零额外空间', 9.5, TEXT3, 400, 'middle'))
    s.append(r(452, 48, 244, 58, fill='#FFF7ED', rx=9, stroke='#F6DFC0', dash='4 3'))
    s.append(t(574, 72, '可选：DeepSeek / 豆包', 11, AMBER, 600, 'middle'))
    s.append(t(574, 90, '唯一外连，不配置则完全离线', 9.5, TEXT3, 400, 'middle'))
    s.append(arrow(448, 96, 448, 128, AMBER, 1.4, '4 3'))
    s.append(t(24, 392, '资料目录以 bind mount 挂入；端口只绑定内网 IP；应用层拒绝非私有网段请求', 11, TEXT3))
    return ''.join(s)


# ---------------------------------------------------------------- 画板 3：书库 UI
def f3(w=720, h=520):
    s = [r(24, 24, 672, 46, fill=CARD, rx=9)]
    s.append(r(38, 34, 26, 26, fill='url(#brandGrad)', rx=7, stroke='none'))
    s.append(t(76, 52, '灯下 · Lantern Desk', 11.5, TEXT, 700))
    s.append(r(220, 34, 280, 26, fill=BG, rx=7, stroke='none'))
    s.append(t(234, 51, '搜索书名、作者、标签…', 10.5, TEXT3))
    s.append(r(560, 34, 56, 26, fill=SOFT, rx=7, stroke='none'))
    s.append(t(588, 51, '同步', 10.5, PRIMARY, 600, 'middle'))
    s.append(r(626, 34, 56, 26, fill=SOFT, rx=7, stroke='none'))
    s.append(t(654, 51, '导入', 10.5, PRIMARY, 600, 'middle'))

    s.append(r(24, 80, 142, 412, fill=CARD, rx=9))
    for i, label in enumerate(['按目录浏览', '全部藏书', '工作台 · 工作文件', '继续阅读', '我的书签']):
        y = 104 + i * 34
        if i == 0:
            s.append(r(34, y - 16, 122, 28, fill=SOFT, rx=7, stroke='none'))
        s.append(t(46, y + 2, label, 10.5, PRIMARY if i == 0 else TEXT2, 600 if i == 0 else 400))
    s.append(t(34, 300, '书架', 10, TEXT3, 700))
    for i, label in enumerate(['计算机', '小说文学', '语言学习', '历史']):
        s.append(r(34, 310 + i * 28, 8, 8, fill=[PRIMARY, GREEN, AMBER, SKY][i], rx=4, stroke='none'))
        s.append(t(50, 319 + i * 28, label, 10.5, TEXT2))

    s.append(t(184, 104, '小说 / 克苏鲁 / 超越时空之影', 11, TEXT2))
    s.append(pill(184, 116, 78, '按目录', PRIMARY, '#FFFFFF', 10, 22))
    s.append(pill(268, 116, 62, '平铺', BG, TEXT2, 10, 22))
    s.append(t(184, 162, '文件夹 · 6 个', 10.5, TEXT3, 600))
    for i in range(4):
        s.append(card(184 + i * 126, 174, 112, 152, [PRIMARY, PURPLE, TEAL, SKY][i], '套书' if i == 0 else ''))
    s.append(t(184, 356, '本层图书 · 9 话', 10.5, TEXT3, 600))
    for i in range(4):
        s.append(card(184 + i * 126, 368, 112, 108, [GREEN, AMBER, ROSE, PRIMARY][i]))

    # 手机端线框
    s.append(r(556, 270, 126, 212, fill=CARD, rx=16, stroke='#C9CEE4', sw=2))
    s.append(r(568, 282, 102, 18, fill=BG, rx=5, stroke='none'))
    for i in range(2):
        for j in range(2):
            s.append(r(570 + j * 50, 308 + i * 74, 44, 66, fill=[PRIMARY, PURPLE, TEAL, SKY][i * 2 + j], rx=5, stroke='none', opacity='.8'))
    s.append(r(568, 458, 102, 16, fill=SOFT, rx=5, stroke='none'))
    s.append(t(619, 500, '390px 手机端', 10, TEXT3, 400, 'middle'))
    return ''.join(s)


# ---------------------------------------------------------------- 画板 4：工作台 UI
def f4(w=720, h=520):
    s = [r(24, 24, 672, 44, fill=CARD, rx=9)]
    s.append(t(40, 51, '工作台 · 工作文件', 12, TEXT, 700))
    s.append(t(500, 51, '共 128 份 · 6 个项目', 10.5, TEXT3, 400, 'end'))
    for i, (label, active) in enumerate([('全部文件', True), ('星海项目', False), ('官网改版', False), ('年度审计', False), ('＋ 项目', False)]):
        x = 24 + i * [96, 92, 92, 92, 72][i]
        w = [88, 84, 84, 84, 64][i]
        s.append(pill(x, 78, w, label, PRIMARY if active else SOFT, '#FFFFFF' if active else TEXT2, 10, 24))
    for i, label in enumerate(['全部日期 ▾', '全部类型 ▾', '按项目 / 按时间', '导入工作文件', 'AI 识别']):
        s.append(r(24 + i * 134, 112, 124, 28, fill=BG, rx=7, stroke=BORDER))
        s.append(t(86 + i * 134, 131, label, 9.5, TEXT2, 400, 'middle'))
    y0 = 156
    for gi, (proj, rows) in enumerate([
        ('星海项目', [('DOCX', '需求评审方案', '2026-05-12', '方案 / 规划', '已归档'),
                      ('XLSX', '一期预算表', '2026-07-01', '预算 / 财务', '进行中')]),
        ('官网改版', [('PPTX', '设计评审汇报', '2026-07-01', '汇报 / 总结', '待整理')])
    ]):
        top = y0 + gi * 168
        s.append(r(24, top, 672, 156, fill=CARD, rx=10))
        s.append(r(24, top, 672, 32, fill=BG, rx=10, stroke='none'))
        s.append(r(24, top + 20, 672, 12, fill=BG, stroke='none'))
        s.append(r(40, top + 10, 12, 12, fill=PRIMARY, rx=3, stroke='none'))
        s.append(t(60, top + 21, proj, 11.5, TEXT, 700))
        s.append(t(140, top + 21, f'{len(rows)} 份 · 2026-05 ~ 2026-07', 10, TEXT3))
        for ri, (ext, name, date, dtype, status) in enumerate(rows):
            ry = top + 40 + ri * 54
            color = {'DOCX': '#2B579A', 'XLSX': '#217346', 'PPTX': '#D24726'}[ext]
            s.append(r(40, ry + 4, 44, 38, fill=color, rx=8, stroke='none'))
            s.append(t(62, ry + 28, ext, 9, '#FFFFFF', 700, 'middle'))
            s.append(t(96, ry + 20, name + '.docx', 11, TEXT, 600))
            s.append(t(96, ry + 36, '_工作文件/' + proj + '/2026/…', 9.5, TEXT3))
            s.append(pill(376, ry + 6, 116, date, '#E8F5FF', SKY, 9.5, 22))
            s.append(pill(500, ry + 6, 96, dtype, SOFT, PRIMARY, 9.5, 22))
            s.append(pill(604, ry + 6, 66, status, '#E9F9EF' if status == '已归档' else '#FFF4E5',
                          GREEN if status == '已归档' else AMBER, 9.5, 22))
            s.append(ln(40, ry + 48, 680, ry + 48, BORDER, 1))
    s.append(t(24, 506, '项目 / 日期 / 类型在导入时自动识别，识别来源标注在每条记录上；手动修改后锁定', 10, TEXT3))
    return ''.join(s)


# ---------------------------------------------------------------- 画板 5：Office 阅读器
def f5(w=720, h=480):
    s = [t(24, 32, '浏览器内原生渲染 · 无 CDN、无服务端转换', 12, TEXT2, 600)]
    panels = [(24, 'Word · DOCX'), (256, 'PowerPoint · PPTX'), (488, 'Excel · XLSX')]
    for x, label in panels:
        s.append(r(x, 48, 208, 350, fill=CARD, rx=11))
        s.append(r(x, 48, 208, 32, fill=SOFT, rx=11, stroke='none'))
        s.append(r(x, 68, 208, 12, fill=SOFT, stroke='none'))
        s.append(t(x + 104, 69, label, 10.5, PRIMARY, 700, 'middle'))
    # Word
    s.append(t(40, 108, '项目需求评审', 14, TEXT, 700))
    s.append(ln(40, 118, 216, 118, BORDER, 1))
    for i, wd in enumerate([176, 150, 168, 120]):
        s.append(r(40, 132 + i * 18, wd, 6, fill='#E1E4F0', rx=3, stroke='none'))
    s.append(t(40, 226, '模块 / 负责人表', 10.5, TEXT2, 600))
    for i in range(3):
        for j in range(2):
            s.append(r(40 + j * 88, 236 + i * 20, 84, 17, fill=BG, rx=2, stroke=BORDER, sw=.7))
    s.append(t(40, 322, '标题 / 加粗 / 表格 / 内嵌图片', 9.5, TEXT3))
    s.append(t(40, 342, '滚动位置自动保存', 9.5, TEXT3))
    s.append(t(40, 372, 'OOXML → HTML', 10, PRIMARY, 600))
    # PPT
    s.append(r(272, 96, 176, 100, fill='url(#softGrad)', rx=8, stroke='#D9DCF2'))
    s.append(t(284, 122, '星海项目季度汇报', 11, TEXT, 700))
    s.append(r(284, 134, 120, 6, fill='#D5D9EC', rx=3, stroke='none'))
    s.append(r(284, 148, 96, 6, fill='#D5D9EC', rx=3, stroke='none'))
    s.append(r(272, 208, 84, 48, fill=BG, rx=6))
    s.append(t(314, 237, '2 / 12 页', 9.5, TEXT3, 400, 'middle'))
    s.append(r(364, 208, 84, 48, fill=BG, rx=6))
    s.append(t(406, 237, '幻灯片', 9.5, TEXT3, 400, 'middle'))
    s.append(t(272, 292, '逐页文字 + 图片 + 备注', 9.5, TEXT3))
    s.append(t(272, 312, '可翻页 / 目录 / 进度同步', 9.5, TEXT3))
    s.append(t(272, 372, 'ppt/slides/*.xml', 10, PRIMARY, 600))
    # Excel
    for i, name in enumerate(['预算明细', '汇总']):
        s.append(r(504 + i * 74, 92, 70, 24, fill=PRIMARY if i == 0 else SOFT, rx=6, stroke='none'))
        s.append(t(539 + i * 74, 108, name, 9.5, '#FFFFFF' if i == 0 else TEXT2, 600, 'middle'))
    for row in range(6):
        for col in range(4):
            fill = BG if row == 0 else CARD
            s.append(r(504 + col * 44, 124 + row * 22, 42, 20, fill=fill, rx=0, stroke=BORDER, sw=.7))
            if row == 0:
                s.append(t(525 + col * 44, 138, chr(65 + col), 9, TEXT3, 600, 'middle'))
    s.append(t(504, 288, '多 Sheet 切换 / 大表截断保护', 9.5, TEXT3))
    s.append(t(504, 308, 'CSV 同样以表格呈现', 9.5, TEXT3))
    s.append(t(504, 372, 'sharedStrings + sheet XML', 10, PRIMARY, 600))
    s.append(t(24, 432, '旧版 .doc / .ppt / .xls 由服务端尽力提取正文；其余格式可下载原件', 11, TEXT3))
    s.append(t(24, 456, '解析用的 JSZip 已内置在 public/vendor/，离线可用', 11, TEXT3))
    return ''.join(s)


# ---------------------------------------------------------------- 画板 6：设计系统
def f6(w=720, h=480):
    s = [t(24, 32, '色彩令牌 · Color tokens', 12, TEXT2, 600)]
    colors = [(PRIMARY, 'Primary', '#5B5BD6'), (PURPLE, 'Purple', '#8B5CF6'), (TEAL, 'Teal', '#14B8A6'),
              (GREEN, 'Success', '#16A34A'), (AMBER, 'Warning', '#D97706'), (ROSE, 'Danger', '#E11D48'),
              (SKY, 'Info', '#0284C7'), (TEXT2, 'Text 2', '#6A7185')]
    for i, (c, name, hexv) in enumerate(colors):
        x, y = 24 + (i % 4) * 172, 46 + (i // 4) * 84
        s.append(r(x, y, 156, 70, fill=CARD, rx=9))
        s.append(r(x + 10, y + 10, 46, 46, fill=c, rx=8, stroke='none'))
        s.append(t(x + 66, y + 30, name, 11, TEXT, 600))
        s.append(t(x + 66, y + 48, hexv, 10, TEXT3))
    s.append(ln(24, 222, 696, 222, BORDER, 1))
    s.append(t(24, 248, '字体层级 · Typography', 12, TEXT2, 600))
    s.append(t(24, 282, '灯下 · 一级标题 24 / 700', 21, TEXT, 700))
    s.append(t(24, 310, '项目名称 14 / 600', 14, TEXT, 600))
    s.append(t(24, 332, '正文与说明 13 / 400', 13, TEXT2))
    s.append(t(24, 350, '辅助信息 11 / 400', 11, TEXT3))
    s.append(ln(24, 368, 696, 368, BORDER, 1))
    s.append(t(24, 394, '组件 · Components', 12, TEXT2, 600))
    s.append(r(24, 408, 92, 34, fill=PRIMARY, rx=9, stroke='none'))
    s.append(t(70, 430, '主要按钮', 11, '#FFFFFF', 600, 'middle'))
    s.append(pill(130, 412, 78, '筛选 Chip', SOFT, PRIMARY, 10.5, 28))
    s.append(pill(220, 412, 78, '项目标签', '#E8F5FF', SKY, 10.5, 28))
    s.append(r(312, 408, 120, 34, fill=CARD, rx=9))
    s.append(t(372, 430, '卡片 Card', 11, TEXT2, 400, 'middle'))
    s.append(r(446, 408, 120, 34, fill=CARD, rx=9))
    s.append(t(506, 430, '输入框 Input', 11, TEXT3, 400, 'middle'))
    s.append(t(24, 466, '浅色 / 深色双主题 · 断点 1080 / 760 / 390px', 10.5, TEXT3))
    return ''.join(s)


# ---------------------------------------------------------------- 画板 7：安全边界
def f7(w=1480, h=400):
    s = [r(24, 24, 1000, 336, fill='#F0FDF5', rx=16, stroke='#BBE8CC', sw=2, dash='7 5')]
    s.append(t(44, 52, '局域网边界 · LAN only', 13, GREEN, 700))
    s.append(t(44, 72, '10/8 · 172.16/12 · 192.168/16 · 私有 IPv6', 10.5, TEXT3))
    for i, (x, label, sub) in enumerate([(56, 'Windows / Mac', '桌面浏览器'), (246, '手机 / 平板', '响应式界面')]):
        s.append(r(x, 96, 164, 74, fill=CARD, rx=10))
        s.append(t(x + 82, 126, label, 11.5, TEXT, 600, 'middle'))
        s.append(t(x + 82, 146, sub, 10, TEXT3, 400, 'middle'))
    s.append(r(470, 92, 300, 190, fill=CARD, rx=12, stroke='#BBE8CC', sw=1.5))
    s.append(t(620, 122, 'NAS / 主机', 14, TEXT, 700, 'middle'))
    s.append(t(620, 144, 'Docker · 仅绑定内网 IP', 11, TEXT2, 400, 'middle'))
    s.append(r(492, 160, 256, 40, fill=SOFT, rx=8, stroke='none'))
    s.append(t(620, 185, 'SQLite · 进度 / 书签 / 项目 / 日期', 10.5, PRIMARY, 600, 'middle'))
    s.append(r(492, 210, 256, 52, fill=BG, rx=8, stroke='none'))
    s.append(t(620, 232, '资料目录（只读索引）', 10.5, TEXT2, 400, 'middle'))
    s.append(t(620, 250, '导入 / 硬链接镜像才写入', 10, TEXT3, 400, 'middle'))
    s.append(arrow(224, 133, 464, 133, GREEN))
    s.append(arrow(464, 163, 224, 163, GREEN))
    s.append(t(344, 122, '阅读 / 归档请求', 10, GREEN, 400, 'middle'))
    s.append(t(344, 184, '进度、书签、项目状态', 10, GREEN, 400, 'middle'))
    s.append(t(800, 122, '跨设备实时同步', 11, GREEN, 600))
    s.append(t(800, 144, '同一份 SQLite 记录', 10.5, TEXT3))
    s.append(t(800, 200, '无账号体系', 10.5, TEXT2))
    s.append(t(800, 220, '无遥测 / 无 CDN', 10.5, TEXT2))
    s.append(t(800, 240, '可选访问口令', 10.5, TEXT2))
    s.append(t(800, 260, 'scrypt + HttpOnly', 10, TEXT3))

    s.append(ln(1032, 190, 1120, 190, ROSE, 3, '6 5'))
    s.append('<circle cx="1076" cy="190" r="24" fill="#FFF1F3" stroke="#E11D48" stroke-width="2"/>')
    s.append(ln(1060, 172, 1092, 208, ROSE, 2.5))
    s.append(r(1136, 92, 316, 196, fill='#FFF7F8', rx=14, stroke='#F6C9D2', dash='6 4'))
    s.append(t(1294, 132, '公网 / 外网穿透', 14, ROSE, 700, 'middle'))
    s.append(t(1294, 160, 'DDNS · FRP · 反向代理 · 隧道', 11, TEXT2, 400, 'middle'))
    s.append(t(1294, 184, '本项目一律不配置', 11.5, ROSE, 600, 'middle'))
    s.append(t(1294, 216, '唯一例外：用户主动填写 Key 后', 10, TEXT3, 400, 'middle'))
    s.append(t(1294, 236, '由服务端外连 AI 服务商', 10, TEXT3, 400, 'middle'))
    s.append(t(24, 384, '服务端 isPrivate() 二次校验，非私有网段一律 403；静态资源与第三方库全部内置，不发起任何隐式外连', 11, TEXT3))
    return ''.join(s)


FRAMES = [
    ('01', '品牌与定位 · Brand', 720, 420, 60, 160, f1),
    ('02', '系统架构 · Architecture', 720, 420, 820, 160, f2),
    ('03', '书库界面 · Library UI', 720, 520, 60, 620, f3),
    ('04', '工作台界面 · Workdesk UI', 720, 520, 820, 620, f4),
    ('05', 'Office 阅读器 · Reader', 720, 480, 60, 1180, f5),
    ('06', '设计系统 · Design tokens', 720, 480, 820, 1180, f6),
    ('07', '内网安全边界 · Security', 1480, 400, 60, 1700, f7),
]

W, H = 1600, 2200


def header():
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">', defs()]
    s.append(f'<rect width="{W}" height="{H}" fill="{BG}"/>')
    s.append(r(60, 40, 44, 44, fill='url(#brandGrad)', rx=12, stroke='none'))
    s.append(t(118, 62, '灯下 · Lantern Desk', 22, TEXT, 700))
    s.append(t(118, 84, 'Figma 展示板 / 产品说明图集 · 可编辑矢量源文件 · v0.3.0', 12, TEXT2))
    s.append(pill(1320, 48, 220, '100% AI-GENERATED', '#FFF4E5', AMBER, 11, 28))
    s.append(ln(60, 106, 1540, 106, BORDER, 1))
    return ''.join(s)


def build():
    parts = [header()]
    for num, name, fw, fh, x, y, fn in FRAMES:
        parts.append(f'<g id="frame-{num}" transform="translate({x},{y})">')
        parts.append(t(2, -14, f'{num} / {name}', 12, TEXT2, 600))
        parts.append(r(0, 0, fw, fh, fill=CARD, rx=16, stroke=BORDER, sw=1.5))
        parts.append(fn(fw, fh))
        parts.append('</g>')
        frame_svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{fw + 48}" height="{fh + 72}" '
                     f'viewBox="-24 -44 {fw + 48} {fh + 72}">' + defs() +
                     f'<rect x="-24" y="-44" width="{fw + 48}" height="{fh + 72}" fill="{BG}"/>' +
                     t(2, -14, f'{num} / {name}', 12, TEXT2, 600) +
                     r(0, 0, fw, fh, fill=CARD, rx=16, stroke=BORDER, sw=1.5) + fn(fw, fh) + '</svg>')
        with open(os.path.join(FRAMES_DIR, f'{num}-{name.split(" · ")[1].lower().replace(" ", "-")}.svg'),
                  'w', encoding='utf8') as f:
            f.write(frame_svg)
    parts.append(t(60, 2150, 'Lantern Desk · MIT License · 本项目完全由 AI 生成 · 示意图为矢量源文件，可直接拖入 Figma 编辑', 11.5, TEXT3))
    parts.append('</svg>')
    out = os.path.join(HERE, 'lantern-desk-showcase.svg')
    with open(out, 'w', encoding='utf8') as f:
        f.write(''.join(parts))
    print('wrote', out)
    print('frames:', len(os.listdir(FRAMES_DIR)))


if __name__ == '__main__':
    build()
