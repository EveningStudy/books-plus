# Books+ 0.5.0 双机验收与发行条件

[文档首页](README.md) · [发行检查](RELEASE.md) · [图文使用指南](USER_GUIDE.md)

日期：2026-10-25。基于 `5c71311`，工作分支 `codex/delete-auto-update`。本轮为 0.5.0 功能验收。

## 已实现

- 图书更多菜单 → 删除确认 → 最近删除 → 恢复。删除是可恢复的状态变更，保留原书文件、进度和批注，不回写或删除 Apple Books 原件，也不释放正文占用空间。
- 设置 → 软件更新：启动 15 秒后及每 6 小时检查，自动检查与自动下载可分别关闭；下载进度、失败重试、版本提醒，显式保存并重启安装。退出时等待阅读器保存、书库、导入、下载及设置队列。
- Windows 提供 NSIS 安装版与便携版；便携版的更新会安装为安装版并共用原配置路径。尚无更新器的旧版本需要首次手动安装 0.5.0。
- Mac 自动安装仅对 Developer ID 签名构建启用；本轮 ad-hoc 包只检查版本和打开官方发布页，界面明确显示限制。
- 删除状态独立合并，不被普通进度更新复活。修复目录侧文件重复 ID，以及云盘暂时漏列/回放旧设备文件导致已观察状态回退；本机恢复缓存按书库隔离。

## 测试边界

使用 Windows x64 和用户的 Apple Silicon Mac（macOS 15.7.9），通过已授权 SSH 执行测试。图书及进度的跨端传输由真实云盘客户端完成；SSH 只传程序、测试指令和结果。所有新测试均使用独立书库与合成文本、EPUB、PDF 等，不修改个人原书和已有配置。iPhone 按用户要求排除。

Browser plugin not available。Electron 界面使用仓库 Playwright 测试，走真实渲染与 IPC；仅替换原生文件选择器的返回路径。没有把 API 返回成功当作界面已通过。

## 已取得的结果

| 项目                     | 方法与结果                                                                                                                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 单元与协议               | Windows、Mac 各 71 项通过；包含离线保存与重启、恢复、旧进度不能复活、相同时间收敛、损坏 JSON、修订不符、书库隔离、更新失败和下载校验路径                                                                                    |
| Windows / Mac 打包阅读器 | EPUB 导入与阅读、PDF 翻到第二页、TXT/Markdown/FB2 转换后实际渲染；翻页、书签、远端接力及无回声保护；删除确认/取消/恢复、更新设置无渲染异常                                                                                  |
| Google Drive 双机        | Windows 导入，Mac 校验原文 SHA-256 并读取；Mac 进度/书签 → Windows；Windows 新进度与书签墓碑 → Mac；Mac 删除 → Windows 恢复 → Mac 确认；通过                                                                                |
| iCloud Drive 双机        | 同上完整闭环通过，首次逐步等待约 6–27 秒；仅为此次测量，不是延迟保证                                                                                                                                                        |
| OneDrive 双机            | 首轮与首次重试超时，Windows 客户端原先未运行，启动后仍有同步挂起/排队；保留失败记录。待文件完整到达后，继续原测试书完成全部五个跨端步骤，校验一致，通过                                                                     |
| 两台客户端同时阅读       | Google Drive、iCloud、OneDrive 的两台真实打包客户端：Windows 翻页 → Mac 恢复并翻页 → Windows 接着读；保持远端 originDeviceId，无回声；Mac 加书签并删除，Windows 正在阅读时返回书库，Windows 恢复后 Mac 重新显示，书签保留   |
| Windows 真实更新         | 带更新器的 QA 基线 0.4.99 → 0.5.0；本机 HTTP 服务提供真实 NSIS。错误 SHA-512 被拒绝且不能安装；更正后重新下载，真正运行安装器并重开新版，书籍 ID、阅读 CFI、书签和设置保留。QA 使用静默安装参数；不是 GitHub 正式源上线验收 |
| Mac 生命周期             | 打包应用 reader/sync 模式、Dock、全部窗口关闭后进程存活、真实 FSEvents 再同步、菜单栏重新打开面板；通过                                                                                                                     |
| Mac 音频与字幕           | 系统语音经 reader-media 静音播放、字幕窗口创建通过。当前隔离配置未安装 Kitten，模型推理跳过；无人工音质评价                                                                                                                 |
| 构建                     | Windows NSIS/portable、Mac arm64 DMG/ZIP 与更新清单生成成功；Mac codesign 完整性验证通过，但无 Developer ID / 公证                                                                                                          |
| 依赖                     | 本轮 npm audit 无已知漏洞；不是第三方服务永久可用保证                                                                                                                                                                       |

## 发现并修复

1. 删除是独立 `lifecycle` 字段，避免新阅读时间把删除冲掉；保留恢复所需内容。
2. 正在阅读时收到远端删除，清空活动书状态并释放阅读占用；陈旧保存被拒绝。
3. 已删除的 Apple 映射不再导入、跳转或重新导出为活动书。
4. 侧文件按稳定 ID 覆盖基础目录，旧侧文件墓碑同样生效。
5. 云盘短暂缺文件/旧快照不能撤销已观察的较新状态；增加 `observed-v1.json`，重启和切换书库有回归覆盖。
6. 新检查失败后清空旧更新目标；校验失败禁止安装；事件优先于较早发起的界面状态查询。
7. Mac codesign 的 AMFI 对 CRLF 权限文件解析失败：统一 plist 为 LF，并加入 Git 换行规则；重新构建成功。
8. 截图复核发现更新页混入字幕设置，收紧页签渲染条件，并增加页签切换与内容隔离检查。
9. Mac 更新清单的默认安全文件名与带加号产物名不一致：改用统一 ASCII 文件名，新增 verify-release.cjs 检查实际文件名、尺寸、SHA-512 和 blockmap，并在 CI 执行。
10. 更新器底层异常包含响应头/堆栈：改为简短中文提示，增加错误不泄露内部信息的回归测试。
11. Mac 热点网络的原 DNS 无法解析域名；备份后改为可用 DNS，网络和依赖下载恢复。原设置与具体环境信息仅存在私人 QA 目录。

## 复现入口

```sh
npm test
npm run build
npm run package:win
npm run package:mac:dmg
npm run test:desktop
npm run test:mac
npm run test:providers
node scripts/verify-release.cjs
```

`BOOKSPLUS_TEST_APP` 可将 `test:desktop` 指向已构建的应用可执行文件。Mac 命令在 Mac 执行。`test:providers` 是同机提供程序目录验收，不替代双机测试。

真实双机测试需要私有配置 JSON，包含 `host`、`key`、`macNode`、`macRepo`、`evidence`、`run`、`timeoutMs`，以及 `providers:[{name,windows,mac}]`。两端文件夹必须指向同一云端位置，末级目录以 `BooksPlus QA ` 开头。

```sh
node scripts/test-two-host.cjs /path/to/private-config.json
node scripts/test-cloud-ui.cjs /path/to/private-config.json
```

后者针对配置中的第一个提供程序及前者完成的合成书库，驱动两台真实打包应用。`test-cloud-stage.cjs` 和 `test-cloud-ui-peer.cjs` 需随代码部署至 Mac。

Windows 升级验收：先用 `electron-builder --win nsis --x64 --publish never --config.extraMetadata.version=0.4.99 --config.directories.output=.qa/update-baseline` 构建测试基线，安装至 `.qa` 下的独立目录，然后执行 `node scripts/test-update-install.cjs .qa/<install-dir>`。目标安装包来自 `release/BooksPlus-Setup-0.5.0-x64.exe`；仅测试代码注入 localhost 源，正式程序没有开放自定义更新源 IPC。

原始结果和截图保留在 Git 忽略的 `.qa/`。不得把个人目录路径、设备地址、账号、私钥或私人快照提交到仓库。

测试云盘目录在核对书库身份及原文哈希后已归档至本机并清理，Mac 端也确认清理同步到达。

## 发行前仍需完成

1. **Mac Developer ID 签名及 Apple 公证。** 目前本地完整性签名通过，无法宣称 Gatekeeper 首次安装或 Mac 自动安装更新已通过。需发行者提供证书/公证配置，并用真实签名包完成一次更新。
2. **正式发布源。** 将 Windows NSIS、portable、`latest.yml` 和 blockmap，Mac ZIP/DMG、`latest-mac.yml` 及 blockmap 与同一正式 GitHub Release 一起发布，再从真实旧安装完成线上检查、下载、安装。当前不把 localhost 更新等同于正式源验收；CI 已保留这些产物。
3. **兼容范围。** 本轮实际 Mac 为 arm64，Intel Mac 未实机验收；旧客户端会忽略删除字段，所有参与设备必须升级。iPhone 未参与，PDF/批注/状态向 Apple Books 反向写入仍不支持。
4. **额外覆盖。** 没有声称通过长期睡眠/唤醒、多日大规模书库压力、所有外部转换器、所有云盘账号或人工听感测试。Windows 安装包未签名，会有发行信誉/系统提示问题。
5. **文档拍摄发现的布局问题。** EPUB 打开侧栏后，部分情况下正文未随可用宽度重新排版，可能被截断；实际调整一次窗口大小可恢复。文档截图使用该操作恢复布局，未修图。此问题尚未修复，见[排查说明](TROUBLESHOOTING.md#打开-epub-侧栏后文字被截断)。
6. **文档拍摄发现的快速退出问题。** 接受 EPUB 远端跳转后立即返回书库，偶发 epub.js `Cannot read properties of undefined (reading 'content')` 异步清理异常；拍摄中仍可继续打开 PDF / 设置。等待目标章节载入后再返回可规避本轮触发路径，尚未修复根因，不能将截图流程通过视为快速退出可靠性已通过。

最后一轮全新书库重跑三种提供程序均通过：Google Drive 每步约 15–27 秒，OneDrive 约 6–15 秒，iCloud 约 6–27 秒。首轮 OneDrive 超时保留，不能用最终通过覆盖历史故障。Mac 系统实查为 0 个有效代码签名身份。

结论：新增功能已实现并取得 Windows/Mac、三种真实云盘与 Windows 原生升级证据，签名、公证和正式源更新的验收情况见上表。
