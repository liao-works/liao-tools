## [0.0.18](https://github.com/liao-works/liao-tools/compare/v0.0.17...v0.0.18) (2026-10-17)

### 📦 大体积正式数据包可靠下载

* 修复慢速网络下下载 ~473MB（现为 ~497MB）完整 GB/XI 关税数据库总是失败的问题：原来的 300 秒总超时会中断健康但缓慢的流式下载，现改为 45 秒连接超时 + 每块 150 秒卡顿超时，传输多久都不中断，死连接仍会及时报错（PR #31）。
* 保留既有的清单大小与 SHA-256 校验、原子安装与失败回滚：下载字节数与哈希和官方 manifest 完全一致才会替换本地数据库。

### 🇨🇳 企业级反倾销 / 反补贴税率呈现

* 界面区分「官方明确 0%」与「官方未提供金额的条件税率」，不再把无法解析的来源显示为 0%（PR #32）。
* 承接数据侧新发布的企业级条件税率包：GB 措施按企业附加代码与凭证（如 D008）分列条件税率（例：1516209821 的 Zhuoyue Group D008→14.79%、无凭证→54.64%），XI 侧 EcoCeres 等企业的条件税率同步展示（PR #27-#30、#32）。

### ✅ 构建与兼容

* 延续 Windows x64（NSIS/MSI）和 macOS Apple Silicon 发布目标，不构建 macOS Intel / Universal。
* 本次仅变更下载数据链路与税率展示，不变更商品编码匹配、品牌视觉或其他业务页面。

## [0.0.17](https://github.com/liao-works/liao-tools/compare/v0.0.16...v0.0.17) (2026-10-16)

### 🇨🇳 中国原产商品的 GB / XI 进口关税查询

* 修复反倾销、反补贴税率始终显示空值：英国 GB 和北爱尔兰 XI 分别显示官方对应措施。
* 对于出口商专属税率，按附加代码展示所有企业的原始措施、税率或金额、适用条件、生效日期。仅当官方明确标注「其他出口商」时显示对应参考税率，避免把个别企业税率误认为所有中国企业适用。
* 保留中国原产、正常进口的普通第三国税率查询；缺少确定数据时显示「—」，不使用「待核验」等不准确文案。
* 批量 Excel 查询新增北爱反倾销和反补贴独立列，同时保留 GB 对应列。
* 老版本本地税率数据库自动迁移新增字段；更新后可下载新的正式 GB/XI 数据包，展示企业附加代码和原始税率条件。

### ✅ 构建与兼容

* 延续 Windows x64 和 macOS Apple Silicon 发布目标，不构建 macOS Intel / Universal。
* 本次只变更关税数据呈现及批量导出，不变更商品编码匹配相似度、品牌图标或其他业务页面。

## [0.0.16](https://github.com/liao-works/liao-tools/compare/v0.0.15...v0.0.16) (2026-10-16)

### 🎨 品牌视觉与高清桌面图标

* 全新 Liao Tools 品牌图标：浅蓝地球、英国及爱尔兰轮廓、粉色星环与星芒（PR #18）。
* 桌面 Windows 多分辨率 ICO 和 macOS ICNS 统一使用高清矢量母版生成，修复原 Windows 图标文件分辨率不足的问题。
* 替换应用侧边栏品牌标识、网页 favicon 与兼容图标，并新增统一生成、检查图标资源的脚本与文档。
* 新安装包提供 Windows x64（NSIS/MSI）和 macOS Apple Silicon（ARM64）版本；不再生成 macOS Intel 和 Universal 安装包（继承既有发布配置）。

### ✅ 发布边界

* 本次仅合入品牌图标与已在 master 的发布配置，不包含尚未合并的应用更新错误处理修复 PR #16。
* 新图标在安装或升级到 v0.0.16 后生效，部分 Windows 图标可能需要刷新系统缓存；未经实机 GUI 全功能回归，不宣称所有业务流程经过手工验收。

## [0.0.15](https://github.com/liao-works/liao-tools/compare/v0.0.14...v0.0.15) (2026-10-15)

### ✨ 高保真 UI 正式版：恢复 PR #3 原定设计

* 将原始 PR #3 的设计成果整合回 `master`（PR #14），恢复暖陶橙主题、工作台首屏插画、分组导航、顶部搜索、7 个业务工具入口、常用操作及本地数据状态。
* 恢复 10 张原始 SVG 插画与自适应样式，覆盖工作台、关税、Alta、文件处理、Amazon、Todo、系统工具和应用更新视觉场景。
* 关税、Alta、Excel、UPS/DPD、Amazon 页面采用 PR #3 的高保真业务排版，同时保留 R4 当前实际业务调用与数据状态的准确表述。
* 设置、系统工具、Todo 和独立应用更新入口统一到原定视觉体系；暖陶橙用于新安装的默认主题，已保存的用户主题不被强制覆盖。

### 🛡️ 功能及更新边界

* 保留 R4 的 Todo 双窗口修订号冲突保护、存储损坏拒绝覆盖、写盘失败回滚、系统工具错误反馈和数据维护入口。
* 应用更新继续采用现有经过集成的用户确认安装流程；PR #3 的签名无人值守更新机制**未启用**，不将当前安装包或哈希校验冒称为完整的官方签名自动升级。

### ✅ 质量与发布

* PR #14 的 TypeScript/Vite 构建与 15 场景跨页面 Chromium 视觉截图工作流已通过；Windows 桌面构建及关键 Rust 测试以 GitHub Actions 最终结果为准。
* v0.0.15 从包含 PR #3 设计的 `master` 标签构建，发布 Windows NSIS/MSI 和 macOS Apple Silicon、Intel、Universal 的安装包。
* Windows/macOS GUI 实机完整功能回归和人工逐像素验收尚未有完成记录；建议先在可信测试设备验证关税、Alta、Excel、Todo 和应用更新工作流。

## [0.0.14](https://github.com/liao-works/liao-tools/compare/v0.0.13...v0.0.14) (2026-10-15)

### ✨ R4 全新工作台与工作流

* 重构工作台、侧边导航与全局搜索，统一页面设计和任务入口（PR #4）。
* 优化英国/北爱关税查询与 Alta 查询界面，接入真实查询流程（PR #5）。
* 完善 Excel、UPS/DPD 文件处理界面及输出交互（PR #6）。
* 重构 Amazon、系统工具、Todo 和设置、数据维护工作流（PR #7–#8）。

### 🐛 桌面稳定性与数据完整性

* 修复桌面命令接线、工具启动记录及更新反馈中的错误状态（PR #9–#10）。
* Todo 主窗口与悬浮小组件使用共享修订号保护，阻止旧快照覆盖新任务；遇到冲突时明确提示并可同步（PR #11）。
* Todo 持久化数据损坏时不再当作空列表，保存失败后恢复进程内旧值，补充 Rust 回归测试（PR #12）。

### ✅ 构建与验收

* Windows Tauri 编译与 Todo 针对性回归测试已在 GitHub Actions 通过。
* 新版按 Windows 和 macOS 多架构构建发布。
* Windows 真实桌面 GUI 联调尚无通过记录；请先在测试环境检查关键工作流后部署生产使用。

## [0.0.12](https://github.com/liao-works/liao-tools/compare/v0.0.11...v0.0.12) (2026-10-03)


### ✨ 新功能

* **revcal:** 新增 Amazon 收益计算器批量查询 ([716fff2](https://github.com/liao-works/liao-tools/commit/716fff2befb1a1f280ecc4f57f702ace62019d28))
* 增加新的界面设计 ([3deed7e](https://github.com/liao-works/liao-tools/commit/3deed7efbc1e62c29613588da05e4e8cb069f1a3))

## [0.0.11](https://github.com/liao-works/liao-tools/compare/v0.0.10...v0.0.11) (2026-06-19)


### 🐛 Bug 修复

* **update-history:** list_sessions 改用 MAX 聚合并补排序/limit 测试 ([3109fc6](https://github.com/liao-works/liao-tools/commit/3109fc6df680dd7a5b50d27585d034796891b9c0))


### ✨ 新功能

* **update-history:** alta 更新对比新旧清单写入变更记录 ([fef1e24](https://github.com/liao-works/liao-tools/commit/fef1e24111111586e65731b279f7bb2a6b282ecb))
* **update-history:** alta/tax 数据管理页加入更新历史入口 ([8ed0059](https://github.com/liao-works/liao-tools/commit/8ed0059a2ad56a76156adf155e09d5ea72b51523))
* **update-history:** DataChanges 模型 + RemoteMetadata/TaxVersionInfo 增加 data_changes ([079ab2f](https://github.com/liao-works/liao-tools/commit/079ab2f224c0a86523fbed699065dfe5142a08a0))
* **update-history:** diff_tariffs removed/added 携带商品描述 ([4d5cd4e](https://github.com/liao-works/liao-tools/commit/4d5cd4e7d79a030ca13efa76a4a822aece97912c))
* **update-history:** tax 全量更新对比新旧库写入变更记录 ([c9a29b8](https://github.com/liao-works/liao-tools/commit/c9a29b84167babd54290f37a8ac452b92a7023ec))
* **update-history:** tax 单行更新写入变更记录 ([961e4e7](https://github.com/liao-works/liao-tools/commit/961e4e73a2d6ac9179fa19a714cbdd867aed19d3))
* **update-history:** 前端 API 封装与类型定义 ([b38ec0c](https://github.com/liao-works/liao-tools/commit/b38ec0c0b1ba8fd06e0d345f3d2103160a4ae78d))
* **update-history:** 定义变更记录模型类型 ([ae7ca55](https://github.com/liao-works/liao-tools/commit/ae7ca55d31c8781ef6c8247676dce1c24b3f6e3e))
* **update-history:** 新增 HistoryDatabase 建表/插入/查询/清理 ([d34b1c8](https://github.com/liao-works/liao-tools/commit/d34b1c89b0a18e3484df45ddaa5e88bfe5585801))
* **update-history:** 新增 tax/alta 行级 diff 逻辑 ([5023f1a](https://github.com/liao-works/liao-tools/commit/5023f1abde20646e8fdc09112ac49e90203526ef))
* **update-history:** 新增历史查询/清理 Tauri 命令并注册 ([b0e233b](https://github.com/liao-works/liao-tools/commit/b0e233bf2db80efa8371fb60dd396b2a0af3c634))
* **update-history:** 新增更新历史弹窗组件 ([6181bce](https://github.com/liao-works/liao-tools/commit/6181bce49767a1d5a4b80937f1242a60803d7e8f))
* **update-history:** 检查更新展示 data_changes 更新前预览 ([ee43a16](https://github.com/liao-works/liao-tools/commit/ee43a16577d08d403f42db5561bf23cb5487957f))

## [0.0.10](https://github.com/liao-works/liao-tools/compare/v0.0.9...v0.0.10) (2026-03-22)


### ✨ 新功能

* **todo:** add inline editing and fix duplicate enter add ([0c2576b](https://github.com/liao-works/liao-tools/commit/0c2576b837816b13c38e1bf4d614c9f102559c1a))

## [0.0.9](https://github.com/liao-works/liao-tools/compare/v0.0.8...v0.0.9) (2026-03-08)


### ✨ 新功能

* **todo:** migrate desktop todo widget ([0fc65e6](https://github.com/liao-works/liao-tools/commit/0fc65e6e57f6458695a13fad15b6210e5fc3fa0f))

## [0.0.8](https://github.com/liao-works/liao-tools/compare/v0.0.7...v0.0.8) (2026-02-05)


### ✨ 新功能

* **alta:** 改进禁运查询功能，支持复杂编码格式和例外显示 ([ce7418d](https://github.com/liao-works/liao-tools/commit/ce7418d445fcf0ceb015e789c6c064164d3d234c))

## [0.0.7](https://github.com/liao-works/liao-tools/compare/v0.0.6...v0.0.7) (2026-01-25)


### ✨ 新功能

* 完善系统工具功能，添加用户自定义工具支持 ([ca6a26a](https://github.com/liao-works/liao-tools/commit/ca6a26a7621f60aa9bc6d368498b6f7cbcd48e8c))

## [0.0.6](https://github.com/liao-works/liao-tools/compare/v0.0.5...v0.0.6) (2026-01-24)


### ✨ 新功能

* 新增税率查询字段并完善自动更新功能 ([110c0f0](https://github.com/liao-works/liao-tools/commit/110c0f034f93cd621b9eefd89079317b4c77acbd))

## [0.0.5](https://github.com/liao-works/liao-tools/compare/v0.0.4...v0.0.5) (2026-01-23)


### ✨ 新功能

* 为所有文件输出添加统一的打开文件对话框 ([90e0440](https://github.com/liao-works/liao-tools/commit/90e044023b8db6c4737a2907d3c18bc6e908517e))
* 简化ALTA Excel处理，只输出HS Code和禁运状态 ([2c18923](https://github.com/liao-works/liao-tools/commit/2c18923273645a9338bc2b8320e0c29932dea389))

## [0.0.4](https://github.com/liao-works/liao-tools/compare/v0.0.3...v0.0.4) (2026-01-18)

## [0.0.3](https://github.com/liao-works/liao-tools/compare/v0.0.2...v0.0.3) (2026-01-18)

## [0.0.2](https://github.com/liao-works/liao-tools/compare/v0.0.1...v0.0.2) (2026-01-17)

## [0.0.1](https://github.com/liao-works/liao-tools/compare/0.0.2...v0.0.1) (2026-01-17)

## [0.0.2](https://github.com/liao-works/liao-tools/compare/0.0.1...0.0.2) (2026-01-17)


### ✨ 新功能

* add GitHub auto-update configuration and enhance theme management with popover component ([bf4f4ee](https://github.com/liao-works/liao-tools/commit/bf4f4ee3df7f2cd8668dac3bbf6c15b2ee08dc87))
* add new Excel templates for UPS and DPD and update template paths in template manager ([2ab324e](https://github.com/liao-works/liao-tools/commit/2ab324e38ec75a19de039466be772d0db73d045a))
* automate version updates in configuration files during release process ([4e2136f](https://github.com/liao-works/liao-tools/commit/4e2136f88f29c24ffc3184491ebc7bb7ebff896c))
* 更新 GitHub Actions 工作流，切换到 pnpm 进行依赖管理并优化缓存设置 ([ccc60d4](https://github.com/liao-works/liao-tools/commit/ccc60d4187d8b3061fa7c3e1beb83abc45272d17))

## [0.0.1](https://github.com/liao-works/liao-tools/compare/f1454a47fa3ee5c904ace35ff40eaa2cf842141b...0.0.1) (2026-01-17)


### ✨ 新功能

* 初步图标和部分交互修复 ([5c428b4](https://github.com/liao-works/liao-tools/commit/5c428b4b5eaf28da42b6c2870eadcebea297dfa5))
* 初步完成海关编码查询 ([3cd10e8](https://github.com/liao-works/liao-tools/commit/3cd10e8fb0bd08f9edfa9c6e70935481420eace6))
* 完成 Excel 数据拆分工具的迁移与整合，支持多种处理类型及配置管理 ([dd9e9c3](https://github.com/liao-works/liao-tools/commit/dd9e9c3eb926c7569820d5a537c05f82fb868cfb))
* 完成 UPS/DPD 数据处理模块的开发与更新检查功能，整合模板管理与自动更新对话框 ([ea1edf1](https://github.com/liao-works/liao-tools/commit/ea1edf1218ab0ad97b49dbd24a206356a16a905c))
* 完成初始化 & 增加禁运查询 ([f1454a4](https://github.com/liao-works/liao-tools/commit/f1454a47fa3ee5c904ace35ff40eaa2cf842141b))
* 完成税率查询模块迁移与更新功能实现 ([b785b31](https://github.com/liao-works/liao-tools/commit/b785b31bb469a0791cbb98ea47f4c9fdcfd6eb53))
