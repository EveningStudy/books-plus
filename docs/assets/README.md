# 文档图片

[文档首页](../README.md) · [图文使用指南](../USER_GUIDE.md)

## 来源与使用边界

- `screenshots/*.png`：0.5.0真实打包应用截图，Windows 24 张，macOS 3 张。
- `diagrams/*.svg`：4 张代码绘制的流程图，是说明图，不冒充运行截图。
- 书名、作者、封面图形与正文均为本项目制作的虚构示例，按项目 MIT 许可提供，不包含个人书目、账号或真实云盘路径。
- 应用窗口使用 1440 × 960 的逻辑内容尺寸。书库 / 阅读页保留全景；设置与删除确认直接截取实际弹窗，便于看清文字。截图不含操作系统窗口边框，未进行像素修改或添加假按钮。
- Mac 同步图使用只阅读模式，不读取个人 Books 容器；更新图为尚未检查状态。本地接力演示不代表云盘上传成功，真实云盘证据见[验收报告](../TESTING-0.5.0.md)。

## 截图索引

| 图片                                                                 | 内容                           |
| -------------------------------------------------------------------- | ------------------------------ |
| [library-grid](screenshots/library-grid.png)                         | 14 本示例书的网格书库          |
| [library-list](screenshots/library-list.png)                         | 列表视图                       |
| [library-search](screenshots/library-search.png)                     | 按作者搜索                     |
| [book-menu](screenshots/book-menu.png)                               | 图书更多菜单                   |
| [reader-light](screenshots/reader-light.png)                         | 白色主题双页阅读               |
| [reader-contents](screenshots/reader-contents.png)                   | 章节目录                       |
| [reader-themes](screenshots/reader-themes.png)                       | 主题与排版设置                 |
| [reader-dark](screenshots/reader-dark.png)                           | 深色主题                       |
| [reader-highlight](screenshots/reader-highlight.png)                 | 实际选区与待保存笔记           |
| [reader-bookmarks](screenshots/reader-bookmarks.png)                 | 书签与已保存高亮笔记           |
| [reader-search](screenshots/reader-search.png)                       | 正文搜索结果                   |
| [reader-resume](screenshots/reader-resume.png)                       | 独立本机配置模拟另一端的新进度 |
| [reader-pdf](screenshots/reader-pdf.png)                             | 原创单页 PDF                   |
| [delete-confirm](screenshots/delete-confirm.png)                     | 删除确认                       |
| [recently-deleted](screenshots/recently-deleted.png)                 | 最近删除                       |
| [restore-book](screenshots/restore-book.png)                         | 恢复入口                       |
| [settings-library](screenshots/settings-library.png)                 | 书库和空间设置                 |
| [settings-formats](screenshots/settings-formats.png)                 | 格式与 Calibre                 |
| [settings-voice](screenshots/settings-voice.png)                     | 系统离线声音                   |
| [settings-models](screenshots/settings-models.png)                   | 神经模型参数                   |
| [settings-model-downloads](screenshots/settings-model-downloads.png) | 模型来源与下载                 |
| [settings-subtitles](screenshots/settings-subtitles.png)             | 字幕样式预览                   |
| [settings-updates](screenshots/settings-updates.png)                 | Windows 更新页                 |
| [mac-library](screenshots/mac-library.png)                           | Mac 书库                       |
| [mac-sync](screenshots/mac-sync.png)                                 | Mac 同步设置                   |
| [mac-updates](screenshots/mac-updates.png)                           | Mac 更新限制                   |

## 重新生成

[desktop-subtitles](screenshots/desktop-subtitles.png) 是实际独立字幕窗口，以原创示例句展示样式，没有进行语音播放或伪造词时间点。

先构建最新应用，再运行：

```sh
node scripts/capture-docs.cjs
node scripts/draw-docs.cjs
node scripts/check-docs.cjs
```

捕获脚本使用临时用户配置与全新示例书库，不连接个人云盘。Windows 默认指向 `release/win-unpacked/Books+.exe`，并在 D 盘创建独立 `BooksPlus Demo …` 目录；设置截图只显示此演示路径。此脚本当前要求 Windows 有 D 盘及 Edge，Mac 有 Chrome（仅用于渲染原创封面），还需项目已有 Playwright 与 JSZip。

Mac 需在本机运行，指定实际应用路径：

```sh
BOOKSPLUS_DOCS_APP='/absolute/path/Books+.app/Contents/MacOS/Books+' node scripts/capture-docs.cjs --mac
```

Browser plugin not available，本轮使用 Playwright Electron。捕获脚本操作真实界面并在临时目录写出结果，页面异常会让脚本失败。EPUB 打开侧栏后的排版使用一次实际窗口调整触发；此限制已记录在[常见问题](../TROUBLESHOOTING.md#打开-epub-侧栏后文字被截断)。运行后可核对脚本输出位置，再按目录归属清理自己的演示数据；不要对已有书库套用清理命令。
