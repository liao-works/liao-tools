# R13 · 签名更新会话稳定性与发布资产校验

日期：2026-10-14。范围：`liao-works/liao-tools`，仅 `feat/ui-refresh-20261014`，PR #3。

## 本轮发现的真实风险

1. 多窗口/后台自动检查会在 `checkSignedUpdates()` 调用 `clearPendingUpdate()`，将已下载或正在安装的 `Update` 原生资源关闭，导致签名安装中断。
2. 另一个检查请求可能在用户点击下载之前开始，且旧资源被新版本检查替换，形成签名 Update handle 竞态。
3. 即便保留原生资源，如果用户点击「重新检查」，更新中心原来会清空本地 `downloadPath`，造成下载完成后失去安装入口。
4. 原 Release 基础校验接受任意具有可信 URL **前缀** 的链接，未精确比对资产文件名与完整路径。
5. 原 UI 不支持用户主动放弃已经下载的签名更新并重新检查。
6. 新按钮实现中曾有一个 JSX 条件分支括号错误，已根据 CI TypeScript 错误修复并重新验证。

## 已提交改动

- `src/lib/updater.ts`：签名会话状态 `idle/downloading/ready/installing`；在下载与安装进行时，重复检查复用已有资源；安装失败保留会话供明确重试；下载/安装会等待同时进行的版本检查结束，避免 handle 竞态。
- `src/components/UpdateCenter.tsx`：下载后禁用会丢失安装状态的重新检查；新增「放弃当前下载并重新检查」，明确释放旧原生资源后再查询。
- `scripts/verify-release-assets.cjs`：GitHub Release URL 必须与版本 Tag 和资产文件名**完全相等**，不再只依赖 URL 前缀。
- `tests/ui-flow-smoke.cjs`：新增已下载后重复检查、显式放弃并重新检查、检查与下载并发三个 Tauri 桥接场景；明确签名模式不得落回未签名接口。
- `tests/verify-release-assets.test.cjs`：新增同官方域名但错误文件名、额外路径的负例。

## 风险与限制

- 官方 Tauri 插件基于受信任公钥完成真正的签名验证。浏览器模拟的 `plugin:updater` 命令不能证明真实签名验证或 Windows/macOS 安装成功。
- 不自动创建/配置 `TAURI_SIGNING_PRIVATE_KEY`，不修改 `REQUIRE_SIGNED_UPDATER` 的当前状态，不发新 Release。
- 在下一次真实签名 Draft Release 中还需要核对四平台构建的安装包命名与 `latest.json`、测试 UAC、升级失败、重启后的版本。
- 生产发布前继续维持 Draft PR #3。

## 可追溯的回归测试

- UI Frontend Validation：TypeScript + Vite 与发布脚本单测。
- UI Refresh Visual Smoke：带模拟 Tauri 桥接的完整页面行为；签名更新包含会话生命周期回归。
- Windows Tauri Compile：Rust 原生编译和 updater Rust 单元测试。
- Tax snapshot checks：税率快照测试与更新器页面改动隔离，继续保持通过。

> CI 的实际结果必须以最新提交的 GitHub Actions 为准；旧提交通过不代表新代码已验证。

官方参考：https://v2.tauri.app/plugin/updater/ 。
