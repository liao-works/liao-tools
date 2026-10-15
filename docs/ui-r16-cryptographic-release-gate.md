# R16 · 正式发布前的真实密码学签名验证

日期：2026-10-15。仓库：`liao-works/liao-tools`，分支：`feat/ui-refresh-20261014`，Draft PR #3。

## 基线

R15 最终版本 `2d0bfbf` 在 GitHub Actions 的 Frontend Validation、Visual Smoke、Windows Rust/Tauri、macOS Rust/Tauri、Tax snapshot checks **全部通过**。当前最新公开稳定 Release 仍为 `v0.0.13`，未启用签名 `latest.json`，也没有发布新的安装包。

## 发现与解决的问题

R10–R15 的发布门禁确认了资产文件名、文件大小、GitHub URL、Release SHA-256、`.sig` 文件与 `latest.json` 原文的一致性。但这些检查不能证明安装包是由**客户端内置公钥对应的私钥**签署。若 CI 采用错误密钥签名、签名资源与安装包错配，仍可能导致无法更新的公开 Release。

R16 补上了发布前的真正密码学验签，不再依赖“签名字段外形正确”的假设。

### 新增 `scripts/verify-signed-release-cryptography.cjs`

- 从 `latest.json` 读取 Windows x64、macOS Intel、macOS Apple Silicon 三个选择的更新资产。
- 对 `TAURI_UPDATER_PUBLIC_KEY` 执行严格的 Base64 解码和 Minisign Ed25519 公钥结构检查，检查公钥是标准 Tauri 公钥文件的 Base64 包装。
- 对清单里每一个 `signature` 字段执行 Base64 解码，得到原始 Minisign 签名文档。
- 以操作系统提供的 **Minisign 命令** 验证对应的真实下载包，使用安全的子进程参数数组（不通过 shell 解释器执行），任何一个平台失败则整个发布失败。
- 临时解码文件位于临时目录，检查完成后删除；不需要、更不会读取私钥。

使用方式（此命令需要 GitHub 发行版真实安装包，以及**公钥**）：

```sh
export TAURI_UPDATER_PUBLIC_KEY='来自可信环境的公钥 Base64'
node scripts/verify-signed-release-cryptography.cjs \
  v0.0.14 ./latest.json ./downloaded-updater-bundles
```

验证器会拒绝非法公钥、非法签名格式、错误版本、错误平台、外部下载 URL、文件缺失以及密码学验签失败。

### 与 Release 工作流集成

`.github/workflows/release.yml` 仅在 `REQUIRE_SIGNED_UPDATER=true` 时运行新的验证：
1. 全部构建成功后仍保留 Draft Release，汇总并生成唯一的跨平台 `latest.json`。
2. 从 GitHub Release 下载 `latest.json`，确认文件字节与生成内容一致。
3. 检查 Manifest 版本、URL、平台、文件元数据和签名原文。
4. 从真实 Release 下载清单所列三个目标平台的更新包。
5. 安装 Minisign，并用发布构建内置的 `TAURI_UPDATER_PUBLIC_KEY` 分别验证每个下载包。
6. **全部通过后**才能执行 GitHub Release `draft:false` 操作。任意失败时保持 Draft。

签名模式关闭时，继续使用旧版手动升级和 SHA-256 校验模式，**不要求现有 `v0.0.13` 用户配置密钥**。

### 签名构建前公钥格式检查

`scripts/prepare-signed-release.cjs` 不再只检查公钥字符串长度，现在要求 Base64 可以解码为合法的 Tauri Minisign 公钥文件格式。没有公钥、格式错误或没有正式签名插件，均按失败关闭处理。

## 实际运行的自动化测试

`tests/verify-signed-release-cryptography.test.cjs` 在 Ubuntu GitHub Actions 中安装 Minisign 0.11，在**临时目录中产生一次性测试公私钥对**、签署合成更新包，然后进行真实验签：

| 场景 | 期望 |
|---|---|
| 三个平台签名正确，公钥匹配 | 通过 |
| 更新包被追加/篡改字节 | 拒绝发布 |
| 用另一平台的签名替换 | 拒绝发布 |
| 使用其他测试密钥的公钥 | 拒绝发布 |
| 公钥格式错误、外部 URL、缺失文件 | 拒绝发布 |

单测不接触生产 `TAURI_SIGNING_PRIVATE_KEY`，临时密钥不会写入仓库或 GitHub Release。新签名发布检查还进入了 `tests/release-workflow-contract.test.cjs`，防止有人将验签操作移动到发布之后。

## 尚未完成

- 真实签名私钥/公钥尚未由维护者在可信环境准备并写入 GitHub Actions Secrets/Variables。
- **尚未进行一次真实的正式签名构建并在 Windows/macOS 设备上完成跨版本安装与重启后的版本确认**。
- 未模拟 Windows UAC 权限拒绝、真实 macOS 包替换失败、旧版 `v0.0.13` 到过渡版的完整升级。
- 真实 Tauri 签名更新必须先保证客户端内置的是同一受信任公钥，否则无法更新。
- CI 中的密码学验签用合成包确认算法和工具链可用，**不等价于已验证生产签名包**。

因此本轮继续保持 PR #3 为 Draft，不合并 `master`，不创建公开 Release，`REQUIRE_SIGNED_UPDATER` 不开启。

参考：
- https://v2.tauri.app/plugin/updater/
- https://github.com/tauri-apps/tauri-action
