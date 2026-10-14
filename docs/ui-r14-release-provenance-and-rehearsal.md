# R14 · 受审查发布、离线发版演练与 macOS 原生验收

日期：2026-10-14。项目：`liao-works/liao-tools`。分支：`feat/ui-refresh-20261014`，Draft PR #3。

## 背景与本轮结论

R13 的最终提交 `63d6255` 已在前端构建、10 个模拟 Tauri 业务场景、Windows 原生 `cargo check` / updater Rust 单测及关税快照 CI 全部通过。签名更新真实安装仍待维护者签名密钥与 Windows/macOS 设备验收。

R14 的重点不是扩大可见功能，而是提高发布可信度，并增加**不必公开 Release、不接触真实私钥的自动演练**。

## 代码改动

### 1. Tag 来源与发布并发控制

`.github/workflows/release.yml`：

- 仍仅允许稳定标签 `vMAJOR.MINOR.PATCH`。
- 新增明确的 `git fetch origin refs/heads/master:refs/remotes/origin/master --no-tags` 与 `git merge-base --is-ancestor HEAD refs/remotes/origin/master`。
- 两处检查：构建前和发布前。即使用户将尚未合并的功能分支打了版本标签，也不能生成并公开正式 Release。
- 新增 `concurrency`（`cancel-in-progress: false`），对同一 Tag 的发布任务串行化，避免两次运行并发覆盖 Draft Release 资产。
- 发布阶段显式 `fetch-depth: 0`，确保完整祖先信息，防止浅克隆误判。

### 2. 调用真实 CLI 的离线完整演练

`tests/signed-release-cli-rehearsal.test.cjs` 在独立临时目录生成**合成**的 GitHub Release 元数据和 base64 形状的伪签名，用 `child_process.spawnSync` 实际启动：

```sh
node scripts/build-signed-updater-manifest.cjs <tag> <assets.json> <signatures-dir> <latest.json>
node scripts/verify-signed-release-manifest.cjs <tag> <assets.json> <signatures-dir> <latest.json>
```

覆盖：

1. 正确生成并校验三个目标平台的 `latest.json`。
2. 生成后篡改某一个 `.sig`，必须拒绝发布。
3. 清单中版本过期，或安装包集合不完整，必须拒绝发布。
4. ARM64 macOS 缺少签名，必须拒绝生成清单。

这类测试只能验证格式、文件一致性和脚本执行链路，**不会验证伪签名具有密码学效力**。真正验签仍由内置受信任公钥的 Tauri updater 完成。

### 3. macOS 原生 CI

新增 `.github/workflows/ui-r14-macos.yml`，使用 `macos-latest`：

- 依赖 `pnpm install --frozen-lockfile`；
- 真实执行 TypeScript/Vite 构建；
- 真实执行 `cargo check --locked --manifest-path src-tauri/Cargo.toml`；
- 运行 `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib commands::updater::tests`。

这是对已有 Windows CI 的**额外原生目标测试**；它仍不同于构建 DMG / 完成真实安装，也不保证自动覆盖 macOS 双架构。

### 4. 测试和 review 入口

- 前端主 CI：HS Code、发布脚本、流程合同、真实 CLI 演练、Vite 构建。
- 视觉 CI：页面截图与模拟 Tauri 业务/更新测试。
- Windows 原生 CI：编译与 updater 单测。
- macOS 原生 CI：编译与 updater 单测。
- 关税快照 CI：业务数据一致性检查，避免 UI/发布变更破坏原有业务。

## 仍然需要的正式验收

- `TAURI_SIGNING_PRIVATE_KEY` 仅保存在受保护的 GitHub Actions Secret 中，公钥通过可信构建配置固定。
- 使用隔离试验发行版真实生成签名的 Windows NSIS/MSI、macOS x64/ARM64 更新归档。
- GitHub Draft Release 全部资产签名和 `latest.json` 发布前审查。
- Windows/macOS 设备真实执行正常升级、伪签名拒绝、离线、权限拒绝、失败重试、重启后版本确认。
- Windows/MSI/NSIS 的真实安装器 UAC 操作和 macOS 安装、替换行为验证。
- 只有以上全部完成后才考虑启用 `REQUIRE_SIGNED_UPDATER=true`。

**重要：** 上述验证没有使用真实签名私钥，没有改动默认分支或任何已公开的 Release。本 PR 继续保持 Draft。

## 相关文档

- [R11 客户端签名运行时](./ui-r11-signed-updater-integration.md)
- [R12 发布资产合并与验收](./ui-r12-update-release-verification.md)
- [R13 会话稳定性](./ui-r13-signed-update-session-reliability.md)
- [Tauri Updater 官方说明](https://v2.tauri.app/plugin/updater/)
- [Tauri GitHub Action 参数](https://github.com/tauri-apps/tauri-action/blob/dev/action.yml)
