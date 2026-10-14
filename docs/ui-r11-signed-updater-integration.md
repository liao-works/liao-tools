# R11 · 官方 Tauri v2 签名更新运行时接入

## 本轮已实现

### 1. 客户端插件与锁文件
- `src-tauri/Cargo.toml` 引入 `tauri-plugin-updater` 与 `tauri-plugin-process`。
- `package.json` 引入 `@tauri-apps/plugin-updater` 与 `@tauri-apps/plugin-process`。
- `pnpm-lock.yaml` 和 `src-tauri/Cargo.lock` 已在隔离的 GitHub CI Runner 中完成**真正的依赖解析**并提交；正式构建恢复 `--frozen-lockfile` 与 `cargo --locked`。
- `src-tauri/src/lib.rs` 通过官方 Rust 插件注册 `tauri_plugin_updater::Builder::new().build()`。只有发布构建配置里存在受信任的公钥时才初始化，不会影响尚未配置密钥的本地构建或已发布的旧版。
- `src-tauri/capabilities/default.json` 授权 `updater:default` 和 `process:allow-restart`，避免授予额外权限。

### 2. 更新渠道严格隔离
`src/lib/updater.ts` 对旧调用方保持相同的导出 API，通过 Rust `signed_updater_available` 判断是否存在编译时配置的公钥：

| 渠道 | 检查 | 下载 | 验证 | 安装 |
|---|---|---|---|---|
| **签名渠道** | 官方 `check()` | `Update.download()` | 官方 Tauri updater 的签名验证 | 用户确认后调用 `Update.install()`，macOS/Linux 允许手动重启 |
| **当前兼容渠道** | Rust `check_for_updates` | 官方 GitHub Release | R9 的 URL、版本、文件大小与 SHA-256 | 用户确认后启动经验证的系统安装程序 |

**安全边界**：签名渠道检测到更新时，不会回退到未签名 Rust 下载/安装命令。两种渠道都不会无人确认自动安装。签名渠道的安装使用官方 Tauri updater 资源，下载安装阶段必须保持更新会话有效，不可任意替换 URL。

### 3. 更新中心
- `UpdateCenter.tsx` 展示「官方签名更新」或「校验下载 · 手动安装」的明确渠道。
- 签名版从官方插件下载/验证、显示进度、由用户明确点击安装；安装后的 macOS/Linux 显示手动重启入口。
- 不把「安装包已打开」与「实际升级完成」混为一谈。
- 有更新时先提醒，用户可推迟；启动时周期检查仍受用户偏好和最近成功检查时间控制。

### 4. 已有 R9/R10 发布协议
- R10 `scripts/prepare-signed-release.cjs` 会在发布工作流中，当 `REQUIRE_SIGNED_UPDATER=true` 时检查真实插件接入、公钥及私钥等条件，并临时生成签名构建配置。
- 签名发布物包括 Windows NSIS/MSI 的 `.sig`、macOS `.app.tar.gz.sig` 与对应 `latest.json`，缺文件保持 Draft Release。
- 正式发布始终需要可信的密钥：`TAURI_SIGNING_PRIVATE_KEY` （Actions Secret）和 `TAURI_UPDATER_PUBLIC_KEY` （Actions Variable）。私钥绝不提交仓库。
- `createUpdaterArtifacts=true` 只在密钥门禁通过时生效；普通构建的签名渠道不会被伪开启。

## 已自动验证 / 未自动验证

- Node 单测：HS Code、发布资产、签名清单和签名预检。
- 浏览器模拟 Tauri 桥接：关税、Alta、Excel、UPS/DPD、Amazon、旧版升级和**签名渠道严格隔离**；签名测试断言调用官方 `plugin:updater|check/download/install`，而不是旧版未签名命令。
- Windows Tauri Rust compile / updater Rust tests：GitHub Actions 检查。
- **尚未验证**：签名证书和客户端公钥是否配套、跨版本真实签名安装、Windows UAC、Intel/Apple Silicon macOS 重启确认，以及下载/验签失败在实机上的错误恢复。

## 正式启用前的必要步骤

1. 在可信的维护者设备生成并**离线备份** Tauri updater 公私钥，不要在聊天中发送私钥。
2. 分别设置仓库 Actions Secret `TAURI_SIGNING_PRIVATE_KEY`（及可选密码）和 Variable `TAURI_UPDATER_PUBLIC_KEY`。
3. 先对测试分支/测试发行版生成全平台正式签名更新包，核对它们是否符合脚本的命名约定。
4. 确认本次升级的旧版客户端是否拥有受信任公钥。**已发布的 0.0.13 未集成官方签名插件，不能假设能直接执行插件式签名升级**；可先通过当前已验证安装器完成一次过渡版本的更新。
5. 测试版完成 Windows/macOS 正向升级、损坏签名拒绝、安装失败、重启版本检查后，再由维护者显式设置 `REQUIRE_SIGNED_UPDATER=true`。
6. 通过全部真实安装验证后再评估合并 PR #3。当前保持 Draft。

参照官方文档：https://v2.tauri.app/plugin/updater/ 和 https://v2.tauri.app/plugin/process/ 。

_Last updated: 2026-10-14._
