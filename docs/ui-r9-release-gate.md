# R9 · 应用升级生产门禁与验收记录

## 本轮实际代码

### 更新器安全
- `src-tauri/src/commands/updater.rs` 的下载和安装共用异步互斥锁，阻止主窗口与弹窗同时对同一个下载目标进行读写。
- 下载时，先核对官方 GitHub Release 当前版本、当前 OS/CPU 架构对应 URL 和发布摘要，再写临时 `.part`，通过完整 SHA-256 和文件大小验证后才重命名。
- **安装前再独立拉取一次官方 Release 元数据**：不能仅信任本地可写的 `.sha256` sidecar。验证本地文件 SHA-256、官方摘要、大小、版本与目标文件名全部一致才允许打开。
- 仍只开放用户明确确认的系统安装流程，禁用无人值守静默执行。macOS DMG 仅视为「已打开」，不宣称已经替换应用。
- GitHub 更新服务对超时/连接错误/5xx 做一次有限重试，403/429 统一明确提示为访问频率受限。
- 新增 Rust 用例：架构匹配、非法摘要、文件 SHA-256、安装包版本、哈希或大小被替换时拒绝安装。

### 发布闭环
- `.github/workflows/release.yml` 仅允许 `vMAJOR.MINOR.PATCH` 稳定标签触发可发布构建，手动在普通分支运行会拒绝发布。
- GitHub Actions 的多平台构建先上传到 **Draft Release**。
- 全部构建成功后，`verify-and-publish` 对 Windows x64 NSIS/MSI、macOS ARM64/Intel/Universal 的文件名、非零大小、GitHub SHA-256 与 Release URL 逐项校验，通过后才发布。
- 取消 Release 工作流对 `master` 的自动 push。CHANGELOG 仍由生成脚本在当前 job 内生成，用于 Release Notes。
- `scripts/verify-release-assets.cjs` 为纯函数检查器，`tests/verify-release-assets.test.cjs` 覆盖缺包、重复包、无摘要、外部 URL 与非法标签。
- 对安装前的 Rust 安全测试启用 Windows `cargo test --lib commands::updater::tests`。

## 验收矩阵

| 场景 | 自动检查结果 / 目标 |
|---|---|
| UI TypeScript + Vite | CI 通过 |
| 关税、Alta、Excel、UPS/DPD、Amazon、应用更新 | 浏览器模拟 Tauri 桥接的业务冒烟 |
| 非法、旧版、跨架构、被替换安装文件 | Rust 单测拒绝 |
| 任一目标平台缺少安装包或 SHA-256 | 发布流程保持 Draft |
| 普通分支手动触发 Release | 标签校验失败，不发布 |
| Windows Rust/Tauri | 由 Windows GitHub CI 真实编译和运行 Rust 更新器单测 |
| Windows 10/11 安装程序 UAC、升级和重启 | **尚需实机验收** |
| macOS Intel / Apple Silicon 的 DMG 覆盖升级 | **尚需实机验收** |
| GitHub 签名发布物 | **尚未启用 Tauri 官方 updater 数字签名** |

## 关于完全自动安装

现阶段实现的是**后台发现新版 + 有新版本时提醒 + 用户确认下载 + SHA-256 完整性验证 + 再次核验最新官方摘要 + 打开系统安装程序**。SHA-256 不能替代信任根中的发布者签名；也不意味着安装完成。无签名、无交互的自动安装仍不开放。

要启用 Tauri 官方 updater：
1. 参照 https://v2.tauri.app/plugin/updater/ ，使用可信环境生成签名密钥对。
2. 将**私钥**和口令仅配置在 GitHub Actions Secrets 中，不提交仓库、不放入客户端；将公钥加入 Tauri updater 配置。
3. 生成 v2 的 `createUpdaterArtifacts`、对应 `.sig` 文件和 `latest.json`，并配置安全的 HTTPS endpoints。
4. 在安装过已签名发行版的 Windows、macOS 用户设备上验证下载签名、失败中断、安装、重启后的版本确认及回滚/降级策略。
5. 以上全部满足之后，再迁移当前人工确认安装机制；不要混用未经验证的签名资源。

**注意**：GitHub Release 资产的 SHA-256 和本轮 Draft 门禁是额外的完整性措施，不能声称已经实现签名自动更新。

## 发布前不可跳过
- 将 PR #3 保持 Draft，不合并主分支。
- 复核最新 Windows Rust 编译与更新器测试结果。
- 使用一个高于 `v0.0.13` 的**测试发布版本**完成双平台真实升级验证，且测试 Release 不应投放正式用户。
- 明确 Windows 安装器是否保留用户数据、正在打开的 Excel 文件如何处理。
- 正式签名更新方案完成安全评审后再考虑无人值守升级。

_Last updated: 2026-10-14._
