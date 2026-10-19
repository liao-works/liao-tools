import { useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface MonthMarker {
  /** 当日待办总数 */
  count: number;
  /** 标记点颜色（未完成任务的优先级色），最多展示 3 个 */
  dots: string[];
}

interface MonthGridProps {
  /** 当前展示月份（传该月任意日期） */
  month: Date;
  selected?: Date;
  markers?: Record<string, MonthMarker>;
  onMonthChange: (month: Date) => void;
  onSelect?: (day: Date) => void;
  /** 有标记的格子 hover 时浮出的内容（可省略；浮层只在有标记时出现） */
  renderHover?: (day: Date) => React.ReactNode;
}

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

export const dayKey = (day: Date) => format(day, 'yyyy-MM-dd');

/** 迷你月历：周一起始；格内为日期数字 + 可选的待办标记（点 + 条数） */
export function MonthGrid({ month, selected, markers, onMonthChange, onSelect, renderHover }: MonthGridProps) {
  const [hovered, setHovered] = useState<Date | null>(null);
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);
  const today = new Date();

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <Button
          type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="上一月"
          onClick={() => onMonthChange(addMonths(month, -1))}
        >
          <ChevronLeft size={15} />
        </Button>
        <span className="text-sm font-medium">{format(month, 'yyyy年M月')}</span>
        <Button
          type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="下一月"
          onClick={() => onMonthChange(addMonths(month, 1))}
        >
          <ChevronRight size={15} />
        </Button>
      </div>
      <div className="grid grid-cols-7 text-center">
        {WEEK_LABELS.map((label) => (
          <span key={label} className="py-1 text-xs text-muted-foreground">{label}</span>
        ))}
        {days.map((day, index) => {
          const key = dayKey(day);
          const marker = markers?.[key];
          const inMonth = isSameMonth(day, month);
          const isSelected = selected ? isSameDay(day, selected) : false;
          const isToday = isSameDay(day, today);
          const column = index % 7;
          const showHover = hovered !== null && isSameDay(hovered, day) && !!marker?.count && !!renderHover;
          return (
            <div key={key} className="relative flex justify-center px-0.5">
              <button
                type="button"
                onClick={() => onSelect?.(day)}
                onMouseEnter={() => setHovered(day)}
                onMouseLeave={() => setHovered(null)}
                className={cn(
                  'flex h-11 w-full flex-col items-center justify-center gap-0.5 rounded-md text-xs transition-colors',
                  inMonth ? 'text-foreground' : 'text-muted-foreground/50',
                  isSelected ? 'bg-primary font-medium text-primary-foreground' : 'hover:bg-muted',
                  isToday && !isSelected && 'ring-1 ring-primary/60',
                )}
              >
                <span>{format(day, 'd')}</span>
                {marker?.count ? (
                  <span className="flex items-center gap-1 leading-none">
                    <span className="flex gap-0.5">
                      {marker.dots.slice(0, 3).map((color, i) => (
                        <span
                          key={i}
                          className="h-1 w-1 rounded-full"
                          style={{ backgroundColor: isSelected ? 'currentColor' : color }}
                        />
                      ))}
                    </span>
                    <span className="text-[10px] opacity-80">{marker.count}</span>
                  </span>
                ) : (
                  <span className="h-2.5" />
                )}
              </button>
              {showHover && (
                <div
                  className={cn(
                    'absolute top-full z-20 mt-1 w-56 rounded-lg border border-border bg-popover p-2.5 text-left shadow-md',
                    column === 0 && 'left-0',
                    column === 6 && 'right-0',
                    column > 0 && column < 6 && 'left-1/2 -translate-x-1/2',
                  )}
                >
                  {renderHover!(day)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
