# Reader state v1

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

每本书的 `reading`、`preferences`、`status` 是独立带时间戳的对象。合并所有有效 v1 文件时，各对象选择 `updatedAt` 较新的值。`marks` 各 UUID 分别选择较新的值，`deleted: true` 是删除墓碑，不能丢弃。未知版本跳过，不能以空对象覆盖它。损坏文件会提示，并继续读取其他有效设备文件。书籍 ID 以 exporter 的 `asset_id` 为准。

时间戳均应规范化为 UTC ISO 8601 毫秒格式，设备时钟应校准。冲突解决是整个字段对象的后写优先，并非字符级 CRDT；两台离线设备同时更新同一阅读位置，较晚的时间戳优先。同一 `status` 或 `preferences` 对象上的并发细项修改仍可能互相覆盖。每台设备先将合并所得对象与本次修改组合，再写入自己的快照。

写入先保存本机 `libraries/<library-hash>/state-v1.json`，使用唯一临时文件与 rename 原子替换；Windows 文件短暂被占用时重试。然后同样写入设备同步文件。云盘故障不会删除本机备份，启动后与每 30 秒重试。`config.json` 保存设备 ID、目录、语音和字幕设置；字幕窗口位置是本机专属信息。新版书库的书籍 ID 来自 catalog v2，布局见 [云端书库协议](CLOUD_LIBRARY.md)。

`contentRevision` 与当前正文修订不同则保留百分比，丢弃旧 CFI、页码和朗读句索引用于重新定位。内置转换文档的修订含转换协议与文本编码；不同 Calibre 版本的 CFI 不保证一致。已有标注继续保留，原位置可能失效。

未来 Mac 阅读器只需实现本格式即可共享进度。要向 Apple Books 写回还需要另行开发 Mac 导入器，不能把此文件当成 Apple 官方数据库格式。
