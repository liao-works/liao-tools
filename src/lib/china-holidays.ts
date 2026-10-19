/**
 * 中国法定节假日与调休补班数据。
 * 来源：holiday-cn（github.com/NateScarlet/holiday-cn，MIT），收录国务院办公厅公布的放假日历。
 * 新一年放假安排公布后，向 DAYS 追加即可；数据离线打包，不依赖网络。
 */

interface HolidayDay {
  /** 假期名称 */
  name: string;
  /** yyyy-MM-dd */
  date: string;
  /** true = 放假日；false = 调休补班日 */
  isOffDay: boolean;
}

const DAYS: HolidayDay[] = [
  // ---- 2025（国务院办公厅 2024 年 11 月公布）----
  { name: '春节', date: '2025-01-26', isOffDay: false },
  { name: '春节', date: '2025-01-28', isOffDay: true },
  { name: '春节', date: '2025-01-29', isOffDay: true },
  { name: '春节', date: '2025-01-30', isOffDay: true },
  { name: '春节', date: '2025-01-31', isOffDay: true },
  { name: '春节', date: '2025-02-01', isOffDay: true },
  { name: '春节', date: '2025-02-02', isOffDay: true },
  { name: '春节', date: '2025-02-03', isOffDay: true },
  { name: '春节', date: '2025-02-04', isOffDay: true },
  { name: '春节', date: '2025-02-08', isOffDay: false },
  { name: '元旦', date: '2025-01-01', isOffDay: true },
  { name: '清明节', date: '2025-04-04', isOffDay: true },
  { name: '清明节', date: '2025-04-05', isOffDay: true },
  { name: '清明节', date: '2025-04-06', isOffDay: true },
  { name: '劳动节', date: '2025-04-27', isOffDay: false },
  { name: '劳动节', date: '2025-05-01', isOffDay: true },
  { name: '劳动节', date: '2025-05-02', isOffDay: true },
  { name: '劳动节', date: '2025-05-03', isOffDay: true },
  { name: '劳动节', date: '2025-05-04', isOffDay: true },
  { name: '劳动节', date: '2025-05-05', isOffDay: true },
  { name: '端午节', date: '2025-05-31', isOffDay: true },
  { name: '端午节', date: '2025-06-01', isOffDay: true },
  { name: '端午节', date: '2025-06-02', isOffDay: true },
  { name: '国庆节、中秋节', date: '2025-09-28', isOffDay: false },
  { name: '国庆节、中秋节', date: '2025-10-01', isOffDay: true },
  { name: '国庆节、中秋节', date: '2025-10-02', isOffDay: true },
  { name: '国庆节、中秋节', date: '2025-10-03', isOffDay: true },
  { name: '国庆节、中秋节', date: '2025-10-04', isOffDay: true },
  { name: '国庆节、中秋节', date: '2025-10-05', isOffDay: true },
  { name: '国庆节、中秋节', date: '2025-10-06', isOffDay: true },
  { name: '国庆节、中秋节', date: '2025-10-07', isOffDay: true },
  { name: '国庆节、中秋节', date: '2025-10-08', isOffDay: true },
  { name: '国庆节、中秋节', date: '2025-10-11', isOffDay: false },
  // ---- 2026（国务院办公厅 2025 年 11 月公布）----
  { name: '元旦', date: '2026-01-01', isOffDay: true },
  { name: '元旦', date: '2026-01-02', isOffDay: true },
  { name: '元旦', date: '2026-01-03', isOffDay: true },
  { name: '元旦', date: '2026-01-04', isOffDay: false },
  { name: '春节', date: '2026-02-14', isOffDay: false },
  { name: '春节', date: '2026-02-15', isOffDay: true },
  { name: '春节', date: '2026-02-16', isOffDay: true },
  { name: '春节', date: '2026-02-17', isOffDay: true },
  { name: '春节', date: '2026-02-18', isOffDay: true },
  { name: '春节', date: '2026-02-19', isOffDay: true },
  { name: '春节', date: '2026-02-20', isOffDay: true },
  { name: '春节', date: '2026-02-21', isOffDay: true },
  { name: '春节', date: '2026-02-22', isOffDay: true },
  { name: '春节', date: '2026-02-23', isOffDay: true },
  { name: '春节', date: '2026-02-28', isOffDay: false },
  { name: '清明节', date: '2026-04-04', isOffDay: true },
  { name: '清明节', date: '2026-04-05', isOffDay: true },
  { name: '清明节', date: '2026-04-06', isOffDay: true },
  { name: '劳动节', date: '2026-05-01', isOffDay: true },
  { name: '劳动节', date: '2026-05-02', isOffDay: true },
  { name: '劳动节', date: '2026-05-03', isOffDay: true },
  { name: '劳动节', date: '2026-05-04', isOffDay: true },
  { name: '劳动节', date: '2026-05-05', isOffDay: true },
  { name: '劳动节', date: '2026-05-09', isOffDay: false },
  { name: '端午节', date: '2026-06-19', isOffDay: true },
  { name: '端午节', date: '2026-06-20', isOffDay: true },
  { name: '端午节', date: '2026-06-21', isOffDay: true },
  { name: '国庆节', date: '2026-09-20', isOffDay: false },
  { name: '中秋节', date: '2026-09-25', isOffDay: true },
  { name: '中秋节', date: '2026-09-26', isOffDay: true },
  { name: '中秋节', date: '2026-09-27', isOffDay: true },
  { name: '国庆节', date: '2026-10-01', isOffDay: true },
  { name: '国庆节', date: '2026-10-02', isOffDay: true },
  { name: '国庆节', date: '2026-10-03', isOffDay: true },
  { name: '国庆节', date: '2026-10-04', isOffDay: true },
  { name: '国庆节', date: '2026-10-05', isOffDay: true },
  { name: '国庆节', date: '2026-10-06', isOffDay: true },
  { name: '国庆节', date: '2026-10-07', isOffDay: true },
  { name: '国庆节', date: '2026-10-10', isOffDay: false },
];

const LOOKUP = new Map(DAYS.map((day) => [day.date, { name: day.name, isOffDay: day.isOffDay }]));

export interface ChinaHoliday {
  /** 假期名称（调休补班日为所属假期名） */
  name: string;
  /** true = 放假日；false = 调休补班日 */
  isOffDay: boolean;
}

/** 查询某日是否法定假日/调休补班；dateKey 格式 yyyy-MM-dd */
export function getChinaHoliday(dateKey: string): ChinaHoliday | undefined {
  return LOOKUP.get(dateKey);
}
