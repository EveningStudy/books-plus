# Books+ 云端书库协议 v2

[文档首页](README.md) · [图文同步指南](SYNC_GUIDE.md) · [0.5.0 验收](TESTING-0.5.0.md)

![云端书库与两端阅读器的数据流](assets/diagrams/sync-overview.svg)

面向 Windows、Mac 阅读器和内置 Apple Books 同步服务。云盘是持久数据源，本机保留进度备份、下载状态、封面和生成缓存。应用通过正常导入与 EPUB 深链接交给 Books 保存位置；协议 JSON 不直接写入 Apple 数据库。

## 布局

```text
Cloud Library/
  catalog.json                          # v2，书目发布者的单写者快照
  catalog/extra/<book-uuid>.json         # v2，客户端新增书，每书一个侧文件
  content/<book-uuid>/<sha256>.<ext>     # 不可变原文件，按需下载
  content/<book-uuid>/images/...         # HTML / Markdown 附属图片
  covers/<book-uuid>/<revision>.jpg      # 建议宽 320 px，小于 3 MB
  reader-state/v1/devices/<uuid>.json    # 每台设备自己的阅读快照
```

原 `Books Export/library.json`、`books/`、`records/` 继续兼容，不迁移已有文件。有 `catalog.json` 时优先读它，否则读 `library.json`；均合并 `catalog/extra`。正文可位于其他兼容的相对位置。

## 书目

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
        "sha256": "<64 lowercase hex characters>"
      },
      "cover": { "path": "covers/stable-book-uuid/<revision>.jpg" }
    }
  ]
}
```

`libraryId` 跨设备不变，接受 ASCII 字母、数字、连字符、下划线，最长 100。图书 ID 必须唯一且稳定，Apple 导出书继续用 `asset_id`，不能以标题或路径当 ID。路径相对于书库根目录，拒绝绝对路径、越界和指向目录外的链接。

正文修订推荐使用原文 SHA-256，不能用上传时间。`sha256` 存在时打开后校验，不符则提示同步 / 校验失败，保留源文件。目录层 `deleted:true` 的记录不显示。0.5.0 的用户删除使用设备状态的 `lifecycle` 字段，支持最近删除与恢复，不物理回收正文，也不修改 Apple 导出源目录。

## 客户端导入

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

先写正文和相对图片，再原子发布 `catalog/extra/<id>.json`。每次导入分配随机 UUID，避免多设备竞争同一个快照；当前重复导入是独立条目。客户端不回写发布者的 `catalog.json` / `library.json`。若未来服务吸收侧文件，须显式交接所有权，避免 ID 重复；当前侧文件优先。

HTML / Markdown 附属图片保留相对路径，拒绝目录外、链接越界和过大资源。正文 SHA 不覆盖附属图片；当前导入后视为不可变。未来更新这类书时，应发布包含全部资源散列的新版本清单，再切换修订，并保留旧版本用于恢复。

## 按需下载与清理

浏览只读 JSON、文件属性和小封面，不打开 EPUB / PDF 取封面。没有 `cover.path` 时显示文字封面，仅在用户打开后提取本机封面。

点击书或明确「保留离线」才读取正文。文本、FB2、漫画和 Calibre 转换结果只放本机缓存，不能覆盖源文件。内置转换版本为 `booksplus-convert-v1`；缓存包含原文散列、书籍 ID、编码和转换协议。Calibre 受版本影响，跨平台 CFI 可能不一致；如需严格共享位置，应由发布者生成规范化 EPUB，记录转换器版本并同步其 SHA。

Windows 属性查询使用 `OPEN_REPARSE_POINT` 与 `CfGetPlaceholderInfo`，释放使用 `CfOpenFileWithOplock` + `CfDehydratePlaceholder`。不会删除云端原文件。拒绝释放：正在打开 / 阅读、应用固定离线、系统固定、尚未同步、非占位文件、提供程序拒绝。取消应用固定不会取消云盘客户端原有固定状态。

报告 `cloud`、`downloaded`、`local`、`missing`、`unknown`；这些状态不承诺服务器上传到达时间。macOS iCloud 使用 Foundation 查询下载/上传状态，已上传且无冲突时调用 [FileManager.evictUbiquitousItem](<https://developer.apple.com/documentation/foundation/filemanager/evictubiquitousitem(at:)>) 释放本机正文。其他 File Provider 需在客户端操作。Mac 的离线标记由 Books+ 管理，不宣称设置系统级 Keep Downloaded。

默认 7 天未阅读清理，可设 1 / 7 / 14 / 30 / 90 天或关闭。仅管理本机在 Books+ 打开过的书，每小时和启动后检查；当前书、离线书、目录、封面、进度和批注保留。对应转换缓存一并释放。普通同步盘不能用删除本地文件模拟释放，否则会传播删除。

## 多设备状态与恢复

见 [进度协议 v1](SYNC.md)。每安装持久化一个设备 UUID，只原子替换自己的文件；不可让 Windows 和 Mac 同写 `progress.json`。独立字段按 UTC 时间戳合并，标注逐 UUID 合并，保留删除墓碑；时钟须校准，离线冲突后写优先，没有跨设备事务。

`reading.contentRevision` 检测正文变更。修订不同时不使用旧 CFI、页码、朗读索引，按百分比恢复；原标注保留供查阅，位置可能失效。转换文档修订另含编码与转换协议。Apple 的私有位置字段是导入数据，不是本协议写入目标。

原子写入使用临时文件 + rename。云盘写失败先保存在本机，运行期间每 30 秒重试。阅读器每 5 秒、返回书库或窗口聚焦时载入目录与设备状态，不在阅读中替换正文。云盘可能先同步书目、后同步正文，应显示等待 / 错误并允许重试。

0.5.0 在每个书库的本机配置目录保存 `observed-v1.json`，保留已经看到的最新字段，防止提供程序短暂漏列、损坏或重发旧快照时回退；新时间戳的恢复仍能生效。该缓存不上传，也不把其他设备的操作伪装成本机写入。不同 `libraryId` 使用独立缓存。

本机配置在 `userData/config.json`；备份在 `userData/libraries/<library-hash>/state-v1.json`，另有 `downloads.json`、`covers/`、`converted/`。新版书库按稳定 libraryId 分隔，旧版按根路径分隔。换书库不会把上一书库状态写入新目录。重装后连接原云盘可合并已同步记录；尚未上传的本机状态需保留备份。

模型、音频缓存、离线固定和窗口位置属于本机，不放云盘。当前不回收内容历史版本、标注墓碑或导出器数据。

## Mac 同步服务

Books+.app 包含常驻 FSEvents helper、登录项、菜单栏和三种运行模式。新增 Apple 书保留 asset ID，云端 UUID 书使用独立本机映射；EPUB 文件内容指纹处理 ZIP 重打包差异。映射与虚拟设备日志按 libraryId 隔离；每个安装有独立于阅读器的 Apple Books 虚拟设备 UUID。

同步器先写 `content/<id>/<sha>.<ext>`，再发布自己的 `catalog/extra/<id>.json`，不改外部发布者的主目录。可选 `book.appleBooks` 记录 `assetId`、`epubIdentifier` 和 `publisherDeviceId`；后者标明侧文件的单写者。正文变更发布新修订并保留旧版本。

云端 EPUB/PDF 正常导入 Books，后验确认唯一且正文一致的 asset。EPUB 位置回写核对修订，再提交深链接；待确认日志抑制回声，PDF/纯百分比及批注不回写。不能用协议 JSON 代替 Apple 数据库。

详细权限、页面对齐确认、故障恢复与实际验收边界见 [MAC.md](MAC.md)。

## 云盘兼容范围

选择客户端同步的**同一份书库本地文件夹**即可：iCloud Drive、OneDrive、Dropbox、Google Drive、坚果云、Syncthing，或其他保持文件字节与相对路径的同步客户端。Books+ 不需要这些提供程序的 OAuth。此范围基于本地文件访问能力，并非逐家服务器的实测认证。仅有网页/API、没有本地同步或挂载目录的服务暂不支持。

| 功能                   | 普通同步目录                 | Windows Cloud Files 提供程序 | Mac iCloud Drive             |
| ---------------------- | ---------------------------- | ---------------------------- | ---------------------------- |
| 正文、书目、进度、批注 | 客户端传输                   | 客户端传输                   | 系统传输                     |
| 读取占位正文           | 客户端处理                   | 系统按需下载                 | 系统按需下载                 |
| 保留离线               | 应用跳过清理，客户端设置离线 | 同时调用固定接口，可能拒绝   | 应用跳过清理，客户端设置离线 |
| 释放本机正文           | 客户端操作                   | 原生 API，受保护条件约束     | Foundation，需已上传且无冲突 |

建议把 `catalog.json`、`catalog/`、`reader-state/` 和旧库 `records/` 设为始终保留本机。两端首次连接前等待同步完成；不要分别初始化不同 libraryId 后依靠文件夹名称合库。暂停客户端时仍可保存本机，实际接力需等待客户端恢复。不要同步 Books+ 的 `userData`，否则会复制设备 UUID，破坏单写者规则。

0.4.0 阅读器每 5 秒、打开书前、返回书库和聚焦时读取到达本地的新状态，替代旧版每分钟检查。阅读中更新显示「接着读」，不替换正文或强制跳页。

0.5.0 已在 Windows 与 Apple Silicon Mac 通过真实 Google Drive、iCloud、OneDrive 客户端完成跨端书籍、进度、书签、删除和恢复闭环，两台真实打包阅读器也已验收。OneDrive 首轮超时及恢复过程保留在[测试报告](TESTING-0.5.0.md)，不能据此承诺所有账号 / 网络都可即时同步。早期 iCloud 测试还验证了上传状态、释放下载与 SHA 一致的重新读取；本轮没有对个人原件重做驱逐。第三方 File Provider 也可能报告 `isUbiquitousItem`，不能据此启用 iCloud 驱逐接口；当前只对 iCloud Drive 命名空间启用。
