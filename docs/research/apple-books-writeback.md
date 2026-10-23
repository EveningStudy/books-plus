# Apple Books 回写调研（本机实验）

日期：2026-10-23（Europe/London）。范围：Mac 本机新书导入和 EPUB 阅读位置；不含批注、读完状态、PDF、DRM 或其他 Apple 设备的同步验证。

## 结论

**可做用户主动触发的 EPUB 回写：用正常打开文件导入，用 `ibooks://assetid/<Apple asset ID>#epubcfi(...)` 定位，让 Books 自己保存位置。** 本机已实际跳到第二章、第三章和章内段落；第三章位置在 Books 退出、重新启动后仍恢复，数据库的阅读进度也更新。无需直接写 Apple 数据库。

这是单台 Mac、一本自制 EPUB 上成立的 PoC，不能据此保证任意 EPUB、Books 版本或跨设备 iCloud 同步可靠。建议作为实验功能，以“在 Apple Books 中继续阅读”按钮提供，暂不作为后台自动同步服务。

| 路线 | 本次结果和证据等级 | 可靠性判断 | 用户打扰 | 风险 |
| --- | --- | --- | --- | --- |
| `open -a Books` 导入 | **实测成功**：测试书可读，产生唯一书目和 Apple asset ID | 本机可用；重复同一文件未新增书目，不能推广到不同修订 | 打开/切换 Books，可显示导入窗口 | Books 可能将新书交给其 iCloud 同步；重复、格式和映射需检查 |
| NSWorkspace 导入 | **实测提交成功**，同一本书仍为一个书目；出现过空白 Books 窗口，asset 链接可重新打开 | 事件成功不等于导入/渲染完成，需后验确认 | 同上 | 相同文件重复导入的 UI 不稳定 |
| asset ID + CFI 深链接 | **实测成功**：章节、章内定位、进度保存及一次退出重启恢复 | 首选实验路线；无已确认的公开稳定 CFI URL 契约 | Books 切到前台并改变阅读位置 | 错误映射/修订会跳错；会更新阅读时间、最近打开等状态 |
| AppleScript | **通用打开命令实测返回** `missing value`；属性查询未在限定时间返回；未证明能设置进度 | 不适合独立进度接口，通用 open 没有优于 Launch Services 的证据 | 可能有自动化授权弹窗 | 权限依发送进程而异；脚本无有用返回值不代表业务完成 |
| 快捷指令 | **实测静态检查**本机 App Intents 元数据；有打开、关闭和前后翻一页，无直接设置 CFI/百分比动作 | 可包装打开/翻页；直接定位能力未证实；未创建或执行新快捷指令 | 需要用户配置，可能打开前台 Books | 动作可见性和参数随系统变化 |
| 辅助功能 UI | **实测成功**：唯一文本搜索并点击结果；右键盘方向键翻页；只读快照进度变化 | 可作交互备用；工具栏隐藏、元素失效、菜单状态使自动化脆弱 | 持续占用前台、输入焦点和窗口 | 搜索歧义、页码随排版变化、误操作；需要限定目标书并验证结果 |
| 直接改数据库 | **仅只读实测结构与变化，未直接写入** | 不推荐；本次无必要进入写实验 | 可能需退出 Books、恢复备份和额外权限 | Core Data、WAL、多库状态、云同步冲突及覆盖风险，尚无可证明正确的写事务 |

“可靠性判断”和风险因果分析包含推断；表中标明的操作和观察才是实测。

## 环境、安全和备份

- macOS 15.7.9 (24G830)，Books 7.6；开始时 Books 主进程未运行。
- 获取 `EveningStudy/books-plus` 后阅读 `docs/CLOUD_LIBRARY.md`、`docs/SYNC.md`；同时检查本机 `../books-icloud-exporter` 的只读导出代码。本次未修改导出器。
- 开始 Books 实验前，以 `ditto` 复制 12 个相关容器（含扩展），包括 `~/Library/Containers/com.apple.iBooksX`、`com.apple.BKAgentService`、`~/Library/Group Containers/group.com.apple.iBooks`。复制保留元数据、符号链接及现有 WAL/SHM，不跟随容器内符号链接复制外部目录。
- 备份：`~/Library/Application Support/BooksWritebackResearch/20261023-214536/`，目录权限 0700；`manifest.json` 记录来源及文件数量。1,292 个普通文件在复制后逐一比较 SHA-256，一致。备份属于私有本机资料，不提交 Git。
- **备份边界**：这是容器备份，并未备份符号链接指向的整套 iCloud 书籍原文，也未在原库做破坏性恢复演练；不能称为整个 iCloud 书库的原子快照。新测试书导入后的云端新增不会被本地容器恢复自动撤销。
- 仅导入/定位自己生成的测试书；未对已有书执行翻页、搜索、导入或位置修改。普通 Books 操作会由 Books 自身落库。
- 未执行 SQL UPDATE/INSERT/DELETE、修改 Apple 私有文件或云端协议文件。源库用 `mode=ro` 打开，再用 SQLite backup 读入内存；查询输出只保留测试书。
- 未授予新的系统权限。AppleScript 前已征得用户允许触发系统提示；命令返回时工具未观察到新提示。已有 UI 通道可用，未改系统辅助功能设置。
- 未 git push。测试书保留供复核，未自动删除，避免传播云端删除。

## 测试书与身份映射

生成器和 PoC：`scripts/research/apple-books-writeback.py`。

- 标题：`BooksPlus Writeback Test a356504b`
- EPUB identifier：`urn:uuid:a356504b-8fa9-420f-92d8-97c337c90e39`
- 本次源 EPUB SHA-256：`6a6d6bb19381c450345e11893f233a62801a58027e43ef0ff28d60dbadc96fd0`
- 本次 Books asset ID：`A1F37D34861F942908A55CDB5CDD1166`
- 三个章节各有 60 段原创合成文字，唯一标记 `WRITEBACKTARGET1` / `2` / `3`；观察到共 36 页。

**云端 UUID、EPUB identifier 和 Apple asset ID 是不同字段。** 本次通过只读 `ZBKLIBRARYASSET.ZEPUBID` 与测试书标题共同匹配 Apple asset ID。不能把云端新书 UUID 直接填入 asset URL，也不能按标题单独匹配。一般书籍可能没有唯一 EPUB identifier；生产服务需要导入前后差集、正文修订校验和明确的人工消歧，不应猜测。

## 按侵入程度的实验记录

### 1. 正常导入

运行 `open -a Books <自制 EPUB 路径>`，Books 打开第一章，辅助功能树显示唯一标记、第 1 页（共 36 页）。导入前标题精确查询为 `[]`，导入后为一个记录。`ZEPUBID` 与生成器一致，Apple 分配独立 asset ID；记录的内容路径位于 Books 自己的 iCloud Documents 目录。这仅证明本机导入，未证明服务器上传完成。

随后用 Swift 调用 `NSWorkspace.shared.open(_:withApplicationAt:configuration:completionHandler:)` 重开同一文件，完成回调返回 `com.apple.iBooksX`。复查仍只有一个测试书记录、asset ID 不变。其间 Books 曾显示空白窗口，发出 asset 链接后恢复测试书。故不以回调/退出码代替业务成功检查；也不承诺 EPUB 改动后的去重行为。

### 2. CFI 深链接

以下链接均由 `/usr/bin/open` 作为单独参数提交，未通过 shell 展开构造：

```text
ibooks://assetid/A1F37D34861F942908A55CDB5CDD1166#epubcfi(/6/6[c3]!/4/4[target]/1:0)
ibooks://assetid/A1F37D34861F942908A55CDB5CDD1166#epubcfi(/6/4!/4/4/1:0)
ibooks://assetid/A1F37D34861F942908A55CDB5CDD1166#epubcfi(/6/4!/4/64/1:0)
```

| 步骤 | UI 实测 | 只读数据实测 |
| --- | --- | --- |
| 初次导入 | 第一章，标记 1，第 1/36 页 | `ZREADINGPROGRESS=0` |
| 第三章带断言 CFI | 第三章，标记 3，第 25 页 | 退出后 `0.6666666865348816` |
| 退出并用无片段 asset URL 重启 | 第三章，标记 3，第 25/36 页；首次退出后检查无 Books 主进程 | 位置已持久化，非仅本次 URL 内存导航 |
| 第二章无断言 CFI | 第二章，标记 2，第 13 页 | 后续快照 `0.3333333134651184` |
| UI 右方向键翻页 | 第二章第 14 页，从第 5 段开始 | `0.3611111044883728`；位置记录见下 |
| 第二章第 30 段 CFI | 第 18 页，页面显示第 27–32 段，包含目标第 30 段 | 本次以 UI 检查定位；不宣称字符级滚动精确 |
| UI 搜索标记 1 并点击 | 第一章标记 1，第 1 页 | `ZREADINGPROGRESS=0`，最高到达进度仍约 66.67% |

翻到第 14 页后，`AEAnnotation.ZAEANNOTATION` 中测试书的 type 3 记录为：

```text
ZANNOTATIONLOCATION = epubcfi(/6/4[c2]!/4/14/1,:0,:1)
ZANNOTATIONTYPE = 3
```

最终复核时已再次确认 Books 主进程退出；用不含 CFI 的 asset URL 重启后，仍显示搜索跳转后的第一章第 1/36 页。最后运行交付 PoC 的 `jump 3`，再次实际跳到第三章标记 3、第 25 页，保留该窗口供复核。

这证明 Books 自身维护位置型记录；`ZREADINGPROGRESS` 和 `ZBOOKHIGHWATERMARKPROGRESS` 也不同，后者不会随倒退到第一章归零。单改一个百分比列不足以重建上述行为，是对直接写库风险的推断依据。

本次只验证点 CFI URL。来自其他渲染引擎的 range CFI、特殊字符转义、错误 CFI、复杂 EPUB、PDF 页码 URL均未验证。章节布局、正文字节和转换器版本改变时不得沿用旧 CFI。

### 3. AppleScript / 快捷指令

Books 包内未找到 `.sdef`，Info.plist 无 `NSAppleScriptEnabled`。本机 `/usr/bin/sdef` 因只安装 Command Line Tools 而报需要完整 Xcode，**该工具报错本身不是 Books 不支持脚本的证据**。

Swift `AEDeterminePermissionToAutomateTarget(..., askUserIfNeeded:false)` 返回 `-1744`，只表示该测试发送进程需要同意，不代表 osascript 或其他宿主具有相同权限。用户允许触发提示后执行：

```applescript
tell application "Books" to open POSIX file ".../BooksPlus-Writeback-Test.epub"
```

返回 `missing value`，退出码 0，工具未观察到新增授权提示。重复打开对象仍为自制测试书。随后 `get properties` 长时间未返回，终止查询进程；后接的 `get books` 未执行。无证据表明 Books 暴露可读写阅读位置的 AppleScript 对象模型；本次也未尝试猜测私有写命令。

读取 Books 的 `Contents/Resources/Metadata.appintents/extract.actionsdata`（JSON）验证：

- 非 assistant-only 动作包括 `OpenBookIntent`、`CloseBookIntent`、`OpenTableOfContentsIntent`、`BookReaderNavigatePagesIntent`（仅单页前/后）、`SearchBooksIntent`（标题/作者），以及主题/字体动作。
- `BookReaderNavigatePageInBookIntent` 是 assistant-only，不应假设可直接当普通快捷指令动作调用。
- 本机元数据中未见接受 CFI、目标百分比或绝对页码的直接进度 setter。
- 已有快捷指令列表可读取，但未执行用户已有快捷指令，未新增快捷指令；因此运行时支持和权限提示仍未验证。用“打开 URL”包装深链接是推断可行，不增加新的进度能力。

### 4. 辅助功能 UI

已有 UI 控制通道可读取测试书文本和页码，无需本次新增权限。实测右方向键把第 13 页变成第 14 页；数据库位置与进度随之变化。

书内搜索第一次通过隐藏工具栏、快捷键/按钮尝试未展开，曾遇到元素 ID 失效及查找菜单暂时禁用。刷新上下文后，从“编辑 → 查找 → 查找…”进入搜索框，输入 `WRITEBACKTARGET1` 并回车，出现“找到 1 个匹配项”；点击结果从第 18 页跳到第 1 页。说明这条路线可行，同时也实际暴露了前台 UI 时序风险。

生产备用方案应由用户主动触发，先核对窗口与目标书，搜索足够独特的原文并让用户消歧；翻页仅作为小范围微调。不可用云端百分比乘当前页数来声称精确恢复 CFI。窗口尺寸和字体变化的回归本次未做；推断页码会随排版改变，需另测。

### 5. 直接写库（未执行）

只读观察 `BKLibrary` 与 `AEAnnotation` 的测试书记录，核实百分比、最高进度、位置型批注和时间字段是分离的。导出器还读取其他共享/云数据存储，但本次未证明它们之间的写入与同步协议。

本次已有可行低侵入路线，因此止于只读分析。没有可审计的官方写入 API、事务和冲突处理依据；直接改 Core Data 表可能被运行进程缓存覆盖，也可能缺少对象版本、云同步标记和相关位置记录。以上属于风险推断，未通过破坏实验验证。

如以后确需继续，必须另行向用户列明具体文件、测试书主键、原值/新值、事务及恢复方法，并获得直接写入许可。不能将容器备份当成自动获准改库，也不能把单机回滚等同于撤销已传播的 iCloud 变更。

## 最小 PoC

首次在另一台 Mac 复现前，先退出 Books 并完成同等范围的容器备份；访问受限时先由用户确认权限。以下为当前已备份机器上的命令，在仓库根目录运行（只针对生成的测试书）：

```sh
python3 scripts/research/apple-books-writeback.py generate
python3 scripts/research/apple-books-writeback.py import
# 等 Books 完成导入并显示测试书，再检查唯一匹配和 Apple asset ID
python3 scripts/research/apple-books-writeback.py inspect
python3 scripts/research/apple-books-writeback.py jump 3
# 应显示第三章 WRITEBACKTARGET3；关闭书/正常退出后再检查进度约 2/3
python3 scripts/research/apple-books-writeback.py inspect
```

`jump` 动态查询测试书的 Apple asset ID，要求标题与固定 EPUB identifier 唯一匹配；不硬编码本机 asset ID。脚本不授予权限、不直接写 Apple 数据库，也不自动处理未知书。命令的 `submitted` 只表示已提交打开事件，必须检查 UI 和持久化结果。输出在被 Git 忽略的 `.qa/apple-books-writeback/`；重新生成 ZIP 可能因 ZIP 时间戳改变文件 SHA，生成器打印当次 SHA。

## 与 Books+ 协议集成的推荐边界（设计建议，未实现）

1. 云端新书仅在用户选中导入后读取正文，校验 catalog 中 SHA；首版只支持原生 EPUB。其他格式先按现有协议生成有固定版本和 SHA 的规范 EPUB，再讨论位置兼容性。
2. 建立本机映射 `{cloudBookId, contentRevision, sourceSHA256, epubIdentifier, appleAssetId}`。Apple 导出书优先保留既有 asset ID；云端新书等待 Books 分配 ID，不改云端 UUID。
3. 合并设备状态后，显示候选时间及当前位置，让用户明确选择“在 Apple Books 中继续阅读”。核对正文修订和身份，再打开点 CFI 链接。修订不匹配则不提交旧 CFI；本次没有可靠的百分比直接 setter。
4. 提交前留存两边快照，提交后确认 UI/只读位置记录。Apple 的百分比和更新时间可能由自身导航重新计算，不应要求等于云端原值。
5. 避免反馈循环：记录操作来源、目标状态散列和已应用版本；仅时间戳后写优先不足以避免导出器把自身回写再当新进度。
6. UI 搜索作为用户可见备用；后台自动跳转会抢焦点、覆盖用户正在阅读的位置，不建议默认开启。
7. 本次不承诺 iCloud 已上传或其他设备收到进度，需另一设备单独验收。批注/status 独立评估。

## 证据和参考

私有本机证据保存在 `.qa/apple-books-writeback/`：`before.json`、`after-import.json`、`after-cfi3-quit.json`、`after-repeat-import.json`、`after-ui-page14-quit.json`、`test-location-evidence.json`、`after-search-quit.json` 及 Swift 实验脚本。带 `quit` 的文件名记录退出请求后的取样；第三章第一次重启与最终搜索位置复核均明确检查过主进程消失，不凭文件名宣称每次都完成进程退出。`NSRunningApplication.terminate()` 曾在 10 秒观察窗内未完成，之后确认进程已退出；退出请求也必须后验检查。本文保留关键测试结果以供代码审查，不提交用户数据库或真实书目。

- [Books+ 云库协议](../CLOUD_LIBRARY.md)、[进度协议](../SYNC.md)：稳定 ID、正文修订、CFI 兼容性和独立设备快照。
- [books-icloud-exporter](https://github.com/EveningStudy/books-icloud-exporter)：本机检查 `books_exporter/common.py`、`records.py` 的路径与只读备份模式。
- [Apple NSWorkspace 打开 URL API](https://developer.apple.com/documentation/appkit/nsworkspace/open(_:withapplicationat:configuration:completionhandler:))：该 API 提交 URL 到应用；业务成功仍需本实验后验检查。
- [Apple 快捷指令用户指南](https://support.apple.com/guide/shortcuts-mac/welcome/mac)：通用动作机制；线上文档可能对应更新系统，本报告具体 Books 动作以本机安装包元数据为准。

CFI URL 的行为依据本机实测，没有将网上未验证描述当作官方支持承诺。
