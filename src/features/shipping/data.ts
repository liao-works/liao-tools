/**
 * 船司名录静态数据。收录全球主要集装箱船司的官网与货物跟踪入口，
 * 按行业常用热度排序。数据以物流巴巴船公司大全
 * （https://www.5688.cn/ship，2026-10-19 抓取）为底稿整理。
 *
 * 整理时修正了源站的部分脏数据：
 * - 源站把缺协议头的链接渲染成了站内相对路径（如 5688.cn/www.eimskip.com），
 *   已还原为真实地址；无法还原的置空（新东船务、FREESEAS、卡塔尔航运）。
 * - NSCSA 的英文名源站误写为无关机构名，已更正为沙特国家航运公司。
 * - 德国非洲航运（DAL）源站无中文名，英文名移入 en 字段。
 */
export interface ShippingLine {
  /** 船司代码，如 MSK / EMC */
  code: string;
  /** 中文名（部分船司无） */
  cn: string;
  /** 英文全称 */
  en: string;
  /** 官网；空字符串表示源站链接已失效 */
  official: string;
  /** 货物跟踪页；空字符串表示源站未提供可用入口 */
  tracking: string;
}

export const SHIPPING_LINES_SOURCE_URL = 'https://www.5688.cn/ship';
export const SHIPPING_LINES_CAPTURED_AT = '2026-10-19';

export const SHIPPING_LINES: ShippingLine[] = [
  { code: 'ONE', cn: '海洋网联船务', en: 'Ocean Network Express', official: 'https://www.one-line.com/', tracking: 'https://www.one-line.com/' },
  { code: 'EMC', cn: '长荣海运', en: 'EVERGREEN MARINE CORPORATION', official: 'http://www.evergreen-marine.com/', tracking: 'http://www.shipmentlink.com/servlet/TDB1_CargoTracking.do' },
  { code: 'HMM', cn: '韩新海运', en: 'HMM SHIPPING AGENCY CO.LTD', official: 'http://www.hmm21.com/', tracking: 'https://www.hmm21.com/e-service/general/DashBoard.do' },
  { code: 'COSCO', cn: '中远海运', en: 'COSCO CONTAINER LINES CO., LTD.', official: 'http://lines.coscoshipping.com/home/', tracking: 'http://elines.coscoshipping.com/ebusiness/' },
  { code: 'MSC', cn: '地中海航运', en: 'MEDITERRANEAN SHIPPING COMPANY S.A.', official: 'https://www.msc.com/', tracking: 'https://www.msc.com/cn' },
  { code: 'CMA', cn: '达飞轮船', en: 'CMA CGM S.A.', official: 'https://www.cma-cgm.com/', tracking: 'https://www.cma-cgm.com/' },
  { code: 'MSK', cn: '马士基', en: 'MAERSK-SEALAND', official: 'http://www.maerskline.com/zh-cn/', tracking: 'https://my.maerskline.com/' },
  { code: 'YML', cn: '阳明海运', en: 'YANG MING MARINE TRANSPORT CORP.', official: 'http://www.yangming.com/', tracking: 'http://www.yangming.com/e-service/track_trace/track_trace_cargo_tracking.aspx' },
  { code: 'OOCL', cn: '东方海外', en: 'ORIENT OVERSEAS CONTAINER LINES', official: 'http://www.oocl.com/', tracking: 'http://www.oocl.com/schi/' },
  { code: 'HPL', cn: '赫伯罗特', en: 'HAPAG-LLOYD CONTAINER LINE', official: 'http://www.hapag-lloyd.com/', tracking: 'https://www.hapag-lloyd.com/en/online-business/tracing/tracing-by-container.html' },
  { code: 'WHL', cn: '万海航运', en: 'WAN HAI LINES LTD.', official: 'https://www.wanhai.com/', tracking: 'https://www.wanhai.com/' },
  { code: 'KMTC', cn: '高丽海运', en: 'KOREA MARINE TRANSPORT CO., LTD.', official: 'http://www.kmtc.co.kr/', tracking: 'http://www.ekmtc.com/' },
  { code: 'ZIM', cn: '以星航运', en: 'ZIM Integrated Shipping Services Ltd.', official: 'https://www.zim.com/', tracking: 'https://www.zim.com/tools/track-a-shipment' },
  { code: 'CUL', cn: '中联航运', en: 'CHINA UNITED LINES,.LTD', official: 'http://www.culines.com/', tracking: 'http://www.culines.com/cnt/' },
  { code: 'MCC', cn: 'MCC运输', en: 'Mercantile Cargo Consolidators (MCC)', official: 'https://www.sealandmaersk.com.cn/', tracking: 'https://www.sealandmaersk.com.cn/' },
  { code: 'PIL', cn: '太平船务', en: 'PACIFIC INTERNATIONAL LINES (PTE) LTD.', official: 'http://www.pilship.com/', tracking: 'https://www.pilship.com/en-our-track-and-trace-pil-pacific-international-lines/120.html' },
  { code: 'SML', cn: '森罗商船', en: 'SM LINE Corp.', official: 'https://smlines.com/cn/', tracking: 'https://esvc.smlines.com/smline/CUP_HOM_3301.do' },
  { code: 'IAL', cn: '运达航运', en: 'INTERASIA LINE', official: 'http://www.interasia.cc/', tracking: 'http://www.interasia.cc/' },
  { code: 'TSL', cn: '德翔海运', en: 'T.S.LINES CO., LTD', official: 'http://www.tslines.com/', tracking: 'https://www.tslines.com.cn/cn/tracking' },
  { code: 'ASL', cn: '亚海航运', en: 'ASEAN SEAS LINE CO., LIMITED', official: 'http://www.line-asl.com/', tracking: 'http://nj.gzwhir.com:8001/axe201407097458/wmfw/index_18.aspx?cid=61' },
  { code: 'RCL', cn: '宏海箱运', en: 'REGIONAL CONTAINER LINES', official: 'http://www.rclgroup.com/', tracking: 'http://www.rclgroup.com/' },
  { code: 'SITC', cn: '海丰国际', en: 'SITC INTERNATIONAL HOLDINGS CO., LTD.', official: 'https://www.sitcline.com/', tracking: 'https://ebusiness.sitcline.com/#/home' },
  { code: 'APL', cn: '美国总统', en: 'AMERICAN PRESIDENT LINES LIMITED', official: 'https://www.apl.com/', tracking: 'https://www.apl.com/wps/portal/apl/apl-home/etools/tracking' },
  { code: 'MATSON', cn: '美森轮船', en: 'MATSON NAVIGATION COMPANY', official: 'http://www.matson.com/', tracking: 'https://www.matson.com/vcsc/VisibilityController' },
  { code: 'MOL', cn: '商船三井', en: 'MITSUI O.S.K. LINES LTD.', official: 'http://www.mol.co.jp/', tracking: 'http://cms.molpower.com/' },
  { code: 'CNC', cn: '正利航运', en: 'CHENG LIE NAVIGATION (HONG KONG) CO., LTD.', official: 'http://www.cnc-line.com/', tracking: 'http://www.cnc-line.com/' },
  { code: 'CCL', cn: '中通海运', en: 'CENTRANS INTERNATIONAL MARINE SHIPPING CO.,LTD', official: 'http://www.centrans-ccl.com/', tracking: 'http://www.centrans-ccl.com/' },
  { code: 'ESL', cn: '阿联酋航运', en: 'EMIRATES SHIPPING LINE DMCEST', official: 'http://www.emiratesline.com/', tracking: 'http://www.emiratesline.com/' },
  { code: 'HEUNG-A', cn: '兴亚海运', en: 'Heung-A Shipping Co.,Ltd.', official: 'http://www.heungaline.com/', tracking: 'https://ebiz.heungaline.com/Tracking' },
  { code: 'HDSL', cn: '伊朗国航', en: 'Hafez Darya Shipping Lines Company.', official: 'http://www.hdslines.com/', tracking: 'http://www.hltsz.com.cn/cargotracking.php' },
  { code: 'SINOKOR', cn: '长锦商船', en: 'Sinokor Merchant Marine Co., Ltd,', official: 'http://www.sinokor.co.kr/', tracking: 'http://www.sinokor.co.kr/' },
  { code: 'JINJIANG', cn: '锦江航运', en: 'SHANGHAI JINJIANG SHIPPING CO., LTD.', official: 'http://www.jjshipping.cn/', tracking: 'http://ejj.jjshipping.cn/cntrtracker' },
  { code: 'EAS', cn: '达通航运', en: 'EAS INTERNATIONAL SHIPPING CO., LTD.', official: 'http://www.easline.com/', tracking: 'http://www.easline.com/' },
  { code: 'SLS', cn: '海领船务', en: 'Sea Leads shipping', official: 'https://sea-lead.com/', tracking: 'https://sea-lead.com/' },
  { code: 'SNL', cn: '中国外运', en: 'SINOTRANS CONTAINER LINES CO., LTD.', official: 'http://www.sinotrans.com/', tracking: 'http://www.sinolines.com/eservice/ecargo.aspx' },
  { code: 'NSS', cn: '南星海运', en: 'NANSUNG SHIPPING CO.,LTD.', official: 'http://www.namsung.co.kr/', tracking: 'https://ebiz.namsung.co.kr/' },
  { code: 'NYK', cn: '日本邮船', en: 'NIPPON YUSEN KAISHA LINE', official: 'http://www.nykline.com/', tracking: 'https://www.nykline.com/ecom/CUP_HOM_3000.do?redir=Y' },
  { code: 'GSL', cn: '金星轮船', en: 'GOLD STAR LINE LTD.', official: 'http://www.gslltd.com.hk/', tracking: 'http://www.gslltd.com.hk/cargo_tracing.html' },
  { code: 'BAL', cn: '博亚海运', en: 'BAL Container Line CO.,LTD', official: 'http://www.balgroup.cn/', tracking: 'http://www.balgroup.cn/' },
  { code: 'UASC', cn: '阿拉伯轮船', en: 'UNITED ARAB SHIPPING CO. (S.A.G.)', official: 'http://www.uasc.net/', tracking: 'http://uasconline.uasc.net/Home' },
  { code: 'CSCL', cn: '中海集运', en: 'CHINA SHIPPING CONTAINER LINES CO., LTD.', official: 'http://www.cscl.com.cn/', tracking: 'http://csp.cscl.com.cn/cargo_track/' },
  { code: 'SWIRE', cn: '太古船务', en: 'Swire Shipping Co.,Ltd', official: 'http://www.swireshipping.com/', tracking: 'https://www.swireshipping.com/' },
  { code: 'HAM-SUD', cn: '汉堡南美', en: 'Hamburg Sud Group', official: 'http://www.hamburgsud-line.com/', tracking: 'https://ecom.hamburgsud.com/ecom/en/ecommerce_portal/track_trace/track__trace/ep_trackandtrace.xhtml?lang=EN' },
  { code: 'MSL', cn: '民生轮船', en: 'MINSHENG SHIPPING CO,.LTD.', official: 'http://www.mssco.net/', tracking: 'http://www.mssco.net/Eip/Svc/wfCargoTracking.aspx' },
  { code: 'ZHONGGU', cn: '中谷海运', en: 'zhonggu shipping', official: 'http://www.zhonggushipping.com/', tracking: 'http://dingcang.zhonggu56.com/views/CargoStrack/CargoStrack.jsp' },
  { code: 'CKL', cn: '天敬海运', en: 'CHUN KYUNG Shipping Co.,Ltd.', official: 'http://www.ckline.co.kr/', tracking: 'http://www.ckline.co.kr/' },
  { code: 'ANL', cn: '澳洲航运', en: 'ANL CONTAINER LINE PTY LIMITED', official: 'http://www.anl.com.au/', tracking: 'http://www.anl.com.au/ebusiness/tracking' },
  { code: 'BENLINE', cn: '边航', en: 'BENLINE AGENCIES LTD', official: 'http://www.benlineagencies.com/', tracking: 'http://www.benlineagencies.com/' },
  { code: 'KLINE', cn: '川崎汽船', en: 'KAWASAKI KISEN KAISHA LTD', official: 'http://www.kline.com.cn/', tracking: 'http://ecom.kline.com/tracking' },
  { code: 'HANJIN', cn: '韩进海运', en: 'HANJIN SHIPPING CO., LTD.', official: 'http://www.hanjin.com/', tracking: 'http://www.hanjin.com/' },
  { code: 'HASCO', cn: '海华轮船', en: 'SHANGHAI HAIHUA SHIPPING CO.,LTD', official: 'http://www.hasco.com.cn/', tracking: 'http://www.hasco.com.cn/' },
  { code: 'ANTONG', cn: '安通控股', en: 'Antong Holdings Co.,ltd', official: 'http://www.antong56.com/index', tracking: 'http://www.antong56.com/biz/tracking' },
  { code: 'DYS', cn: '东映海运', en: 'Dong Young Shipping Co.,Ltd.', official: 'http://www.pcsline.co.kr/', tracking: 'http://www.pcsline.co.kr/' },
  { code: 'SCL', cn: '比利时南航公司', en: 'Safmarine', official: 'https://www.safmarine.com/', tracking: 'https://www.safmarine.com/' },
  { code: 'WFL', cn: '永发航运', en: 'WIN-FAST LINE LTD.', official: 'http://www.win-fl.com/', tracking: 'http://www.win-fl.com/' },
  { code: 'VOLTA', cn: '瓦尔塔航运', en: 'Volta Container Line Private Limited', official: 'https://voltacontainerline.com/', tracking: 'https://tracking.voltacontainerline.com/tracking/' },
  { code: 'FESCO', cn: '远东轮船', en: 'FAR-EASTERN SHIPPING CO.,LTD', official: 'http://www.fesco.com/', tracking: 'http://www.fesco.ru/en/index.html' },
  { code: 'CO-HEUNG', cn: '京汉海运', en: 'CO HEUNG SHIPPING CO., LTD.', official: 'http://www.heung-a.co.kr/', tracking: 'http://www.heung-a.co.kr/' },
  { code: 'DJS', cn: '东进商船', en: 'Dongjin Shipping co, Ltd', official: 'http://www.djship.co.kr/', tracking: 'http://www.djship.co.kr/' },
  { code: 'NOS', cn: '新东船务', en: 'NEW ORIENT LINES', official: '', tracking: '' },
  { code: 'PERMA', cn: '普洱马箱运', en: 'PERMA CONTAINER (UK) LINE LTD', official: 'http://permacontainerline.com/', tracking: 'http://permacontainerline.com/' },
  { code: 'TCLC', cn: '太仓港箱运', en: 'Taicang Container Lines Co., Ltd.', official: 'http://www.tclcline.com.cn/', tracking: 'http://www.tclcline.com.cn/' },
  { code: 'AAL', cn: '澳亚航运', en: 'Austral Asia Line', official: 'http://www.australasialine.com/', tracking: 'http://www.australasialine.com/' },
  { code: 'ACL', cn: '大西洋箱运', en: 'ATLANTIC CONTAINER LINE', official: 'http://www.aclcargo.com/', tracking: 'http://www.aclcargo.com/' },
  { code: 'KYOWA', cn: '协和海运', en: 'Kyowa Shipping Co., Ltd.', official: 'http://www.kyowa-line.co.jp/', tracking: 'http://www.kyowa-line.co.jp/' },
  { code: 'MARIANA', cn: '玛丽亚那船公司', en: 'MARIANA EXPRESS LINES LIMITED', official: 'https://www.mellship.com/', tracking: 'https://www.mellship.com/' },
  { code: 'WOSCO', cn: '西海航运', en: 'WEST OCEAN SHIPPING COMPANY LIMITED', official: 'http://www.wosco.com/', tracking: 'http://www.wosco.com/' },
  { code: 'HEDE', cn: '合德海运', en: 'HEDE (HONGKONG) INTERNATIONAL SHIPPING LIMITED', official: 'http://www.hedehk.com/', tracking: 'http://www.hedehk.com/' },
  { code: 'SAFMARINE', cn: '南非航运', en: 'SAFMARINE CONTAINER LINES N.V.', official: 'http://mysaf2.safmarine.com/', tracking: 'http://mysaf2.safmarine.com/' },
  { code: 'HARBOUR', cn: '港业航运', en: 'Harbour-Link Group Bhd', official: 'http://www.hll.com.my/', tracking: 'http://www.hll.com.my/' },
  { code: 'CTS', cn: '宝华海运', en: 'Coastal line.', official: 'http://www.coastal.com.tw/', tracking: 'http://www.coastal.com.tw/' },
  { code: 'KANWAY', cn: '建华海运', en: 'KANWAY LINE COMPANY LIMITED', official: 'http://www.kanway.tw/', tracking: 'http://www.kanway.tw/' },
  { code: 'PAN-OCEAN', cn: '世腾泛洋', en: 'PAN OCEAN CO., LTD', official: 'http://www.panocean.com/', tracking: 'http://www.panocean.com/' },
  { code: 'ONTO', cn: '安通船务', en: 'Onto Shipping International Inc', official: 'http://www.onto.cn/', tracking: 'http://www.onto.cn/' },
  { code: 'ALIANCA', cn: '亚利安莎航运', en: 'Alianca Navegacao e Logistica Ltda', official: 'http://www.alianca.com.br/', tracking: 'http://www.alianca.com.br/' },
  { code: 'CSAV', cn: '南美轮船', en: 'COMPANIA CHILENA DE NAVEGACION INTEROCEANICA S.A', official: 'http://www.csav.com/', tracking: 'http://www.csav.com/' },
  { code: 'CCNI', cn: '智利航运', en: 'COMPANIA CHILENA DE NAVEGACION INTEROCEANICA S.A.', official: 'http://ww.ccni.cl/', tracking: 'http://ww.ccni.cl/' },
  { code: 'SSL', cn: '萨姆达拉船务', en: 'SAMUDERA SHIPPING LINE LTD.', official: 'https://www.samudera.id/', tracking: 'https://www.samudera.id/' },
  { code: 'QMNS', cn: '诺扬航运', en: 'QINGDAO MARINE NOAH’S ARK SHIPPING CO.,LTD.', official: 'http://www.noahshipping.cn/', tracking: 'http://www.noahshipping.cn/' },
  { code: 'FSCS', cn: 'FREESEAS', en: 'FREESEAS CONTAINER SHIPPING LLC', official: '', tracking: '' },
  { code: 'KKC', cn: '神原汽船', en: 'KAMBARA KISEN CO., LTD.', official: 'http://www.kambara-kisen.co.jp/', tracking: 'http://www.kambara-kisen.co.jp/' },
  { code: 'TYS', cn: '太荣商船', en: 'TaiyoungShipping Co., Ltd.', official: 'http://www.taiyoungship.co.kr/', tracking: 'http://www.taiyoungship.co.kr/' },
  { code: 'WEIDONG', cn: '威东航运', en: 'Weidong Ferry Co., Ltd.', official: 'http://www.weidong.com/', tracking: 'http://cargo.weidong.com/cn/index.do?lang=zh_CN' },
  { code: 'TMSC', cn: '天津海运船公司', en: 'TIANJIN MARINE SHIPPING CO.,LTD.', official: 'https://www.chinapp.com/pinpai/113605', tracking: 'https://www.chinapp.com/pinpai/113605' },
  { code: 'UAFL', cn: 'UAFL', en: 'UNITED AFRICA FEEDER LINE', official: 'http://www.uaflshipping.com/', tracking: 'https://www.uaflshipping.com/home/tracking' },
  { code: 'BSL', cn: '巴拉基船务', en: 'BALAJI SHIPPING CO.,LTD.', official: 'http://www.transworld.com/balaji/index.html', tracking: 'http://www.transworld.com/balaji/tracking.html' },
  { code: 'SIMATECH', cn: '西马泰克航运', en: 'Simatech Shipping', official: 'http://www.simatech.com/', tracking: 'http://www.simatech.com/' },
  { code: 'FPMC', cn: '台塑海运', en: 'Formosa Plastics Marine Corp', official: 'http://www.fpmc.com.tw/', tracking: 'http://www.fpmc.com.tw/' },
  { code: 'HARVEST', cn: '鹭丰船务', en: 'HARVEST SHIPPING CO.,LTD', official: 'http://www.xhsl.com.hk/', tracking: 'http://www.xhsl.com.hk/' },
  { code: 'ARKAS', cn: 'Arkas Container', en: 'Arkas Container Transport S.A.', official: 'http://www.arkasline.com.tr/', tracking: 'https://tracking.arkasline.com.tr/ContainerTracking/' },
  { code: 'GOTO', cn: '共同海运', en: 'GOTO SHIPPING INT’L INC.', official: 'http://www.gotoshipping.cn/', tracking: 'http://www.gotoshipping.cn/' },
  { code: 'SPIL', cn: '萨拉姆太平洋航运公司', en: 'PT. SALAM PACIFIC INDONESIA LINES', official: 'http://www.spil.co.id/', tracking: 'http://www.spil.co.id/spilcoid_s1l/home/scheduletrack' },
  { code: 'NDS', cn: '尼罗河航运', en: 'NILE DUTCH AFRICA LINE', official: 'http://www.niledutch.com/', tracking: 'http://www.niledutch.com/' },
  { code: 'UGL', cn: '联合环球航运', en: 'Uniglobal Shipping Company Limited', official: 'http://www.uglines.com/', tracking: 'http://www.uglines.com/' },
  { code: 'EIMSKIP', cn: '冰岛Eimskip', en: 'Eimskip', official: 'https://www.eimskip.com/', tracking: 'https://www.eimskip.com/' },
  { code: 'SLG', cn: '海杰航运', en: 'Sea Legend Shipping', official: 'https://www.slg-shipping.com/', tracking: 'https://www.slg-shipping.com/#/home/tracking' },
  { code: 'NBOS', cn: '宁波远洋', en: 'Ningbo Ocean Shipping Co., Ltd', official: 'http://www.nbosco.com/', tracking: 'http://www.nbosco.com/fthtml/dom/domBlCargoTrackingNew?barId=box7' },
  { code: 'DELMAS', cn: '达贸轮船', en: 'DELMAS S.A.', official: 'http://www.delmas.com/', tracking: 'http://ebusiness.cma-cgm.com/DELMAS/Tracking/Defau' },
  { code: 'GRIMALDI', cn: 'Grimaldi', en: 'Grimaldi Group', official: 'https://www.grimaldi.napoli.it/', tracking: 'https://www.grimaldi.napoli.it/' },
  { code: 'PHL', cn: '浦海航运', en: 'SHANGHAI PUHAI SHIPPING CO.,LTD.', official: 'http://www.puhaishipping.com/', tracking: 'http://222.66.158.222/puhaiebusiness/EBusiness/OceanCargoTracking.aspx' },
  { code: 'MISC', cn: '马来西亚航运', en: 'MISC Berhad', official: 'http://www.misc.com.my/', tracking: 'http://www.misc.com.my/' },
  { code: 'SCI', cn: '印度国航', en: 'THE SHIPPING CORPORATION OF INDIA LTD.', official: 'http://www.shipindia.com/', tracking: 'http://www.shipindia.com/' },
  { code: 'SHIDAO', cn: '石岛航运', en: 'SHIDAO FERRY CO.,LTD', official: 'https://www.shidaoferry.com/', tracking: 'https://www.shidaoferry.com/' },
  { code: 'MWS', cn: '马尾轮船', en: 'MAWEI SHIPPING CO.,LTD', official: 'http://www.maweiship.com/', tracking: 'http://www.maweiship.com/' },
  { code: 'STX', cn: '世腾船务', en: 'STX PAN OCEAN CO., LTD', official: 'http://www.stxpanocean.com/', tracking: 'http://www.stxpanocean.com/' },
  { code: 'GSS', cn: '大南航运', en: 'Great Southern Shipping Australia Pty. Ltd.', official: 'http://www.gsshipping.com.au/', tracking: 'http://www.gsshipping.com.au/' },
  { code: 'USL', cn: '美国轮船', en: 'United States Lines LLC', official: 'http://www.shipusl.com/', tracking: 'http://www.shipusl.com/' },
  { code: 'WFOE', cn: 'G2海洋', en: 'G2 Ocean Ltd', official: 'https://www.g2ocean.com/', tracking: 'https://www.g2ocean.com/' },
  { code: 'NEWPAC', cn: '新太平洋航运', en: 'New Pacific Line Co.,Ltd', official: 'http://www.newpacificline.com/', tracking: 'http://www.newpacificline.com/' },
  { code: 'NCL', cn: '北欧亚', en: 'NORASIA CONTAINER LINES LTD.', official: 'http://www.csavnorasia.com/', tracking: '' },
  { code: 'DAL', cn: '', en: 'Deutsche Afrika-Linien', official: 'http://www.dal.biz/', tracking: 'https://my.dal.biz/cts#/' },
  { code: 'SINOWELL', cn: '中良海运', en: 'Shenzhen Sinowell Logistics Group Co.,Ltd.', official: 'http://www.sinowell.cn/', tracking: 'http://www.sinowell.cn/container-tracking' },
  { code: 'SASCO', cn: '萨哈林航运', en: 'Sahalin shipping company', official: 'https://www.sasco.ru/', tracking: 'https://www.sasco.ru/' },
  { code: 'MERATUS', cn: '印尼迈瑞特斯航运', en: 'Meratus Line PT', official: 'https://www.meratus.com/', tracking: 'https://www.meratus.com/' },
  { code: 'HUBLINE', cn: '德利航运', en: 'HUB SHIPPING SDN BHD', official: 'http://www.hubline.com/', tracking: 'http://www.hubline.com/xapp/cargotracking.dll/EXEC' },
  { code: 'ILT', cn: '意邮', en: 'LLOYD TRIESTINO DI NAVIGAZIONE S.P.A.', official: 'http://www.italiamarittima.it/', tracking: 'http://www.italiamarittima.it/TDB1_LTCargoTrack.as' },
  { code: 'POSA', cn: '泛洋航运', en: 'HAINAN PO SHIPPING CO.,LTD', official: 'http://www.poshipping.com/cn/', tracking: 'http://www.poshipping.com/cn/' },
  { code: 'NSCSA', cn: '沙特航运', en: 'NATIONAL SHIPPING COMPANY OF SAUDI ARABIA (NSCSA)', official: 'http://www.nscsa.com/', tracking: 'http://www.nscsa.com/cargo_tracking.php' },
  { code: 'VASI', cn: '维萨航运', en: 'VASI Shipping Pte Ltd', official: 'http://www.vasishipping.com/', tracking: 'http://www.vasishipping.com/' },
  { code: 'HUADONG', cn: '荣成华东海运有限公司', en: 'HUADONG FERRY CO.,LTD', official: 'http://www.huadongferry.com/', tracking: 'http://www.huadongferry.com/' },
  { code: 'TASMAN', cn: '塔斯曼东方', en: 'TASMAN ORIENT LINE C.V.', official: 'http://www.tasmanorient.com/', tracking: 'https://www.swireshipping.com/web/index.jsp' },
  { code: 'OVP', cn: '海液通航运', en: 'OVP SHIPPING CO., LIMITED', official: 'http://www.ovpshipping.cn/index', tracking: 'http://www.ovpshipping.cn/goods/index' },
  { code: 'QNL', cn: '卡塔尔航运', en: 'Qatar Navigation Lines', official: '', tracking: '' },
  { code: 'MARUBA', cn: '马鲁巴航运', en: 'MARUBA S.C.A.', official: 'http://www.maruba.com.ar/', tracking: 'http://www.maruba.com.ar/' },
  { code: 'CSL', cn: '可达利航运', en: 'Cordelia Container Shipping Line', official: 'https://www.cordelialine.com/', tracking: 'https://www.cordelialine.com/' },
  { code: 'HXCW', cn: '鸿翔船务', en: 'HONGXIANG SHIPPING LINE', official: 'http://www.hxcw.com.cn/', tracking: 'http://www.hxcw.com.cn/' },
  { code: 'UNIFEEDER', cn: '优尼菲尔德', en: 'Unifeeder', official: 'https://www.unifeeder.com/', tracking: 'https://www.unifeeder.cargoes.com/tracking' },
  { code: 'LOGIN', cn: 'LogIn', en: 'Log-In Logistica Intermodal', official: 'https://www.loginlogistica.com.br/', tracking: 'https://www.loginlogistica.com.br/' },
  { code: 'OSC', cn: '阿曼航运', en: 'Asyad Line', official: 'https://www.asyadline.om/', tracking: 'https://www.asyadline.om/Eself/REGISTER/Tracking.asp' },
  { code: 'SCO', cn: '兴联海', en: 'SCO LINES COMPANY LIMITED', official: 'https://www.scolines.com/portal/', tracking: 'https://www.scolines.com/portal/' },
  { code: 'PANDA', cn: '熊猫快线', en: 'Panda Express Line, Limited Liability Company', official: 'https://www.pandexline.com/eng.html', tracking: 'https://www.pandexline.com/eng.html' },
  { code: 'REEL', cn: '瑞斯莱航运', en: 'Reel Shipping LLC', official: 'https://reelshipping.com/', tracking: 'https://reelshipping.com/' },
  { code: 'ELLERMAN', cn: '埃勒曼航运', en: 'Ellerman city liners', official: 'https://ellermanlines.com/', tracking: 'https://ellermanlines.com/' },
  { code: 'HAIAN', cn: '海安航运', en: 'Hai An Container Transport Company Limited', official: 'https://haiants.vn/', tracking: 'https://eservice.haiants.vn/' },
  { code: 'NNSL', cn: '硕佳航运', en: 'NEW NEW SHIPPING LINE', official: 'https://newnewship.com/', tracking: 'https://newnewship.com/' },
  { code: 'TURKON', cn: 'Turkon', en: 'Turkon line', official: 'https://www.turkon.com/', tracking: 'https://www.turkon.com/en/Container-Tracking.aspx' },
  { code: 'AST', cn: 'AST', en: 'Altera Shuttle Tankers L.L.C.', official: 'https://alterainfra.com/', tracking: 'https://alterainfra.com/' },
];

function codeLetter(line: ShippingLine): string | null {
  return /^[A-Za-z]/.test(line.code) ? line.code[0].toUpperCase() : null;
}

/** 数据中出现过的代码首字母，按 A–Z 排序，用于字母索引。 */
export function shippingLineLetters(): string[] {
  return [...new Set(SHIPPING_LINES.map(codeLetter).filter((l): l is string => l !== null))].sort();
}

/** 按关键词（代码 / 中文名 / 英文名）与首字母过滤船司；保持热度排序。 */
export function filterShippingLines(query: string, letter: string | null): ShippingLine[] {
  const q = query.trim().toLocaleLowerCase();
  return SHIPPING_LINES.filter((line) => {
    if (letter && codeLetter(line) !== letter) return false;
    if (!q) return true;
    return line.code.toLocaleLowerCase().includes(q)
      || line.cn.toLocaleLowerCase().includes(q)
      || line.en.toLocaleLowerCase().includes(q);
  });
}

/**
 * 单号识别。与目标站点（5688.cn/track）同一产品逻辑：识别单号类型与承运商后
 * 跳转官方查询页（快递转 17TRACK）。识别全部在本地完成，不依赖外部接口。
 *
 * 前缀映射只收录业界通行的主流船司代码，未命中不代表不支持——
 * 界面会引导用户改用 5688 识别或手动选择船司。
 */
export type TrackingNumberKind = 'sea-container' | 'sea-bl' | 'express' | 'air-mawb' | 'unknown';

export interface IdentifyResult {
  kind: TrackingNumberKind;
  /** 规范化后的单号（去空格连字符、转大写） */
  normalized: string;
  /** 识别到的船司（仅海运且前缀命中时） */
  line: ShippingLine | null;
  /** 快递商名（仅快递单号） */
  carrierLabel: string | null;
  /** 展示用类型名 */
  kindLabel: string;
}

/** 集装箱箱主代码（ISO 6346）→ 船司代码 */
const CONTAINER_PREFIX_TO_CODE: Record<string, string> = {
  MAEU: 'MSK', MRKU: 'MSK', MSKU: 'MSK',
  MSCU: 'MSC',
  CMAU: 'CMA',
  COSU: 'COSCO', CBHU: 'COSCO', CCLU: 'COSCO', CSNU: 'COSCO',
  EGHU: 'EMC', EGSU: 'EMC',
  ONEU: 'ONE', NYKU: 'ONE', MOLU: 'ONE',
  OOLU: 'OOCL', GLDU: 'OOCL',
  HLCU: 'HPL', HXLU: 'HPL',
  HDMU: 'HMM',
  YMLU: 'YML',
  ZIMU: 'ZIM',
  WHLU: 'WHL',
  PILU: 'PIL',
  SITU: 'SITC',
  KMTU: 'KMTC',
  TRLU: 'TSL',
  RCLU: 'RCL',
  APLU: 'APL',
};

/** 海运提单号前缀（SCAC 惯例）→ 船司代码 */
const BL_PREFIX_TO_CODE: Record<string, string> = {
  MAEU: 'MSK',
  MSCU: 'MSC',
  CMDU: 'CMA',
  COSU: 'COSCO',
  EGHU: 'EMC', EGLV: 'EMC',
  ONEY: 'ONE',
  OOLU: 'OOCL',
  HLCU: 'HPL',
  HDMU: 'HMM',
  YMLU: 'YML',
  ZIMU: 'ZIM',
  WHLU: 'WHL',
  SITU: 'SITC',
  APLU: 'APL',
  KMTU: 'KMTC',
  TRLU: 'TSL',
};

function lineByCode(code: string): ShippingLine | null {
  return SHIPPING_LINES.find((line) => line.code === code) ?? null;
}

function identifyNormalized(value: string): IdentifyResult {
  const normalized = value.trim().replace(/[\s-]/g, '').toUpperCase();
  if (!normalized) {
    return { kind: 'unknown', normalized, line: null, carrierLabel: null, kindLabel: '未识别' };
  }
  // 快递：UPS 起头 1Z、EMS 的 E+字母+9位+CN
  if (/^1Z[0-9A-Z]{10,16}$/.test(normalized)) {
    return { kind: 'express', normalized, line: null, carrierLabel: 'UPS', kindLabel: '快递单号（UPS）' };
  }
  if (/^E[A-Z]\d{9}CN$/.test(normalized)) {
    return { kind: 'express', normalized, line: null, carrierLabel: 'EMS', kindLabel: '快递单号（EMS）' };
  }
  // 海运集装箱：4 字母箱主代码 + 7 位数字（含校验位）
  if (/^[A-Z]{4}\d{7}$/.test(normalized)) {
    const line = lineByCode(CONTAINER_PREFIX_TO_CODE[normalized.slice(0, 4)] ?? '');
    return {
      kind: 'sea-container',
      normalized,
      line,
      carrierLabel: null,
      kindLabel: line ? `海运集装箱（${line.cn || line.en}）` : '海运集装箱',
    };
  }
  // 海运提单：字母前缀 + 6~12 位数字
  if (/^[A-Z]{4}\d{6,12}$/.test(normalized)) {
    const line = lineByCode(BL_PREFIX_TO_CODE[normalized.slice(0, 4)] ?? '');
    return {
      kind: 'sea-bl',
      normalized,
      line,
      carrierLabel: null,
      kindLabel: line ? `海运提单（${line.cn || line.en}）` : '海运提单',
    };
  }
  // 空运主单 MAWB：3 位航司代码 + 8 位数字，共 11 位
  if (/^\d{11}$/.test(normalized)) {
    return { kind: 'air-mawb', normalized, line: null, carrierLabel: null, kindLabel: '空运主运单（MAWB）' };
  }
  return { kind: 'unknown', normalized, line: null, carrierLabel: null, kindLabel: '未识别' };
}

/** 识别运单号 / 提单号 / 柜号；识别不出时仍可交给 5688 或 17TRACK 尝试。 */
export function identifyTrackingNumber(raw: string): IdentifyResult {
  return identifyNormalized(raw);
}

/** 5688 货物追踪结果页地址（由其站内完成识别并跳转官方查询页）。 */
export function wubaliuTrackUrl(normalized: string, kind: TrackingNumberKind): string {
  const category = kind === 'air-mawb' ? 'air' : kind === 'express' ? 'express' : 'sea';
  return `https://www.5688.cn/track?no=${encodeURIComponent(normalized)}&category=${category}`;
}
