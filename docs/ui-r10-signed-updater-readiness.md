# R10 · Tauri v2 签名更新准备与发布门禁

## 当前成果

在未配置真实签名密钥、未接入官方 `tauri-plugin-updater` 的情况下，项目仍使用 R9 的**自动发现 → 用户确认 → 验证 GitHub Release SHA-256 → 打开系统安装程序**。本轮新增的是**签名更新的构建与发布准备机制**，并未把未签名包冒充已签名更新。

### 1. 生成 Tauri v2 静态更新清单
- `scripts/build-signed-updater-manifest.cjs`：接收稳定版本 Tag、Release 资产 JSON、实际 `.sig` 文件目录，拒绝无摘要、外部地址、缺失签名、跨平台缺包及重复包，写入 Tauri 的 `latest.json`。
- 目标平台为 `windows-x86_64`、`darwin-x86_64`、`darwin-aarch64`。
- Windows 优先选择签名的 NSIS 安装包，若未提供则回退到签名的 MSI；macOS 分别提供 Intel 和 Apple Silicon `.app.tar.gz` 与相应 `.sig`。
- `signature` 字段写入签名文件**内容**，不是路径。
- 清单仅检验元数据和文件配对；实际 Minisign / Ed25519 验签由客户端的官方 Tauri updater 在使用公钥安装之前执行。**不能仅凭此脚本声称签名有效。**

CLI：
```sh
node scripts/build-signed-updater-manifest.cjs v0.0.14 ./release-assets.json ./signed-assets ./latest.json
```

注意：CLI 需要真实发布资产元数据和签名文件，不会从示例凭空生成可使用的私钥或签名。

### 2. 故障封闭的 Release 构建准备
- `scripts/prepare-signed-release.cjs`：签名模式未启用时不改变客户端配置。
- 当仓库 Variable `REQUIRE_SIGNED_UPDATER=true` 时，在构建前必须同时提供 `TAURI_SIGNING_PRIVATE_KEY`（Actions Secret）、`TAURI_UPDATER_PUBLIC_KEY`（公开仓库 Variable），且应用中存在官方 Rust/JS updater 依赖以及 Rust 插件真实注册代码。
- 不满足条件的签名模式**直接失败**，不会回退到非签名发布，也不会将密钥内容写入配置或日志。
- 满足所有条件时临时在 runner 的 `tauri.conf.json` 中设置 `bundle.createUpdaterArtifacts=true`、受信任公钥和 GitHub `latest.json` HTTPS 地址；不会写回 `master`。
- 发布工作流 `release.yml` 将签名私钥传入 Tauri Action 的临时进程环境，不将私钥提交至仓库。

### 3. 发布门禁
- 仅当 `REQUIRE_SIGNED_UPDATER=true`，`verify-and-publish` 才执行额外的 `checkSignedReleaseAssets()` 验收：要求 Windows/macOS 各平台更新归档、配对 `.sig` 以及 `latest.json` 全部存在且有 Release 提供的 SHA-256。
- 与 R9 的基础五件安装包验证同时保留。
- 签名校验、构建失败或平台缺包都会使 Release **保持 Draft**，防止对普通用户公开不完整的版本。
- 需要确认首次真实签名发布时 Tauri Action 实际输出的文件名与脚本映射完全一致；若有版本差异，应以真实构建产物修正适配规则，不能放松完整性检查。

### 4. 本轮测试
- `tests/build-signed-updater-manifest.test.cjs`：平台清单、缺包、缺签名、非法签名字段、来源 URL、重复包和 Windows MSI 后备。
- `tests/prepare-signed-release.test.cjs`：关闭签名模式不更改配置、缺密钥、公钥缺失、未接入插件以及正确配置路径。
- `tests/verify-release-assets.test.cjs`：原有基础包检查和新增签名元数据发布门禁。
- 三组 Node 测试纳入 PR 前端 CI，仍保留 Windows Rust 与 Chromium 回归。

## 尚未完成的正式签名升级

下一阶段必须由仓库维护者在可信环境生成 Tauri 签名密钥对：
```sh
pnpm tauri signer generate -w ~/.tauri/liao-tools.key
```
1. **私钥**和口令只应存于受权限保护的 GitHub Actions Secrets 与安全备份，绝不上传给聊天或提交到仓库。**公钥**可设置为 `TAURI_UPDATER_PUBLIC_KEY`。
2. 添加并锁定官方 Rust `tauri-plugin-updater`、JS `@tauri-apps/plugin-updater`，完成实际插件注册与授权；必须同时更新并提交 `Cargo.lock`、`pnpm-lock.yaml`。
3. 将现有更新中心的下载/安装接口在启用签名模式时切换到官方 updater 的签名校验调用。默认和兼容旧版本时依旧使用 R9 的用户确认流程。
4. 先在隔离的测试 Release 中生成签名更新包与 `latest.json`，验证 Windows x64、Intel macOS、Apple Silicon macOS 各平台真实升级、安装失败及重启后版本确认。
5. 所有签名验收通过后，再设置 `REQUIRE_SIGNED_UPDATER=true`。**当前不应打开该标志**，否则 CI 会按设计拒绝发布。

官方依据：https://v2.tauri.app/plugin/updater/ 。

## 不可提前合入
- Windows Tauri 编译、浏览器测试和发布清单单测不等于完成跨版本安装实测。
- 未经过公钥验证的签名字段不能被当作有效签名。
- 保持 PR #3 为 Draft，继续在 `feat/ui-refresh-20261014` 上迭代。
