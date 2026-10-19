import { useEffect, useState } from 'react';
import { addDays, startOfDay } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MonthGrid } from './MonthGrid';

interface DueDatePopoverProps {
  /** 当前到期日（当日本地零点毫秒时间戳），undefined = 未设置 */
  value?: number;
  onChange: (value: number | undefined) => void;
  /** 触发器元素（PopoverTrigger asChild） */
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
}

/** 到期日选择弹层：月历 + 今天/明天快捷项 + 清除，供新增表单与任务行复用 */
export function DueDatePopover({ value, onChange, children, align = 'start' }: DueDatePopoverProps) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date());

  useEffect(() => {
    if (open) setMonth(value ? new Date(value) : new Date());
  }, [open, value]);

  const pick = (day: Date) => {
    onChange(startOfDay(day).getTime());
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-auto p-3" align={align}>
        <MonthGrid
          month={month}
          selected={value !== undefined ? new Date(value) : undefined}
          markers={{}}
          onMonthChange={setMonth}
          onSelect={pick}
        />
        <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
          <div className="flex gap-1">
            <Button
              type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs"
              onClick={() => pick(new Date())}
            >
              今天
            </Button>
            <Button
              type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs"
              onClick={() => pick(addDays(new Date(), 1))}
            >
              明天
            </Button>
          </div>
          {value !== undefined && (
            <Button
              type="button" variant="ghost" size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
            >
              清除
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
