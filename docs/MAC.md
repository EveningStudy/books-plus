# Books+ for macOS

## 启动与模式

macOS 13+；本次构建及验收为 Apple Silicon。打开 `Books+.app`，首次启动用原生对话框选择：

| 模式     | Dock / 窗口                                 | 后台同步                  |
| -------- | ------------------------------------------- | ------------------------- |
| 只同步   | 隐藏 Dock，仅菜单栏；需要时打开同步设置面板 | 登录后可启动，关窗口继续  |
| 只阅读   | 正常阅读器                                  | 不读取或同步 Apple Books  |
| 两者都用 | 正常阅读器和菜单栏                          | 关闭阅读器继续；⌘Q 才退出 |

模式可在「设置 → Mac 同步」切换。同步模式自动导入新的云端 EPUB/PDF，默认自动提交同修订 EPUB 的位置深链接；可关闭「自动回写 Apple Books 阅读位置」，继续使用书籍导入、进度导出与「在 Books 中继续」。位置回写可能打开 Books 并切到前台。菜单栏提供立即同步、设置、选择书库和退出。

默认云库为 `~/Library/Mobile Documents/com~apple~CloudDocs/Books Export`，可通过菜单栏或设置换到其他同步盘。空目录初始化 v2 catalog；已有导出目录继续读 `library.json`。不要选择 Apple Books 自己的容器，也不要把输出目录放进这些容器。运行中的旧 CLI 导出器应使用其原有单写者目录；Books+ 不重写它的 `library.json`、`manifest.json`、`records/` 或 `books/`。

macOS 如果拒绝读取 Books 数据，在「系统设置 → 隐私与安全性 → 完全磁盘访问」允许 Books+ 后重启。状态面板提供跳转按钮。应用不自动授予权限。开发时权限可能归属于 Electron/启动它的终端；发布应用则是 Books+.app。无权限、数据库忙、正文未下载、DRM 和同步失败会显示原因并重试，不当成空书库成功。

登录项使用 Electron 45 的 `mainAppService`（SMAppService）。从登录项启动时保持后台；开发模式不注册登录项。系统可能要求在「通用 → 登录项」批准。建议将应用移入 Applications 后启用；移动路径或重新签名后需重新检查系统状态。菜单栏退出会停止 helper，关闭窗口不会。

## 原生桥与导出

`desktop/macos/BooksBridge.swift` 编译为应用 Resources 中的 `booksplus-bridge`；运行应用不需要 Node、Python、Swift 或 Command Line Tools。

- Electron 主进程负责菜单栏、登录项、IPC、持久日志与同步调度；独立 Swift helper 常驻运行 FSEvents。主窗口的生命周期与同步分离，使用单实例锁避免同配置双写。
- 监听 Books Documents、共享容器、Books iCloud Documents、BKAgent 书籍和所选云库；事件合并 1.5 秒，另有 30 秒补查。helper 异常退出会重启；macOS 睡眠期间不运行，恢复后补查。
- 移植 `books-icloud-exporter` 的容器发现、SQLite 只读备份、Apple 2001 时间纪元、EPUB 文件包重建、Books 根目录 bookkeeping 排除、DRM/CRC/阅读顺序验证及源文件稳定性检查逻辑。没有把 Python CLI 打进应用，也不要求安装该仓库。
- SQLite 原库只用 `SQLITE_OPEN_READONLY` 打开，用 SQLite backup 读入内存（包括已提交 WAL），只选书目、分类、位置和批注的列。不会写 SQL、直接改 Apple 数据库、导出账户令牌或复制整份私有数据库。
- 自动导出可读取的无 DRM EPUB 与 PDF。EPUB 包以固定 ZIP 时间戳、稳定文件顺序打包；遇到占位文件请求系统下载后重试，不把占位内容当正文。音频、`.ibooks`、损坏或加密书报告不支持；不解密、不删除原件。
- 正文先写入 `content/<asset-id>/<sha256>.<ext>`，再发布 `catalog/extra/<asset-id>.json`；旧正文版本保留。自己发布的书目带 `appleBooks.publisherDeviceId`，只由该发布者更新正文、标题和分类。
- 完成状态、书签、高亮、笔记和删除墓碑从 Books 导出。历史 `records/` 继续兼容；CLI 的每日时长/CRDT 备份和清理命令没有并入后台同步。

## 身份与修订

Apple 首次导出保留 asset ID 作为云书 ID。云端新导入书保留自己的 UUID，**不能**直接当 Apple asset ID：

1. 校验 catalog SHA，解析无 DRM EPUB；正文指纹按排序后的 ZIP 成员路径及内容计算，忽略 ZIP 时间戳和 Apple 根目录 bookkeeping。
2. 用相同正文的唯一 Apple asset 建立本机映射；EPUB identifier 仅作为记录与辅助证据，标题不作为身份依据。
3. 没有匹配时先保存导入日志，再调用 `/usr/bin/open -a Books <file>`。事件提交成功不代表导入完成；下一次只读快照出现唯一、内容一致的 asset 才确认映射。
4. 重启后不重复提交未确认导入。两分钟后仍未确认时显示原因；可在设置中重试。多个相同内容的 Apple asset 暂停自动判断，可手动核对候选；正文不一致或 asset 已归另一云书时拒绝映射。
5. 正文修订改变时停止旧 CFI 回写；自己发布的 Apple 书可以发布新修订，历史内容保留。外部发布的云书需要重新核对。转换后的非原生 EPUB 不把其他转换器的 CFI 套到 Apple 原件。

Apple Books 有独立、按安装持久的虚拟设备 UUID，与 Books+ 阅读器 UUID 不同。映射、导入日志、回写前后位置和虚拟设备本机备份按 libraryId 隔离：

```text
~/Library/Application Support/icloud-books-reader/
  config.json
  apple-books-device.json
  libraries/<library-hash>/apple-books/sync.json
```

恢复时保留整个 userData。迁移书库目录但保留 libraryId 时沿用映射；连接其他书库不会混入上一库的映射。文件上传仍由云盘负责，没有跨云盘事务或可靠的分布式锁。

## 回写与回声

自动回写需要较新的有效 v1 `reading`、相同 `contentRevision`、已核对的 Apple asset 与有效 EPUB CFI。range CFI 使用起点；通过 `ibooks://assetid/<asset-id>#epubcfi(...)` 提交。PDF 页码、纯百分比、批注及完成状态不回写。

回写过程先在本机持久记录目标进度、原始位置和来源时间，再打开深链接。后续只读快照确认 Books 已保存目标 CFI，才标记完成。确认时沿用原云端时间戳，不把 Books 导航产生的新时间当成新的用户进度。等待期间暂停该书位置导出，不反复打开 Books；重启后也不会重复导航。随后用户实际翻页才产生新的 Apple 设备进度。

**页面对齐差异需要人工核对。** Books 可能保存该页开头的 CFI，且通常在关闭书籍窗口后才落库。例如目标第 30 段实际显示第 27–32 段，保存位置是第 27 段。不能凭百分比或 `open` 返回码证明精确定位；此时保留待确认状态，在映射详情显示请求/实际 CFI，用户查看 Books 后可点「已核对，确认 Books 显示的位置」，或重试、取消。两分钟超时不会伪报成功。章首也可能保存空位置；同样需核对。

无变化时不重新写虚拟设备快照，避免监听自己产生的写入形成循环。虚拟设备只写自己的 JSON；外部设备文件只读取。云盘失败保留本机日志，下次重试；损坏设备快照报告问题并继续其他有效快照，未知版本跳过。删除 Apple 书不自动删云书，反向也不删除 Apple 书。

CFI URL 依据本机研究，不是已确认的 Apple 稳定公开进度 API。参见保留的 [回写研究](research/apple-books-writeback.md)。没有验证任意 Books 版本、所有 EPUB 或另一台 Apple 设备的 iCloud 到达情况。

## 阅读器与云文件

同一套 React 阅读器在 Mac 支持现有 EPUB/PDF、文本、HTML、FB2、漫画和可选 Calibre 转换；后者需单独安装。支持中文系统字体、⌘ 快捷键、全屏、透明置顶字幕。系统离线语音用 `say`，逐句字幕；Edge 在线与可下载的 sherpa-onnx 本地模型沿用现有接口。

iCloud Drive 用 Foundation 查询下载/上传状态，并用 `evictUbiquitousItem` 释放已上传、无冲突的本机正文；其他 File Provider 不宣称可释放，需在客户端操作。Books+ 自己的离线标记保护自动清理，不等于系统级 Keep Downloaded。未对真实个人 iCloud 原件执行新的驱逐实验，勿把 API 接入等同于所有提供程序的实测。

## 构建与验收

开发需要 Node 24+、npm 和 Xcode Command Line Tools：

```sh
npm ci                     # 安装依赖及当前架构 Electron
npm run dev                # 自动编译 Swift helper，再启动 Vite/Electron
npm test
npm run package:mac        # 本机架构的 .app
npm run test:mac            # 已打包应用的隔离验收
npm run package:mac:dmg    # 可拖到 Applications 的 DMG
```

本次输出 `release/mac-arm64/Books+.app`。Intel 需要对应架构的 Electron/原生依赖与 helper，本次没有构建或验收通用/Intel 包。`BOOKSPLUS_ARCH=x64` 只控制 Swift 编译目标，不会自动替换其他原生依赖。

默认 ad-hoc 本地签名，`codesign --verify --deep --strict` 可验证完整性；**不是 Developer ID 签名或 Apple 公证**。公开分发需提供自己的证书，以 electron-builder 的 `mac.identity` 覆盖默认 `-` 并配置 notarization。没有凭空签发证书、关闭 Gatekeeper 或设置自动上传发布。

`test:mac` 使用独立 `.qa/` 目录与合成的 Books 快照，在启用同步前替换原生快照接口，避免把真实个人书库导出到测试目录。验收：隐藏/恢复 Dock、菜单栏面板、字幕窗口、系统语音静音播放、无窗口 FSEvents 同步；如果 `.qa/mac-models` 已装 Kitten，再验证打包后的原生模型推理。可选 `BOOKSPLUS_TEST_LOGIN=1 npm run test:mac` 会注册并还原测试登录项，不验证实际重新登录。

### 2026-10-23 本机结果（macOS 15 / Apple Silicon）

- 单元/协议测试 47 项通过（包含已合入的 v0.2.3 Edge 握手修复）；TypeScript/Vite 构建、Mac `.app` 打包与签名验证通过。
- 真机只读 snapshot、单本自制 EPUB 导出、真实 FSEvents 事件通过。
- 新生成的合成云书经 Books 导入后，确认真实 asset ID 与正文指纹映射。
- 合成旧测试书页首 CFI 回写：UI 到目标页，关闭书籍后位置持久化，虚拟设备确认并保留云端原始时间；段内 CFI 的页面对齐差异保留待核对。
- 上游 v0.2.3 Edge 握手修复已合入；本机真实在线合成返回音频及 5 个词级字幕边界。
- 实际 Electron EPUB 阅读、方向键翻页、透明字幕窗口；系统语音 WAV 与 Kitten 推理通过。打包内 `reader-media` 的系统语音静音播放通过。
- 打包应用切为只同步后 Dock 隐藏，关闭所有窗口仍运行；写入云库事件后恢复自己的设备文件。改回只阅读后 Dock 恢复，停止同步。
- 登录项注册返回 `enabled/openAtLogin=true`，测试后撤销。未重启 macOS 验证实际登录启动。

测试仅使用自制书，不导航个人书；新合成测试书保留在 Books 供核对，避免自动删除影响 iCloud。个人快照、模型、音频和截图都在 Git 忽略的 `.qa/`；不提交。

## 0.4.0 接力验收

阅读器每 5 秒和聚焦时合并到达本地的设备状态，打开书前刷新；阅读中的新位置显示「接着读」。恢复、索引和布局变化不写新阅读时间；实际翻页/朗读才发布。自己的快照带 `reading.originDeviceId`，不会误报远端接力。

FSEvents 合并最长约 1.5 秒，连续事件不会无限延期；周期运行中到达的事件会再检查。较新的云端会话可替代旧待确认回写。Books 前台时暂缓后台自动跳转，主动「在 Books 中继续」仍可立即导航。

若 Books 保存成页首 CFI，第一次新保存只记录为回声基线；下一次保存了不同且时间更晚的位置时恢复正常导出。这不代表第一跳已精确确认；只有一份不匹配位置时仍需人工核对。

支持任意可读写的云盘本地同步目录。两端应连接同一个 `catalog.json` / `libraryId`，而非分别初始化空目录；平台差别集中在占位下载、离线固定和释放空间。

本轮 58 项测试通过；详见 [0.4.0 测试报告](TESTING-0.4.0.md)。上节 47 项是初版 Mac 实现的历史验收数量。用户已授权 0.4.0 验收后推送代码；私人资料不进入 Git。
