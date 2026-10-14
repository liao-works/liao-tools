# R12 · 签名更新 Release 汇总发布与安全验收

## 根本问题
Tauri 官方更新包由 Windows、macOS ARM64、macOS x64、macOS Universal 四个 job 并行构建。每个 job 若同时写 GitHub Release 的同名 `latest.json`，可能互相覆盖、只包含部分平台，甚至在删除/重建同名资产时发生 404 冲突。发布流程此前也没有真正连接 R10 的跨平台清单生成器与合并产物验证器。

## R12 实际改造
1. 在 `.github/workflows/release.yml` 的并行 `tauri-action` 明确设置 `uploadUpdaterJson: false`、`uploadUpdaterSignatures: true`，各平台只上传安装包与 `.sig`，避免抢写清单。
2. 只有 `verify-and-publish` 在所有构建完成后才执行签名整合（仅 `REQUIRE_SIGNED_UPDATER=true`）：从 Draft Release 下载真实 `.sig` 文件，读取 GitHub 资产元数据，使用 R10 脚本生成完整 `latest.json`。
3. 将唯一的合并清单上传 Draft，随后从 GitHub Release **重新下载清单**，与本地内容逐字节比较，再检查清单中的 **版本、URL、目标平台、签名原文** 与实际 GitHub 发布资产逐项一致。
4. 缺少签名、错误域名、错误版本、少平台、混用签名或少 `latest.json` 时拒绝发布；继续保持 Draft。
5. 增加 `verifySignedManifest`、`verifyRelease` 两套纯函数与测试，另对 Release workflow 关键时序增加静态结构单测。
6. 更新中心的签名渠道严格区分 **下载完成** 与 **签名验收/安装成功**，不提前宣称验签通过。

## 安全限制
这些流水线验证保证元数据及签名原文与资产一致，**不等价于密码学验签**。只有编入真实可信公钥的 Tauri updater 才能对安装包签名进行最终验证。签名模式尚未启用，未生成或泄露私钥，未公开新的 Release，不能声称已完成 Windows/macOS 跨版本实测。

## 自动化覆盖
- HS Code 单测、发布脚本单测与工作流合约测试由 Frontend CI 执行；
- Playwright 模拟 Tauri 桥接继续覆盖 8 项业务和更新交互；
- Windows Cargo Check 与 Rust 更新器单测继续由 Windows CI 验证；
- 真实 Draft Release / GitHub CLI 上传与下载、证书配置、Windows UAC、macOS 安装和重启版本确认**仍须正式测试**。

正式启用时请先由维护者安全生成并保存签名密钥对，仅私钥放入 Actions Secrets，公钥放入 GitHub Variable；签名发布开关 `REQUIRE_SIGNED_UPDATER` 不得在此之前打开。

当前 PR #3 继续保持 Draft。
