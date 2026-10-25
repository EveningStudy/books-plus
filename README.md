# Books+

**把书放进云盘，在 Windows 和 Mac 上接着读。**

以 Apple Books 的阅读习惯为参考，提供多格式书库、阅读进度同步、在线与离线朗读，以及独立的桌面字幕。

[安装与升级](docs/INSTALLATION.md) · [图文使用指南](docs/USER_GUIDE.md) · [云盘与 Mac 同步](docs/SYNC_GUIDE.md) · [全部文档](docs/README.md)

![Books+ 书库：封面、阅读进度、收藏与分类](docs/assets/screenshots/library-grid.png)


## 先看它能做什么

| 你想做的事           | Books+ 的入口                                               |
| -------------------- | ----------------------------------------------------------- |
| 把本机电子书放到书库 | 右下角 **加入图书**，支持批量选择                           |
| 换一台电脑继续看     | 两端连接同一云端书库，收到新进度时点 **接着读**             |
| 调整阅读体验         | **主题与设置**：六个主题、字体、字号、分页 / 滚动、翻页效果 |
| 记录喜欢的段落       | 选中文字 → **标注**，可附带笔记；工具栏可加书签             |
| 听书                 | **设置 → 朗读**：Edge 在线、系统离线、可下载的本地模型      |
| 让字幕留在桌面       | **设置 → 桌面字幕**，独立透明置顶窗口                       |
| 暂时移走一本书       | 图书更多选项 → **删除图书…**；从 **最近删除** 恢复          |
| 获取新版             | **设置 → 软件更新**；Windows 支持保存进度后重启安装         |

## 从导入到阅读

1. [安装应用](docs/INSTALLATION.md)，打开后在 **设置 → 书库** 选择文件夹。本机空文件夹也可以作为书库。
2. 点 **加入图书**，选择 EPUB、PDF 或其他支持格式。
3. 点击封面开始阅读。进度自动保存；书签、批注和分类可在侧栏查找。

![双页阅读：正文、进度条和底部朗读控制](docs/assets/screenshots/reader-light.png)

EPUB、KEPUB、PDF 原生阅读；TXT、Markdown、HTML、FB2 内置转换；CBZ / CBT 内置漫画阅读。MOBI、AZW3、DOCX 等需单独安装 Calibre。加密 DRM 文件无法打开；图片书需先 OCR 才能朗读。[查看完整格式与限制](docs/FEATURES.md#格式)

## 按自己的习惯排版

白天、纸张色或深色阅读，搭配单页 / 双页、分页 / 滚动。目录、全文搜索和批注在同一个阅读窗口里。

<table>
  <tr>
    <td><img src="docs/assets/screenshots/reader-themes.png" alt="阅读主题面板：主题、字号、翻页和字体设置" width="640"></td>
    <td><img src="docs/assets/screenshots/reader-dark.png" alt="专注主题下的深色阅读页面" width="640"></td>
  </tr>
  <tr><td align="center">随时调整主题与排版</td><td align="center">专注主题</td></tr>
</table>

![书签与批注：保留原文并附上自己的笔记](docs/assets/screenshots/reader-bookmarks.png)

## 同一书库，两台电脑

Books+ 使用云盘客户端已经同步到本机的文件夹。**在软件中选目录即可，无需在 Books+ 登录云盘。**

![Windows 与 Mac 通过同一云端书库共享正文和阅读记录](docs/assets/diagrams/sync-overview.svg)

iCloud Drive、OneDrive、Google Drive 已完成 Windows ↔ Mac 的真实跨端导入、进度、书签、删除与恢复测试；Dropbox、坚果云、Syncthing 等具备兼容的文件夹机制，但未做本轮双机实测。网页网盘和只有 API 的服务不能直接连接。[同步配置与实测范围](docs/SYNC_GUIDE.md)

![阅读时收到另一设备的新位置，可以主动选择接着读](docs/assets/screenshots/reader-resume.png)

上图用本地隔离书库演示接力提示；真实云盘测试的步骤、失败记录和结果见 [0.5.0 验收报告](docs/TESTING-0.5.0.md)。写入文件夹后仍需等待云盘上传与另一端下载，延迟取决于云盘客户端。

### Mac 与 Apple Books

Mac 内置 **只同步 / 只阅读 / 两者都用** 三种模式。可将 Apple Books 的无 DRM EPUB / PDF、进度和批注导出到云库；同修订 EPUB 位置可经 Books 深链接回写，存在页首对齐与人工核对边界。PDF 进度、批注和完成状态不反向回写。没有宣称 iPhone 已验证。[查看 Mac 图文说明](docs/SYNC_GUIDE.md#mac-与-apple-books)

![真实 Mac 应用的 Apple Books 同步设置，示例使用只阅读模式](docs/assets/screenshots/mac-sync.png)

## 朗读与桌面字幕

Edge 适合联网朗读；系统语音无需下载模型；ZipVoice、Pocket TTS、Kitten 支持本机 CPU 推理。下载模型时可查看大小、来源和许可。**Edge 会将朗读句子发送到微软服务；本地引擎不发送正文。**

<table>
  <tr>
    <td><img src="docs/assets/screenshots/settings-models.png" alt="本地神经语音：模型、音色、质量和线程设置" width="640"></td>
    <td><img src="docs/assets/screenshots/settings-subtitles.png" alt="桌面字幕预览与字号、背景、描边设置" width="640"></td>
  </tr>
  <tr><td align="center">按语言与听感选择语音</td><td align="center">自定义独立桌面字幕</td></tr>
</table>

[朗读与字幕操作步骤](docs/USER_GUIDE.md#朗读与桌面字幕) · [模型参数、隐私与快捷键](docs/FEATURES.md#朗读与字幕)

## 可恢复的删除与应用更新

删除会同步到同一书库的 0.5.0 客户端。原文件、进度和批注保留，在 **最近删除** 中可恢复；不会删除 Apple Books 原书，也不会释放正文空间。

<table>
  <tr>
    <td><img src="docs/assets/screenshots/delete-confirm.png" alt="删除确认明确说明保留内容和跨端影响" width="640"></td>
    <td><img src="docs/assets/screenshots/settings-updates.png" alt="软件更新页：当前版本、自动检查和自动下载开关" width="640"></td>
  </tr>
  <tr><td align="center">删除前确认，随时恢复</td><td align="center">在应用中管理更新</td></tr>
</table>

Windows 提供安装版与便携版，便携版更新会迁移为安装版。当前 Mac 包为本地签名，支持版本检查；自动安装仍需 Developer ID 与正式发行配置。旧版首次需要手动安装带更新器的版本。[删除与恢复](docs/USER_GUIDE.md#删除与恢复) · [安装与更新](docs/INSTALLATION.md)

## 验证与发行状态

0.5.0已取得以下证据：

- Windows x64 与 Apple Silicon Mac 各 **71 项单元 / 协议测试通过**。
- 两台真实打包应用完成 EPUB / PDF / TXT / Markdown / FB2 阅读，以及三种云盘的进度接力、删除和恢复。
- Windows 通过真实安装器完成 QA 版本 **0.4.99 → 0.5.0** 升级，校验失败会拒绝安装，正确更新后保留书籍与记录。

**正式发行仍需完成 Mac Developer ID 签名与公证、GitHub 正式更新源发布及线上升级验收。** Windows 包尚未签名；Intel Mac、iPhone、多日压力和全部格式未完整覆盖。已有测试通过不代表没有问题。[完整测试记录](docs/TESTING-0.5.0.md) · [发行检查](docs/RELEASE.md)

## 开发与文档

```sh
npm ci
npm run dev
npm test
npm run build
```

开发需 Node.js 24+；Mac 编译原生桥还需 Xcode Command Line Tools。打包后的应用无需安装 Node 或 Python。

[开发与构建](docs/DEVELOPMENT.md) · [书库协议 v2](docs/CLOUD_LIBRARY.md) · [进度协议 v1](docs/SYNC.md) · [Mac 技术说明](docs/MAC.md) · [文档目录](docs/README.md)

## 开源

自有代码使用 [MIT](LICENSE)。第三方运行库、语音模型和 Calibre 适用各自许可，见 [依赖说明](THIRD_PARTY.md)。本项目独立于 Apple 与 Microsoft；仓库文档中的示例书籍、封面和正文为原创演示内容。
