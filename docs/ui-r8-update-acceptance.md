# Liao Tools R8 · 全站精修与应用更新验收

## 信息架构
- 工作台、英国/北爱关税、Alta、Excel、UPS/DPD、Amazon、系统工具、Todo、设置均保留独立业务路径。
- 新增 **应用更新** `/updates` 页面，侧边栏与 Ctrl+K 均可进入。
- 统一卡片、输入框、操作栏、空状态和响应式布局，增加独立的应用更新、工具空状态与 Todo 插画。
- Todo 不再拦截原生 Tab 键，支持键盘正常切换焦点。

## 自动更新行为（已编码）
1. 应用启动时读取更新配置。仅在启用自动检查且已超过检查间隔时请求官方 GitHub Releases，未发现更新则不打扰。
2. 发现新版本才显示升级提醒，且复用同一个更新中心组件，无二次请求。
3. 用户确认下载后，Rust 根据当前操作系统和 CPU 架构匹配官方发布资源。
4. 从 GitHub Release 提取其 SHA-256 摘要；若缺失，禁用应用内下载并提供官方发布页面。
5. Rust 下载前二次比对官方版本/URL/SHA-256，文件下载到临时 `.part` 路径；只在文件大小与 SHA-256 都匹配后，才保存可安装文件及校验记录。
6. 安装时仅接受本应用临时下载目录中有校验记录且哈希仍匹配的文件。禁止执行其他路径安装包。
7. 用户确认后启动系统安装程序（Windows NSIS/MSI、macOS DMG），不把“安装程序已启动”显示成“升级完成”。
8. 不提供无人值守静默安装；需要完整签名更新时再接入官方 Tauri updater 签名密钥和发布流水线。

## 已知边界
- **SHA-256 不是发布者数字签名。** 本轮实现是受控的自动发现 + 提醒 + 验证下载 + 用户确认升级，不是无需干预的自动安装。正式自动安装建议引入 Tauri 官方签名 updater（需维护独立私钥、公钥及 signed artifacts）。
- GitHub API 必须可访问。网络错误不会更新上次成功检查时间。
- 系统安装程序最终是否安装成功，需要安装器本身给出的结果或重启后版本确认；当前 UI 不承诺安装完成。
- 目前最新公开 Release 为 `v0.0.13`（核对时间 2026-10-14），与当前发布版本相同，无法用它对新版本下载安装完成全链路进行真实验收。
- Chromium 模拟 Tauri 桥接测试只验证前端参数、交互和状态，不等价于真实文件写入与系统安装。

## 回归验证矩阵
- `node --experimental-strip-types --test tests/hs-code.test.mjs`：HS Code 校验单测。
- `pnpm run build`：TypeScript + Vite。
- `node tests/ui-flow-smoke.cjs`：模拟 Tauri 桥接的业务与升级流程：税率、Alta、Excel、UPS/DPD、Amazon、升级验证/启动安装。
- `UI Refresh · Visual Smoke`：桌面与紧凑宽度截图，包括更新中心和设置。
- `UI R7 · Windows Tauri Compile`：Windows Rust/Tauri `cargo check --locked`（仍应在 Windows 实机完成业务回归）。
- 后续必测：升级源网络受限/HTTP 失败、无摘要、校验不一致、断网、写入失败、Windows UAC 权限、MSI/NSIS 升级、macOS DMG、安装中意外退出、重启版本确认。

所有功能保留在 `feat/ui-refresh-20261014` Draft PR，**验收前不要合并 master**。
