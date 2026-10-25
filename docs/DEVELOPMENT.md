# 开发文档

[返回首页](../README.md) · [使用说明](GUIDE.md)

这里写给想改代码、自己打包，或者想了解书库格式的人。只是用 Books+ 读书的话，看 [使用说明](GUIDE.md) 就够了。

- [开始开发](#开始开发)
- [项目结构](#项目结构)
- [测试](#测试)
- [书库格式](#书库格式)
- [阅读记录与同步](#阅读记录与同步)
- [Mac 与 Apple Books 的实现](#mac-与-apple-books-的实现)
- [打包与发布](#打包与发布)
- [文档截图](#文档截图)

## 开始开发

需要 Node.js 24+ 和 npm。Mac 上还要装 Xcode Command Line Tools，用来编译 Swift 写的原生桥。Windows 的系统接口通过自带的 PowerShell / .NET 调用，不用额外装东西。

```sh
npm ci            # 安装依赖
npm run dev       # 启动 Vite 和 Electron
npm test          # 单元测试和协议测试
npm run build     # 类型检查并构建前端
npm start         # 用构建好的前端启动 Electron
```

`npm run dev:web` 只启动网页界面，没有文件访问、语音和字幕这些桌面功能，适合单独调 UI。

几个有用的环境变量：

| 变量                  | 作用                                   |
| --------------------- | -------------------------------------- |
| `READER_USER_DATA`    | 指定一个独立的设置目录，不影响日常使用 |
| `READER_LIBRARY_ROOT` | 指定书库目录                           |
| `READER_MODELS_DIR`   | 指定语音模型目录                       |

默认的设置目录：Windows 是 `%APPDATA%\icloud-books-reader`，Mac 是 `~/Library/Application Support/icloud-books-reader`。模型在 Windows 上默认放在 `%LOCALAPPDATA%\BooksReader\models`。

## 项目结构

```text
src/                  React 界面
  components/         书库、设置、字幕窗口等
  reader/             EPUB / PDF 阅读器、翻页动画
  speech/             朗读控制
desktop/              Electron 主进程
  main.cjs            入口
  library.cjs         书库读写与同步合并
  formats.cjs         格式转换
  speech.cjs          朗读调度（系统语音、Edge、本地模型）
  edge-client.cjs     Edge 在线语音客户端
  models.cjs          本地语音模型的下载与管理
  apple-books.cjs     Mac 上的 Apple Books 同步
  cloud-files.*       Windows Cloud Files 占位文件接口
  updates.cjs         应用内更新
  macos/              Swift 原生桥
scripts/              开发、验收和文档脚本
tests/                单元测试
design/               设计稿和图标
```

## 测试

| 命令                     | 测什么                                                                 |
| ------------------------ | ---------------------------------------------------------------------- |
| `npm test`               | 单元测试和协议测试                                                     |
| `npm run test:desktop`   | 驱动真实的 Electron 界面跑一遍接力流程                                 |
| `npm run test:mac`       | 在 Mac 上验收打包好的应用（Dock、菜单栏、字幕、系统语音、同步）        |
| `npm run test:providers` | 在同一台机器上模拟不同云盘目录，不能代替两台电脑之间的真实同步         |

`test:desktop` 可以用 `BOOKSPLUS_TEST_APP` 指定已打包应用的路径。`test:mac` 用 `.qa/` 下的独立目录和合成的 Books 数据，不会碰你自己的书库。加上 `BOOKSPLUS_TEST_LOGIN=1` 会顺便注册再撤销一次登录项。

`scripts/` 里还有双机同步、真实云盘和安装升级的测试脚本（`test-two-host.cjs`、`test-cloud-*.cjs`、`test-update-install.cjs`），需要自己准备机器和配置。这些配置里有地址和私人路径，别提交到仓库。

## 书库格式

书库就是一个普通文件夹，Books+ 只靠云盘客户端在电脑之间搬运文件。目录结构如下：

```text
Library/
  catalog.json                          # 主书目，只有一个写入者
  catalog/extra/<book-id>.json          # 客户端新导入的书，每本一个文件
  content/<book-id>/<sha256>.<ext>      # 书的原文件，内容不变
  content/<book-id>/images/...          # HTML / Markdown 引用的图片
  covers/<book-id>/<revision>.jpg       # 封面，建议宽 320 px，小于 3 MB
  reader-state/v1/devices/<uuid>.json   # 每台设备自己的阅读记录
```

旧的 `Books Export` 导出目录（`library.json`、`books/`、`records/`）继续可用，Books+ 不会改写它们。有 `catalog.json` 时优先读它，否则读 `library.json`，两种情况都会合并 `catalog/extra/`。

### 书目

```json
{
  "version": 2,
  "libraryId": "955cb49f-dd75-4c63-b8db-36db0e8a7535",
  "books": [
    {
      "id": "stable-book-uuid",
      "title": "Example",
      "author": "Author",
      "addedAt": "2026-10-23T10:00:00.000Z",
      "collections": ["Fiction"],
      "content": {
        "path": "content/stable-book-uuid/<sha256>.epub",
        "revision": "<sha256>",
        "sha256": "<64 位小写十六进制>"
      },
      "cover": { "path": "covers/stable-book-uuid/<revision>.jpg" }
    }
  ]
}
```

- `libraryId` 在所有设备上都一样，只能用 ASCII 字母、数字、`-` 和 `_`，最长 100 个字符。两台电脑是不是同一个书库，看的就是它。
- 书的 `id` 必须唯一且不变。从 Apple Books 导出的书用它的 `asset_id`，不要拿标题或路径当 ID。
- 所有路径都相对于书库根目录。绝对路径、`..` 越界和指向书库外的链接都会被拒绝。
- `revision` 建议用原文件的 SHA-256。打开书时如果校验不一致，会提示同步失败，不会覆盖原文件。

### 导入新书

客户端导入一本书时，先写入正文和图片，再原子地发布 `catalog/extra/<id>.json`：

```json
{
  "version": 2,
  "book": {
    "id": "new-uuid",
    "title": "Example",
    "author": "Author",
    "content": {
      "path": "content/new-uuid/<sha256>.txt",
      "revision": "<sha256>",
      "sha256": "<sha256>"
    },
    "collections": [],
    "addedAt": "2026-10-23T10:00:00.000Z"
  }
}
```

每次导入都分配新的随机 UUID，这样多台设备不会抢着写同一个文件。客户端不会去改 `catalog.json` 或 `library.json`。

### 转换和缓存

TXT、Markdown、HTML、FB2 和 Calibre 转换的结果只存在本机缓存，不写回书库。缓存键包含原文件散列、书籍 ID、编码和转换协议版本（目前是 `booksplus-convert-v1`）。不同版本的 Calibre 转出来的 CFI 可能对不上，所以跨设备恢复位置时，转换文档会退回到按百分比定位。

### 按需下载与释放空间

浏览书库时只读 JSON、文件属性和小封面，不会去打开 EPUB 或 PDF。用户点开一本书或者选了「保留离线」，才会读取正文。

释放本地空间时：

- **Windows Cloud Files**（OneDrive 等）：用 `CfGetPlaceholderInfo` 查询状态，用 `CfOpenFileWithOplock` + `CfDehydratePlaceholder` 释放。
- **Mac iCloud Drive**：用 Foundation 查询上传状态，已上传且没有冲突时调用 `FileManager.evictUbiquitousItem`。其他 File Provider 不支持。
- 普通同步盘不能靠删除本地文件来「释放」，那样会把删除同步到云端。

正在阅读、标了离线、系统固定、还没上传或者有冲突的文件都不会被释放。

## 阅读记录与同步

每台设备只写自己的那个文件 `reader-state/v1/devices/<uuid>.json`，读取时把所有设备的文件合并起来。这样不需要锁，也不会互相覆盖。

```json
{
  "version": 1,
  "deviceId": "generated-uuid",
  "updatedAt": "2026-10-23T12:00:00.000Z",
  "books": {
    "book-id": {
      "reading": {
        "contentRevision": "<正文修订>",
        "cfi": "epubcfi(/6/4!/4/2/1:0)",
        "progress": 0.25,
        "narration": { "spine": 1, "index": 12, "href": "chapter.xhtml" },
        "originDeviceId": "generated-uuid",
        "updatedAt": "2026-10-23T12:00:00.000Z"
      },
      "status": {
        "favorite": true,
        "want": false,
        "finished": false,
        "updatedAt": "2026-10-23T11:50:00.000Z"
      },
      "lifecycle": { "deleted": false, "updatedAt": "2026-10-25T12:00:00.000Z" },
      "marks": {
        "mark-uuid": {
          "id": "mark-uuid",
          "type": "highlight",
          "cfi": "epubcfi(/6/4!/4/2/1,:0,:5)",
          "text": "所选文字",
          "note": "可选笔记",
          "deleted": false,
          "updatedAt": "2026-10-23T11:50:00.000Z"
        }
      }
    }
  }
}
```

PDF 用 `page`（从 1 开始）代替 `cfi`。`progress` 取值 0 到 1。

### 合并规则

- `reading`、`preferences`、`status`、`lifecycle` 各自独立，按 `updatedAt` 取最新的一份。这是整个对象的「后写者胜」，不是逐字段合并。
- `marks` 按每条标注的 UUID 分别取最新。`deleted: true` 是删除标记，必须保留。
- 时间戳相同时，比较排序后的对象 JSON 字符串，取字典序较大的，保证每台设备算出同样的结果。
- 时间用 UTC ISO 8601 毫秒格式。设备时钟不准会影响结果。
- 未知版本的文件直接跳过，损坏的文件会报错，但不影响读取其他设备的文件。
- `contentRevision` 和当前正文不一致时，丢掉旧的 CFI、页码和朗读位置，只按百分比恢复。标注保留，但位置可能对不上。

### 删除

0.5.0 加了 `lifecycle`。删除时写入 `deleted: true`，恢复时写入更新的 `deleted: false`。旧的进度或收藏更新不能让已删除的书「复活」。0.4.0 及更早的版本会忽略这个字段，所以参与删除同步的设备都要升到 0.5.0。

### 写入与刷新

- 先写本机备份 `libraries/<library-hash>/state-v1.json`，再写云盘里的设备文件。都用「临时文件 + rename」的方式原子替换。
- 云盘写入失败时保留本机备份，每 30 秒重试一次。
- 阅读器每 5 秒、窗口获得焦点、打开书之前都会重新读取。阅读中收到新位置只显示「接着读」，不会强行跳页。
- 恢复位置、建立索引、排版变化都不会产生新的进度，只有真正翻页或朗读才会写入。
- 本机还会保存 `observed-v1.json`，记住已经看到过的最新状态。云盘偶尔漏列文件或者返回旧版本时，进度不会倒退。这个文件不上传。

### 本机数据

```text
<userData>/
  config.json                         设备 ID、书库路径、语音和字幕设置
  libraries/<library-hash>/
    state-v1.json                     阅读记录的本机备份
    observed-v1.json                  已见过的最新状态
    downloads.json  covers/  converted/
```

语音模型、音频缓存、离线标记和窗口位置都只属于本机，不进云盘。不要把 `userData` 放进云盘同步，否则设备 ID 会被复制，两台电脑会写同一个文件。

## Mac 与 Apple Books 的实现

Mac 版的 Books+.app 里带了一个常驻的 Swift 程序 `booksplus-bridge`（源码在 `desktop/macos/BooksBridge.swift`），负责监听文件变化和读取 Apple Books 的数据。Electron 主进程负责菜单栏、登录项和同步调度。用户运行应用不需要装 Swift 或 Xcode。

### 读取 Apple Books

- 监听 Books 的文档目录、共享容器、iCloud 文档目录和所选书库，事件合并 1.5 秒，另外每 30 秒补查一次。helper 崩溃会自动重启。
- SQLite 数据库只用 `SQLITE_OPEN_READONLY` 打开，通过 backup 读进内存（包括已提交的 WAL），只取书目、分类、位置和批注需要的列。不写数据库，不导出账号信息。
- 导出没有 DRM 的 EPUB 和 PDF。EPUB 用固定的 ZIP 时间戳和文件顺序重新打包，保证同一本书每次导出的散列一样。有声书、`.ibooks`、损坏或加密的书会报告不支持。
- 正文先写到 `content/<asset-id>/<sha256>.<ext>`，再发布 `catalog/extra/<asset-id>.json`，书目里带上 `appleBooks.publisherDeviceId`，表明这个文件只由它更新。
- Apple Books 在书库里表现为一台独立的「虚拟设备」，有自己的 UUID，只写自己的设备文件。

这部分逻辑移植自 `books-icloud-exporter` 的容器发现、时间纪元换算和 EPUB 重建，没有打包原来的 Python 程序。

### 把云端的书和 Apple Books 对上

云端新导入的书有自己的 UUID，和 Apple Books 的 asset ID 不是一回事。对应关系这样建立：

1. 对 EPUB 计算内容指纹：按路径排序所有 ZIP 成员，只算路径和内容，忽略时间戳和 Apple 自己加的文件。
2. 如果 Apple Books 里已经有内容相同的唯一一本书，直接建立映射。EPUB identifier 只作参考，标题不作依据。
3. 没有的话，先记日志，再用 `open -a Books <file>` 导入。导入命令成功不算数，要等下一次读取时真的出现一本内容一致的书才确认。
4. 两分钟还没确认就显示原因，可以重试。出现多本内容相同的书时暂停自动判断，让用户手动选。

映射、导入日志和虚拟设备的本机备份按 `libraryId` 分开存放在 `libraries/<library-hash>/apple-books/sync.json`。

### 写回阅读位置

只有同一修订的 EPUB 会写回位置，通过 `ibooks://assetid/<asset-id>#epubcfi(...)` 链接让 Books 跳过去。PDF 页码、纯百分比、批注和完成状态都不写回。

- 跳转前先在本机记下目标位置和原来的时间戳。之后读取到 Books 保存了目标 CFI，才算完成。确认时沿用云端原来的时间，不把这次跳转当成新的阅读进度。
- 等待确认期间暂停导出这本书的位置，避免 Books+ 和 Books 来回跳。
- Books 经常只保存到那一页开头的 CFI，有时还要关掉书窗口才落盘。这种情况会标为「待核对」，由用户在 Books 里看过之后手动确认、重试或取消。
- Books 在前台时暂缓自动跳转，用户主动点「在 Books 中继续」不受限制。

这个链接格式来自本机实验，不是苹果公开承诺的接口。实验脚本在 `scripts/research/apple-books-writeback.py`。

### 登录项与权限

登录项用 Electron 的 `mainAppService`（SMAppService）。开发模式下不注册。读取 Books 数据需要用户在系统设置里给 Books+ 打开完全磁盘访问。开发时这个权限可能会算到终端头上，而不是 Books+。

## 打包与发布

```sh
npm run package:win        # Windows 安装版和便携版
npm run package:mac        # Mac .app（会先编译 Swift helper）
npm run package:mac:dmg    # Mac DMG 和 ZIP
node scripts/verify-release.cjs   # 检查产物文件名、大小、SHA-512 和 blockmap
```

产物都在 `release/` 下。发布时要一起上传：

| 平台        | 文件                                                                                   |
| ----------- | -------------------------------------------------------------------------------------- |
| Windows     | `BooksPlus-Setup-x.y.z-x64.exe`、`BooksPlus-x.y.z-x64.exe`、`latest.yml`、`.blockmap` |
| macOS arm64 | `BooksPlus-x.y.z-arm64.dmg`、`BooksPlus-x.y.z-arm64.zip`、`latest-mac.yml`、`.blockmap` |

漏了 `latest*.yml` 或 Mac 的 ZIP，应用内更新就找不到新版。发布后也不要改文件名或替换文件，否则校验值对不上。

### 签名

目前 Windows 包没有签名，Mac 包是 ad-hoc 签名（`package.json` 里的 `mac.identity` 是 `-`）。要正式分发，需要配置自己的证书：Mac 上把 `mac.identity` 改成 Developer ID，并配置公证。Mac 版要有正式签名之后才能开启自动安装更新。

目前只构建过 Apple Silicon 版。Intel 版需要对应架构的 Electron、原生依赖和 helper，`BOOKSPLUS_ARCH=x64` 只影响 Swift 的编译目标。

### 发布前检查

- 在一台装着旧版的真实机器上走一遍应用内更新，确认书库、进度和设置都还在。
- README 和使用说明里的版本状态和实际发布一致。
- 跑一遍 `node scripts/check-docs.cjs`。

## 文档截图

文档里的截图和示意图都是脚本生成的：

```sh
node scripts/capture-docs.cjs    # 用真实打包应用截图
node scripts/draw-docs.cjs       # 画示意图
node scripts/check-docs.cjs      # 检查链接、图片和锚点
```

截图脚本会用临时设置目录和一个全新的示例书库，不读你的书，也不连云盘。示例书名、封面和正文都是原创的，和项目一起以 MIT 许可提供。

- Windows 默认使用 `release/win-unpacked/Books+.exe`，需要有 D 盘（用来放演示书库）和 Edge。
- Mac 需要 Chrome（用来渲染示例封面），并指定应用路径：

```sh
BOOKSPLUS_DOCS_APP='/absolute/path/Books+.app/Contents/MacOS/Books+' node scripts/capture-docs.cjs --mac
```

截图后不做任何像素修改。
