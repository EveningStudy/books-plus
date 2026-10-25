# 开发与构建

[文档首页](README.md) · [发行检查](RELEASE.md)

## 开发

需要 Node.js 24+ 和 npm；Mac 开发还需 Xcode Command Line Tools，Windows 接口使用系统 PowerShell / .NET。

```powershell
npm ci
npm run dev
npm run build
npm start
npm test
npm run test:desktop
npm run package:win
```

`dev` 启动 Vite 与 Electron。`dev:web` 只有网页界面，没有桌面文件、语音和字幕接口。安装版与便携程序输出在 `release/`。

环境变量：`READER_USER_DATA` 隔离配置，`READER_LIBRARY_ROOT` 指定书库，`READER_MODELS_DIR` 指定模型目录。升级保留 `%APPDATA%/icloud-books-reader` 配置；模型默认 `%LOCALAPPDATA%/BooksReader/models`。

Mac 构建与隔离验收：

```sh
npm run package:mac         # 自动编译 Swift helper，生成 Books+.app
npm run test:mac            # 已打包应用的隔离验收
npm run package:mac:dmg     # 拖到 Applications 的 DMG
```

Mac 配置在 `~/Library/Application Support/icloud-books-reader`。本次为 Apple Silicon 构建，已实机运行；使用 ad-hoc 本地签名，尚无 Developer ID 签名与 Apple 公证。公开分发前需配置自己的签名证书与公证。Intel / universal 包未构建验收。

## 验收入口

`npm test` 为单元 / 协议测试；`test:desktop` 驱动真实 Electron 界面；`test:mac` 在 Mac 验收已打包应用；`test:providers` 为同机提供程序目录测试，不能代替双机真实传输。

使用 `BOOKSPLUS_TEST_APP` 指定 `test:desktop` 的已打包应用路径；更完整的双机与实际升级脚本、私有配置要求见[0.5.0 报告](TESTING-0.5.0.md#复现入口)。不要把包含地址、私钥位置、个人路径的 QA 配置提交仓库。

```sh
node scripts/verify-release.cjs
node scripts/check-docs.cjs
```

## 文档与截图

```sh
node scripts/capture-docs.cjs
node scripts/draw-docs.cjs
node scripts/check-docs.cjs
```

捕获脚本使用真实打包应用、全新示例书库和临时配置。Windows 默认读取 `release/win-unpacked/Books+.exe`；Mac 传入 `BOOKSPLUS_DOCS_APP` 并追加 `--mac`。封面为原创 SVG 渲染，流程图为代码生成；不修改截图像素。

需要 Playwright、Windows Edge / Mac Chrome，以及 Windows 的 D 盘演示目录。脚本不会读取个人 Apple Books，也不连接真实云盘。图片索引、重拍条件与已知布局问题见[素材说明](assets/README.md)。
