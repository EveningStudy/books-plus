# Reader state v1

[文档首页](README.md) · [图文同步指南](SYNC_GUIDE.md) · [云端书库 v2](CLOUD_LIBRARY.md)

![共享书库状态与本机配置的边界](assets/diagrams/data-locations.svg)

`Books Export/reader-state/v1/devices/<uuid>.json` 是 UTF-8 JSON。每个安装只写自己持久的 `deviceId`。原导出器的输入文件完全只读。

```json
{
  "version": 1,
  "deviceId": "generated-uuid",
  "updatedAt": "2026-10-23T12:00:00.000Z",
  "books": {
    "exporter-asset-id": {
      "reading": {
        "contentRevision": "<source revision>",
        "cfi": "epubcfi(/6/4!/4/2/1:0)",
        "progress": 0.25,
        "narration": { "spine": 1, "index": 12, "href": "chapter.xhtml" },
        "updatedAt": "2026-10-23T12:00:00.000Z"
      },
      "status": {
        "favorite": true,
        "want": false,
        "finished": false,
        "updatedAt": "2026-10-23T11:50:00.000Z"
      },
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

PDF 使用 `page`（从 1 开始）代替 `cfi`。`progress` 是 0–1。CFI 是首要恢复依据；百分比受引擎和取样方式影响。`narration` 指向当前朗读句，重新播放从该句开头开始。

每本书的 `reading`、`preferences`、`status` 是独立带时间戳的对象。合并所有有效 v1 文件时，各对象选择 `updatedAt` 较新的值。`marks` 各 UUID 分别选择较新的值，`deleted: true` 是删除墓碑，不能丢弃。未知版本跳过，不能以空对象覆盖它。损坏文件会提示，并继续读取其他有效设备文件。Apple 首次导出书的 ID 以 `asset_id` 为准；客户端导入书保留其 catalog UUID，通过本机映射关联 Apple asset。

时间戳均应规范化为 UTC ISO 8601 毫秒格式，设备时钟应校准。冲突解决是整个字段对象的后写优先，并非字符级 CRDT；两台离线设备同时更新同一阅读位置，较晚的时间戳优先。同一 `status` 或 `preferences` 对象上的并发细项修改仍可能互相覆盖。每台设备先将合并所得对象与本次修改组合，再写入自己的快照。

写入先保存本机 `libraries/<library-hash>/state-v1.json`，使用唯一临时文件与 rename 原子替换；Windows 文件短暂被占用时重试。然后同样写入设备同步文件。云盘故障不会删除本机备份，启动后与每 30 秒重试。`config.json` 保存设备 ID、目录、语音和字幕设置；字幕窗口位置是本机专属信息。新版书库的书籍 ID 来自 catalog v2，布局见 [云端书库协议](CLOUD_LIBRARY.md)。

`contentRevision` 与当前正文修订不同则保留百分比，丢弃旧 CFI、页码和朗读句索引用于重新定位。内置转换文档的修订含转换协议与文本编码；不同 Calibre 版本的 CFI 不保证一致。已有标注继续保留，原位置可能失效。

Mac 阅读器与内置 Apple Books 同步服务已使用本格式。Apple Books 的虚拟设备有独立安装 UUID，允许附加 `deviceName: "Apple Books"`、`deviceType: "apple-books"`；阅读器忽略未知描述字段。其本机备份位于 `libraries/<library-hash>/apple-books/sync.json`，只发布自己的设备文件。

`reading.source` 可标注 `apple-books`、`apple-books-ack` 或 `apple-books-user-confirmed`，作为追溯信息，不替代时间戳冲突规则。回写确认保留原云端 `updatedAt`，不得用 Books 导航生成的新时间重新发布目标进度；待确认期间暂停该书位置导出。无变化时不重写虚拟设备快照，避免 FSEvents 监听自身写入产生循环。

自动确认要求 Books 保存的目标 CFI 匹配；页面对齐导致 CFI 不同、章首空位置或超时则保留待确认状态，可人工核对后确认、重试或取消。关闭 Books 窗口可能是落库条件。只有同修订 EPUB 的 CFI 回写；PDF、百分比、status 和 marks 不反向注入 Apple Books。详见 [Mac 同步实现](MAC.md)，此文件不是 Apple 官方数据库格式。

## 0.4.0 接续细节

0.5.0 增加以下独立状态；其余 v1 格式保持兼容：

```json
{ "lifecycle": { "deleted": true, "updatedAt": "2026-10-25T12:00:00.000Z" } }
```

`lifecycle` 按与 `reading` 相同的时间戳规则单独合并。删除保留原文、进度和标注；恢复写入更新的 `deleted:false`。旧进度或普通收藏更新不能复活已删除书；本机打开中的书需先关闭才能删除，另一端删除后阅读器自动返回书库。Apple 原书不删除，已映射的 Apple 源也不能在后台重新导出为活动书。0.4.0 及更早版本忽略此字段，因此参与删除同步的客户端都需升级至 0.5.0。

本机按书库保存 `observed-v1.json`，将有效设备快照与已经看到的最新字段合并。提供程序短暂漏列、返回旧快照或快照损坏时，保留先前状态，包括重启后；该缓存仅供本机恢复，不上传为设备快照。不同书库缓存隔离，不改变设备写入所有权。

- 时间按解析后的实际时间比较，忽略无效时间。同时间戳按递归排序键后的对象 JSON 字符串比较，取字典序较大值，保证枚举顺序不同仍能收敛；本安装连续编辑使用单调递增时间。
- `reading.originDeviceId` 是产生翻页/朗读的安装 UUID，用于区分自己保存与远端更新；旧客户端忽略扩展字段仍可合并。导航确认保留它和原时间。
- 阅读器打开书前刷新；阅读中每 5 秒及聚焦时读取新状态，点击「接着读」恢复。恢复、索引、布局和空闲关闭不发布新进度。
- 局部修改前合并刚到达的快照；自己的云端快照可恢复丢失的本机备份。无变化不重写设备文件。
- Apple 未确认的页首保存作为回声基线隔离；随后独立保存了不同、更晚且发生在提交后的 CFI，可视为新阅读继续导出。这不代表第一跳已精确确认。新远端会话可取代待确认目标；Books 前台时暂缓自动跳转。
- 仅打开 Books 而旧 CFI 未变化时，不提高旧位置时间。完成状态仅在布尔值变化时重新发布，普通阅读不覆盖云端完成标记。
