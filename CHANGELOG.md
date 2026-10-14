
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
