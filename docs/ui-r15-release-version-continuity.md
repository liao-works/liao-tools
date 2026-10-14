# R15 · 稳定版本发布单调性与签名渠道连续性门禁

日期：2026-10-14。仓库：`liao-works/liao-tools`。分支：`feat/ui-refresh-20261014`，PR #3（Draft）。

## 核验基线

R14 最终 SHA `cdb30c9` 对应的 Frontend Validation、Chromium Visual Smoke、Windows Tauri 编译与 updater Rust 单测、macOS Tauri 编译与 updater Rust 单测、关税快照检查**均成功**。当前最新公开版本 `v0.0.13`，仓库原有资产包含 Windows x64 NSIS/MSI 和三种 macOS DMG，不包含已正式启用的 `latest.json`。

## R15 发现的真实发布风险

1. R14 已要求 Tag 属于已合并 `master` 的祖先，但仍可为旧的 master 提交重新打旧版本号的标签；若被公开，就可能冲击客户端 `releases/latest` 渠道。
2. 原 Release 工作流的并发分组仅按 `github.ref` 隔离：`v0.0.14` 与 `v0.0.15` 可以同时构建、交错公开，不能保证正式版本发布顺序。
3. 一旦发布首个包含官方签名更新 `latest.json` 的稳定版本，随后错误地关闭 `REQUIRE_SIGNED_UPDATER` 并发布未签名版本，将使已安装的签名更新客户端无法获取正常升级包。
4. 若 GitHub Releases API 返回不完整元数据，不能根据“没发现签名清单”就推断签名渠道尚未启用。

## 代码实现

- `scripts/release-version-gate.cjs`：从 GitHub Releases 列表读取公开稳定版本，按 SemVer major/minor/patch **数值**比较；禁止相同 Tag 覆写、降级或等版本发布。
- 对 GitHub CLI 的 `gh api --paginate --slurp` 嵌套分页结果和普通 JSON 列表统一处理。
- 忽略 Draft Release 与 prerelease 的稳定版本下限，以便同一新版本 Draft 可重试并继续完成矩阵构建。
- 若某个公开稳定版已带有 `latest.json`，后续不允许关闭签名发布开关后公开下一版本。若需要验证签名连续性却缺失 `assets` 信息，则按失败关闭处理。
- `.github/workflows/release.yml` 在发布矩阵**开始前**及最终 Draft → Published **之前**重复执行版本检查；各 Tag 的正式发布任务使用全局 `concurrency` 串行化（`cancel-in-progress:false`）。
- `tests/release-version-gate.test.cjs` 覆盖新旧版本、重复发布、Draft 重试、跨主次版本数字比较、非法 Tag、不完整 API 响应、签名后降级、旧版平滑迁移以及实际调用 Node CLI 的回归。
- `tests/release-workflow-contract.test.cjs` 检查版本门禁在构建和公开前各运行一次。
- 前端 CI 与发布脚本验证中加入版本门禁测试；所有代码仍保持在功能分支。

## 正式发布仍需完成

1. 维护者通过 GitHub Actions 的受保护 Secrets/Variables 配置正式签名私钥/公钥；密钥不在聊天、仓库或日志中展示。
2. 验证 Tauri Action 实际生成的 Windows 和 macOS 签名安装包、`.sig` 文件名以及跨平台合并的 `latest.json`。
3. 在 Windows/macOS 真实已安装版本上，覆盖正常升级、签名错误、断网、UAC 拒绝、安装重试、重启后版本号等场景。
4. 跨版本验收和完整 CI 都通过后，才讨论正式启用签名渠道、合并 PR #3 或发布新版本。

本轮不会创建新 Release、不写入 `master`、不更改 `REQUIRE_SIGNED_UPDATER`。**脚本和模拟数据测试不是密码学验签或真实升级测试。**
