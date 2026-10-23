# Books+ 云端书库协议 v2

面向 Windows、未来 Mac 阅读器和独立 Apple Books 同步服务。云盘是持久数据源，本机保留进度备份、下载状态、封面和生成缓存。本协议不实现 Apple 数据库写回。

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

正文修订推荐使用原文 SHA-256，不能用上传时间。`sha256` 存在时打开后校验，不符则提示同步 / 校验失败，保留源文件。`deleted:true` 的记录不显示；当前没有删除云书功能，目录删除和物理文件回收应分别设计。

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

报告 `cloud`、`downloaded`、`local`、`missing`、`unknown`；这些状态不承诺服务器上传到达时间。非 Windows 目前只报告普通本地状态，需客户端手动释放。未来 macOS iCloud 可接入 [FileManager.evictUbiquitousItem](<https://developer.apple.com/documentation/foundation/filemanager/evictubiquitousitem(at:)>)，其他 File Provider 需分别适配。

默认 7 天未阅读清理，可设 1 / 7 / 14 / 30 / 90 天或关闭。仅管理本机在 Books+ 打开过的书，每小时和启动后检查；当前书、离线书、目录、封面、进度和批注保留。对应转换缓存一并释放。普通同步盘不能用删除本地文件模拟释放，否则会传播删除。

## 多设备状态与恢复

见 [进度协议 v1](SYNC.md)。每安装持久化一个设备 UUID，只原子替换自己的文件；不可让 Windows 和 Mac 同写 `progress.json`。独立字段按 UTC 时间戳合并，标注逐 UUID 合并，保留删除墓碑；时钟须校准，离线冲突后写优先，没有跨设备事务。

`reading.contentRevision` 检测正文变更。修订不同时不使用旧 CFI、页码、朗读索引，按百分比恢复；原标注保留供查阅，位置可能失效。转换文档修订另含编码与转换协议。Apple 的私有位置字段是导入数据，不是本协议写入目标。

原子写入使用临时文件 + rename。云盘写失败先保存在本机，运行期间每 30 秒重试。书库每分钟、返回书库或窗口聚焦时载入目录与设备状态，不在阅读中替换正文。云盘可能先同步书目、后同步正文，应显示等待 / 错误并允许重试。

本机配置在 `userData/config.json`；备份在 `userData/libraries/<library-hash>/state-v1.json`，另有 `downloads.json`、`covers/`、`converted/`。新版书库按稳定 libraryId 分隔，旧版按根路径分隔。换书库不会把上一书库状态写入新目录。重装后连接原云盘可合并已同步记录；尚未上传的本机状态需保留备份。

模型、音频缓存、离线固定和窗口位置属于本机，不放云盘。当前不回收内容历史版本、标注墓碑或导出器数据。

## 后续 Mac 同步服务

1. 观察官方 Books 的新增、修订、进度、批注，使用稳定 ID；先发布不可变正文与小封面，再发布书目快照。
2. 读取设备快照，处理位置映射、权限、时钟、冲突、删除和恢复；不能将协议 JSON 替换 Apple 数据库。
3. 回写前核对目标书及修订，留存两边记录和转换版本。
4. 等云盘确认上传后再释放本机内容。双向映射与上述服务均未在当前阅读器实现。
