# 出口物流工具功能调研（2026-10）

调研目的：梳理市面出口物流相关工具的功能版图，对照 Liao Tools 现状，评估后续功能切入点。方法为公开资料网络调研（货代 SaaS、轨迹追踪、运价报价、装柜计算、合规查询、单证六类代表产品）。

## Liao Tools 现状摘要

定位"让跨境贸易数据处理更简单"的桌面工具箱（Tauri 2.0 + React 19 + Rust）。现有模块：

| 分组 | 模块 | 能力 |
|---|---|---|
| 业务查询 | 英国/北爱关税 | HS 编码 GB/XI 税率精确/模糊/Excel 批量查询，含反倾销、反补贴、贸易救济、企业级条件税率，离线 SQLite 数据库（完整包约 497MB）带版本校验 |
| 业务查询 | Alta 禁运 | HS Code 禁运清单匹配（含例外条目），批量 Excel，远程数据自动更新 |
| 业务查询 | Amazon 商品 | ASIN/UPC/EAN 查询 + 关键词搜索，16 国站点，Excel 导入导出 |
| 文件处理 | Excel 拆分 | 海铁数据（有图/无图）、空运数据三类拆分 |
| 文件处理 | UPS / DPD | UPS 总结单、DPD 数据预报模板填充 |
| 效率工具 | 系统工具、Todo 清单 | 启动器、任务记录 + 独立桌面小组件 |

明确空白：轨迹追踪、运价/计费试算、CBM/体积重计算、装柜计算、单证制作、出口退税/税负试算；无任何承运商 API 集成。

## 六类工具功能全景

### 1. 货代 ERP / TMS（重系统）

代表：CargoWise、Skylog、云无运、万联、Logipulse、ITS。面向货代公司全流程：

- 订单/托书管理、订舱操作（海/空/陆）、拼箱配载
- 运价中心：买价/卖价管理、多渠道（小程序/网站）报价分发
- 运输跟踪：节点里程碑、异常预警
- 财务：应收应付、对账、汇率、工资单
- 单证：提单、舱单、报关草单生成
- 生态：API 开放平台、与主流跨境 ERP（创建小包/FBA 单）对接

属于完整业务系统，不是工具箱路线的直接竞品，但提供行业功能全景参考。

### 2. 轨迹追踪 / Track & Trace

- 17TRACK：免费查 3500+ 承运商、220 国，运单号自动识别承运商，批量查询、订阅推送；偏电商包裹。
- AfterShip：企业级 SaaS，AI 预计送达日期（官方称约 95% 准确率）、异常件预警、送达通知、可视化看板、API 集成。
- SeaRates：按集装箱号/提单号查船公司箱轨迹，附带港口间 transit time 估算。

共性功能：单号/柜号批量查询、承运商自动识别、节点时间线、ETA 预估、异常提醒、结果导出。

### 3. 运价查询与报价管理

代表：Freightos（海运/空运即时比价、在线订舱）、Freightview（现货价/API 价/合约价比对）、Freightify、Descartes 报价管理。功能：多承运商实时报价对比、报价单生成、历史运价库、旺季附加费跟踪、利润优化建议。

### 4. 装柜 / 计费重量计算（轻工具，与工具箱定位最像）

- 3D 装柜优化：CargoWiz（内置常见集装箱/卡车尺寸库、智能堆垛、卡车轴重计算）、EasyCargo（3D 可视化装载方案）；免费在线版有运鲸装柜计算器、智装箱。
- CBM / 体积重：CBM Calculator（多单位输入、多包裹合计、空运体积重）、UPS 计费重量计算器（实重 vs 体积重取大）；行业速算参考 20GP≈26-28 CBM、40GP≈56-58 CBM。

### 5. 合规 / 归类查询（Liao Tools 所在类）

- HS 编码查询：hsbianma、海关总署税则注释查询、i5a6（22 类 98 章目录浏览）、HSCIQ（中/美/日多国编码与监管条件对比）。
- 附加能力：进口宝典（税金成本计算、申报要素）、ChemicalBook（含退税率、监管条件）、店小秘 HS 编码查询。
- 报关状态：单一窗口凭报关单号/提运单号查通关状态。

多数在线 HS 工具附带**退税率和关税成本试算**——这是 Liao Tools 关税模块的自然延伸：本地已有 GB/XI 完整税率，加"按货值+运费算综合税负"试算器数据零依赖。

### 6. 单证制作

商业发票、装箱单、报关草单、提单补料的模板化生成。独立轻工具少见，多作为 ERP 内置模块——差异化机会：UPS/DPD 模板填充已验证该方向技术可行性。

## 与 Liao Tools 对照

| 能力 | Liao Tools | 市面同类 |
|---|---|---|
| 关税/合规查询 | ✅ GB/XI + 反倾销/反补贴 + Alta 禁运，离线库 | hsbianma 等在线查询，无反倾销细分 |
| 商品信息 | ✅ Amazon 16 国站点 | 多为选品软件附带 |
| 文件批处理 | ✅ 海铁/空运拆分、UPS/DPD 模板 | 多在 ERP 内 |
| 轨迹追踪 | ❌ | 17TRACK / AfterShip / SeaRates |
| 运价/CBM/体积重试算 | ❌ | SeaRates / Freightos / 免费计算器 |
| 装柜计算 | ❌ | CargoWiz / EasyCargo / 运鲸 |
| 单证生成 | ❌（UPS/DPD 算半个） | ERP 内置 |
| 退税/税负试算 | ❌（数据已在手） | HS 工具附带 |

## 建议切入点（按性价比排序）

### 1. 关税成本试算器（推荐首发）

在现有关税查询上叠加试算，数据零新增依赖：

- 输入：HS 编码（可带出已查税率）、货值 + 币种、运费/保费（CIF 构成）、原产地（中国原产触发反倾销/反补贴）、目的地（GB / XI）。
- 输出：从价/从量/复合税拆解、反倾销+反补贴叠加、进口 VAT、综合税负率与总成本；Excel 批量导入导出复用现有框架。
- 边界：明确标注"仅试算，非申报依据"；企业级条件税率按附加代码提示（如 D008），无法自动判定企业资格时不参与默认计算。
- 技术落点：`src/features/tax` 内扩展或独立子页；Rust 端复用 `tariffs.db` 查询命令；`withUsage()` 打点。

### 2. CBM / 体积重 / 计费重计算器

纯本地计算：多单位（cm/m/in/ft）、多包裹合计、实重 vs 体积重取大（可配置系数，空运 1:6000 / 快递 1:5000）、常用柜型容量速查；支持 Excel 批量出结果。与现有文件处理优势吻合。

### 3. 运单 / 集装箱轨迹批量查询

Rust 端集成 17TRACK 公开接口或船公司 API：批量单号自动识别承运商、节点时间线、异常状态高亮、Excel 导入导出。是"业务查询"分组里用户感知最强的新功能；需评估接口稳定性与配额。

### 4. 装柜计算（简化版）

本地算法：常见柜型/卡车规格库 + 装载率计算 + 简单排布示意，定位免费替代 CargoWiz 的简化需求；3D 可视化可作为远期目标。

## 参考链接

- 货代软件：https://baike.baidu.com/item/货代软件/4908497 · https://zhuanlan.zhihu.com/p/512595483
- 跨境物流系统对比：https://www.cnblogs.com/newjpz/p/21221580 · https://www.logipulse.com/zh/blog/what-are-the-features-to-expect-in-freight-forwarding-system-software
- 运价/报价：https://www.freightos.com · https://www.freightview.com · https://www.descartes.com/resources/knowledge-center/what-freight-quote-management-software
- 轨迹：https://www.17track.net · https://www.aftership.com/zh-hans/track · https://www.searates.com/cn/
- 装柜/计费：http://www.xunhetech.com/product.asp?id=187&classid=1 · https://www.shippingwhale.com/tools/?p=planner · https://play.google.com/store/apps/details?id=com.yntech.cbmcalculator · https://www.ups.com/cn/zh/supplychain/freight/chargeable-and-volumetric-weight-calculator · https://link.fobshanghai.com/tools/cuft.html
- 合规：https://www.hsbianma.com · https://hsciq.com/HSCN · https://www.jinkoubaodian.com · https://hscode.chemicalbook.com · http://www.customs.gov.cn/customs/302427/302442/jckszspjpmzscx/index.html · https://swapp.singlewindow.cn/qspserver/sw/qsp/query/view/export
