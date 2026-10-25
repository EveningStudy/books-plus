// Code-authored documentation diagrams. No screenshots are modified.
const fs = require("node:fs");
const path = require("node:path");
const dir = path.resolve(__dirname, "../docs/assets/diagrams");
fs.mkdirSync(dir, { recursive: true });
const esc = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
function text(x, y, s, size = 20, fill = "#263a41", weight = 400) {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}">${esc(s)}</text>`;
}
function box(x, y, w, h, title, lines, color = "#ffffff", tag) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="${color}" stroke="#d9e0de"/>${tag ? text(x + 24, y + 35, tag, 13, "#b6652f", 600) : ""}${text(x + 24, y + (tag ? 74 : 43), title, 23, "#263a41", 600)}${lines.map((s, i) => text(x + 24, y + (tag ? 112 : 80) + i * 31, s, 17, "#53646a")).join("")}`;
}
function arrow(x1, y1, x2, y2, both = false) {
  return `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="#ec842e" stroke-width="2.5" fill="none" marker-end="url(#arrow)"${both ? ' marker-start="url(#back)"' : ""}/>`;
}
function save(name, title, subtitle, body, h = 540) {
  fs.writeFileSync(
    path.join(dir, name + ".svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${h}" viewBox="0 0 1200 ${h}" role="img" aria-labelledby="title desc"><title id="title">${esc(title)}</title><desc id="desc">${esc(subtitle)}</desc><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#ec842e"/></marker><marker id="back" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M10 0L0 5L10 10Z" fill="#ec842e"/></marker></defs><rect width="1200" height="${h}" rx="24" fill="#f6f7f3"/><g font-family="Segoe UI, PingFang SC, Microsoft YaHei, sans-serif">${text(40, 55, title, 29, "#263a41", 600)}${text(40, 91, subtitle, 17, "#63736f")}${body}${text(40, h - 22, "BOOKS+  /  0.5.0 文档示意", 12, "#7d8883", 500)}</g></svg>`,
  );
}
save(
  "sync-overview",
  "一份云端书库，Windows 与 Mac 接着读",
  "Books+ 负责保存与合并；云盘客户端负责把文件送到另一台电脑。",
  box(
    40,
    135,
    305,
    205,
    "Windows · Books+",
    ["导入、阅读、书签与批注", "保存本机备份", "写入本地同步目录"],
    "#ffffff",
    "01 / 阅读端",
  ) +
    box(
      447,
      135,
      306,
      205,
      "同一份云端书库",
      [
        "正文 + 书目 + 小封面",
        "reader-state 阅读记录",
        "iCloud / OneDrive / Google Drive",
      ],
      "#fff4e8",
      "02 / 由云盘客户端传输",
    ) +
    box(
      855,
      135,
      305,
      205,
      "macOS · Books+",
      [
        "连接同一书库的本地副本",
        "读取到达本机的新记录",
        "点「接着读」恢复位置",
      ],
      "#ffffff",
      "03 / 另一阅读端",
    ) +
    arrow(356, 233, 435, 233, true) +
    arrow(765, 233, 843, 233, true) +
    box(
      40,
      375,
      1120,
      108,
      "可选：Mac 的 Apple Books 桥",
      [
        "导出无 DRM EPUB / PDF 与记录；同修订 EPUB 位置可尝试回写，需留意页面对齐。",
      ],
      "#eaf0eb",
    ),
  550,
);
save(
  "delete-restore",
  "删除与恢复：发生了什么？",
  "所有参与设备需使用 0.5.0；旧版客户端不会隐藏删除状态。",
  box(
    40,
    140,
    325,
    200,
    "活动书库",
    ["书籍出现在书库中", "进度、书签与批注可继续使用"],
    "#ffffff",
    "01 / 正常阅读",
  ) +
    box(
      438,
      140,
      325,
      200,
      "最近删除",
      ["删除状态随书库同步", "原文件与阅读记录保留"],
      "#fff4e8",
      "02 / 删除图书并确认",
    ) +
    box(
      835,
      140,
      325,
      200,
      "恢复到书库",
      ["点更多选项 → 恢复图书", "恢复状态也会同步"],
      "#ffffff",
      "03 / 随时恢复",
    ) +
    arrow(377, 240, 425, 240) +
    arrow(775, 240, 823, 240) +
    box(
      40,
      380,
      1120,
      112,
      "需要节省磁盘空间？",
      [
        "使用「释放本地空间」或云盘客户端的按需下载功能。删除书目不释放正文，也不删除 Apple Books 原书。",
      ],
      "#eaf0eb",
    ),
  560,
);
save(
  "update-flow",
  "从检查更新，到继续阅读",
  "下载完成后由你确认安装；安装前会保存阅读进度。",
  box(
    40,
    145,
    248,
    180,
    "检查版本",
    ["设置 → 软件更新", "可关闭自动检查"],
    "#ffffff",
    "01 / CHECK",
  ) +
    box(
      330,
      145,
      248,
      180,
      "下载与校验",
      ["手动下载或自动下载", "校验失败拒绝安装"],
      "#ffffff",
      "02 / DOWNLOAD",
    ) +
    box(
      620,
      145,
      248,
      180,
      "保存并重启",
      ["确认安装", "等待保存后退出"],
      "#fff4e8",
      "03 / INSTALL",
    ) +
    box(
      910,
      145,
      250,
      180,
      "继续阅读",
      ["重新打开新版", "保留配置与阅读记录"],
      "#ffffff",
      "04 / READ",
    ) +
    arrow(295, 235, 322, 235) +
    arrow(585, 235, 612, 235) +
    arrow(875, 235, 902, 235) +
    box(
      40,
      365,
      545,
      130,
      "Windows",
      [
        "安装版可应用更新；便携版更新转为安装版。",
        "首次从无更新器的旧版升级，需手动安装。",
      ],
      "#eaf0eb",
    ) +
    box(
      615,
      365,
      545,
      130,
      "macOS 候选包",
      [
        "当前本地签名包只检查版本 / 打开发布页。",
        "自动安装需 Developer ID 与正式发布配置。",
      ],
      "#eaf0eb",
    ),
  565,
);
save(
  "data-locations",
  "哪些数据同步？哪些留在本机？",
  "不要将 Books+ 的整个应用配置目录放进云盘。",
  box(
    40,
    145,
    535,
    260,
    "云端书库",
    [
      "正文原文件与附属图片",
      "书目、分类、小封面",
      "阅读位置、书签、批注与删除状态",
      "每台设备只写自己的阅读快照",
    ],
    "#fff4e8",
    "共享 / 云盘客户端传输",
  ) +
    box(
      625,
      145,
      535,
      260,
      "每台电脑的本机数据",
      [
        "配置与独立设备身份",
        "尚待写入云盘的进度备份",
        "语音模型、音频、转换与封面缓存",
        "窗口位置、离线固定与已观察状态",
      ],
      "#ffffff",
      "独立 / 不上传",
    ) +
    text(
      42,
      458,
      "「已写入云盘文件夹」表示本地写入完成；是否已上传，请同时查看云盘客户端。",
      20,
      "#53646a",
    ),
  525,
);
console.log("Generated 4 SVG diagrams.");
