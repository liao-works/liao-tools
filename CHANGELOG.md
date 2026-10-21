## [0.0.27](https://github.com/liao-works/liao-tools/compare/v0.0.26...v0.0.27) (2026-10-21)

### 🧭 导航与更新提醒

* 「管理」组导航项（数据维护 / 使用统计）进入页面后正确高亮选中。
* **数据维护绿点**：远程数据库（关税 / 禁运清单）有更新时，侧边栏「数据维护」入口亮绿点，悬停提示「远程数据库已更新，需要更新数据」；完成更新后绿点立即消失。新增禁运清单只读比对命令（抓取远端与本地比对，不写库）。
* **应用更新绿点**：发现新版桌面应用时，「应用更新」入口亮绿点并悬停显示新版本号。

### ⬇️ 数据下载健壮化

* **断线自动续传**：下载中断 / 停滞自动退避续传，且重试预算「无进展才计费」——慢速链路下持续推进不再前功尽弃，反复原地失败才报错，断点始终保留。
* **多连接分段并行**：大文件自动切分最多 6 段并行下载，段间独立断点；服务器不支持分段时自动回退单连接。
* **zstd 压缩快照**：数据发布新增压缩格式，传输量降至约 1/5；压缩资产不可用时自动降级原始数据库下载，旧清单 / 新客户端 / 新清单 / 旧客户端任意搭配均兼容。
* **完整性三重校验**：尺寸 + SHA-256 + MD5（发布端同步产出 `.md5` 校验文件），任何一路校验不过绝不安装并清理残留。
* 应用安装包下载移除 300 秒总超时（超 5 分钟必失败的隐患），改为连接超时 + 停滞保护。

## [0.0.26](https://github.com/liao-works/liao-tools/compare/v0.0.25...v0.0.26) (2026-10-20)

### 🌐 翻译

* 目标语言新增**「自动（互译）」并设为默认**：自动识别中文译英、外语译中，方向在下拉框实时回显（如「自动（→中文）」），贴入文本即可运行，无需手动选方向；选中具体语言则行为不变。
* 源语言「自动检测」实时回显识别结果（如「自动检测（英语）」）；检测到源语言与目标相同（如英→英）时提示「继续运行会原样返回」，并提供一键改为另一种语言，不再悄悄浪费一次无效翻译。
* 供应商配置弹窗明示：API Key 已持久化到本机、界面不回显明文、留空保存即保持不变，无需每次重新填写。

### 🚢 货物追踪

* 本地识别未命中的单号现在**自动调用 5688 在线识别兜底**（输入停顿约 0.7 秒触发），识别成功直达对应查询页；在线识别失败时静默降级回本地方案，无感切换。后端新增 5688 识别接口签名接入，请求走系统代理。

## [0.0.25](https://github.com/liao-works/liao-tools/compare/v0.0.24...v0.0.25) (2026-10-19)

### 🚢 船司查询

* 新增船司查询工具：内置 137 家船司名录（中文名 / 代码 / 英文全称），支持搜索与首字母索引，每家船司一键直达官网与货物跟踪页（系统浏览器打开）。数据整理自物流巴巴船公司大全，纯本地静态数据，不依赖外部接口。
* **货物追踪页签**：输入提单号 / 集装箱号 / 快递单号，本地识别单号类型与承运商后直达对应官方查询页——海运集装箱与提单命中内置前缀（马士基、中远、长荣、地中海等 20+ 主流船司）直接跳转；快递单号（UPS / EMS）转应用内「运单轨迹」工具；空运主单与未识别单号可交由 5688 站内识别跳转。识别完全在本机完成。

### 🧭 首页

* 「快速开始」工具数量改为动态统计，新增工具后不再显示旧数字。

### 🛠️ 稳定性修复

* 翻译供应商配置改为**原子写入**（先写临时文件再替换），写入途中被关闭不再可能留下损坏的配置文件。
* 供应商配置弹窗打开期间，后台状态刷新不再清空正在编辑的 Key / 模型 / 地址。
* 翻译历史列表钳制分页参数：修复异常负数 limit 时 SQLite 语义会返回全表的问题；税率模糊查询与数据更新日志加上 limit 上限。

## [0.0.24](https://github.com/liao-works/liao-tools/compare/v0.0.23...v0.0.24) (2026-10-19)

### 🧭 入口缺失修复

* **体积 / 计费重与运单轨迹入口修复**：两个功能自 v0.0.22 起已随包发布（页面与后端命令均在），但界面重构后侧边栏与首页改为独立的菜单配置，「业务查询」组新增入口未同步，导致安装后看不到这些工具。现已在侧边栏「业务查询」与首页「快速开始」补齐入口。
* 关税「成本试算」标签与体积页内「装柜试算」卡片随入口恢复可达（Ctrl+K 搜索此前已能搜到）。

## [0.0.23](https://github.com/liao-works/liao-tools/compare/v0.0.22...v0.0.23) (2026-10-19)

### 🛠️ 数据更新可靠性修复

* **数据下载支持断点续传**：497MB 快照下载中途关闭应用或断网后，重试从已下载字节继续（此前必须从头重下，表现为「更新丢失/数据回退」）；服务器不支持分段时自动整体重下。
* 无论续传与否，安装前仍执行清单大小 + SHA-256 全量校验，完整性不打折。
* 启动自愈：应用在数据安装瞬间被关闭导致的元数据不一致会自动恢复；数据安装成功后自动清理遗留临时文件。

## [0.0.22](https://github.com/liao-works/liao-tools/compare/v0.0.21...v0.0.22) (2026-10-19)

### 🚚 运单轨迹查询

* 新增运单轨迹查询页：接入 17TRACK，支持批量轨迹查询与结果导出，内置 API Key 申请步骤说明与入口链接。

### 📦 装柜试算

* 体积 / 计费重页新增装柜试算卡片：单规格装柜试算核心与前端展示。

### 🗓️ 首页

* 待办日历接入**中国法定假期**：放假日红色日期 + 「休」角标、调休补班日「班」角标，选中日期显示假期名；2025/2026 两年数据离线内置。
* 右栏新增**最近翻译**卡片：最近 5 条翻译历史（模式、时间、原文），点击一键回填到翻译页继续使用。
* 布局重排：banner 独占首行全宽，待办日历与「快速开始」同行贴右侧（滚动时吸附跟随）；保留快速开始的原错位网格节奏；工具卡标题与描述统一单行显示。

### 🌐 翻译

* 「补充说明」改为弹窗填写：自动聚焦、Ctrl+Enter 直接保存、留空保存即清除；有内容时按钮显示「已补充」。

## [0.0.21](https://github.com/liao-works/liao-tools/compare/v0.0.20...v0.0.21) (2026-10-19)

### 🌐 大模型翻译

* 新增「翻译」功能页，三种模式：**翻译**（兼顾口语与书面语，不堆砌套话）、**润色**（不换语言，把表达改得更自然）、**解释**（解读邮件的语气与潜台词：整体意图 / 关键表达 / 备选译法）。
* 语气三档预设（自然商务 / 轻松随和 / 严谨正式）+ 自定义补充说明；高级开关可完全替换系统提示词。
* 支持 **DeepSeek 与 Gemini**（官方 OpenAI 兼容端点）及任意自定义 OpenAI 兼容供应商；请求自动附加 Windows 系统代理。
* 流式输出逐字呈现，随时可停止；中英方向自动检测，预留多语言；快捷键 Ctrl+Enter 运行、Esc 停止。
* API Key 仅保存在本机后端配置，界面只显示掩码；翻译完成自动入历史，历史支持回填、单条删除与清空。
* 入口：侧边栏、首页工具卡与命令面板。

### 🗓️ 首页待办日历

* 首页右栏新增**待办日历**：有待办的日期显示优先级色点与条数，悬停预览当日待办，点击日期在下方查看并可勾选完成、删除、按该日期快速新增。
* 待办新增**到期日**：Todo 页新增默认今天，任务行可随时改期，过期条目红色高亮；旧数据自动兼容，无需迁移。
* 无日期待办在日历下方折叠收纳，可一键排期到选中日期；月历提供「今天」按钮快速回到本月。

### 💄 界面优化

* 翻译页输出区新增未配置引导卡与空态提示，未配置供应商时运行按钮置灰，避免点了才报错。
* 翻译页工具条按「模式 / 上下文 / 操作」三段分组，窄窗口按组换行。
* 修复一批交互问题：弹窗打开时 Esc 不再顺手中止翻译；翻译进行中切换模式会先中止旧流，结果不再串页；手动停止后迟到的错误不再重复弹提示；供应商弹窗在预设模型下无法输入自定义模型名；历史删除/清空失败现在有明确提示。

## [0.0.20](https://github.com/liao-works/liao-tools/compare/v0.0.19...v0.0.20) (2026-10-18)

### 🔄 应用更新器修复

* 版本检查失败时显示精确错误信息与错误码（如 GitHub 限流 403/429、网络故障），不再只报笼统的"检查更新失败"（PR #16）。
* 下载或安装失败时提供**官方发布页手动下载**回退入口（PR #16）。
* 严格按当前平台与安装包类型（NSIS/MSI/AppImage/DMG 精确后缀匹配）选择更新资产，避免装错架构的安装包（PR #16）。
* 版本检查客户端合并系统代理支持与 20 秒宽容超时，慢网络下不再轻易超时（PR #16）。
* CI 在打包安装器前新增原生 Windows 更新器测试（PR #16）。

### 🪟 Windows 品牌图标修复

* 主窗口与 Todo 独立任务栏窗口在启动时显式设置原生品牌图标，修复任务栏显示通用图标的问题（PR #19）。
* 可执行文件资源显式嵌入当前 ICO，NSIS 构建后校验图标确实写入 exe；升级后桌面快捷方式图标陈旧的问题附诊断文档（PR #19）。

### 📚 文档

* 合并 XI 冻结源目录与检查点验收契约（Phase 7+）文档，作为关税数据源契约的历史记录（PR #2）。

## [0.0.19](https://github.com/liao-works/liao-tools/compare/v0.0.18...v0.0.19) (2026-10-18)

### 📊 数据更新日志与数据统计视图

* 关税「数据更新与审核」页新增**数据更新日志**时间线（PR #36）：记录本机每次检查更新、开始下载、下载校验完成（含大小与耗时）、安装成功（版本从→到、记录数）和失败原因（含阶段），最近 50 条；与既有「更新历史」逐字段差异明细互补。日志为尽力而为的辅助信息，绝不影响更新流程本身。
* 关税页新增**数据统计**标签：数据总览（版本、发布时间、库大小、GB 源版本/日期、北爱源日期、记录数与本地库一致性校验）、GB/XI 普通第三国税率覆盖率条形图（附本地实时校验）、条件税率与官方选项规模（措施选项行、条件性选项、未解析数、缺表达式说明）、中国原产贸易救济规模（GB/XI 反倾销/反补贴涉及编码、中国适用措施行、条件税率表达式）、以及无默认税率编码的官方原因分布（来自采集端 gap 审计，中文标签）。
* 统计数字以数据发布清单（采集端权威计算）为准，客户端只做展示与行数一致性校验，不重新推导覆盖率。

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
