import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ToolCategory } from '@/types';

interface ToolCategoryFilterProps {
  selectedCategory: ToolCategory | 'all';
  onCategoryChange: (category: ToolCategory | 'all') => void;
}

const categories = [
  { value: 'all' as const, label: '全部', icon: '📋' },
  { value: 'system' as const, label: '系统', icon: '⚙️' },
  { value: 'utility' as const, label: '实用', icon: '🔧' },
  { value: 'development' as const, label: '开发', icon: '💻' },
  { value: 'media' as const, label: '媒体', icon: '🎨' },
  { value: 'custom' as const, label: '自定义', icon: '✨' },
];

export function ToolCategoryFilter({
  selectedCategory,
  onCategoryChange,
}: ToolCategoryFilterProps) {
  return (
    <div className="flex max-w-full flex-wrap gap-1.5" role="group" aria-label="工具分类">
      {categories.map((category) => (
        <Button
          key={category.value}
          variant={selectedCategory === category.value ? 'default' : 'outline'}
          size="sm"
          onClick={() => onCategoryChange(category.value)}
          aria-pressed={selectedCategory === category.value}
          className={cn(
            'gap-2',
            selectedCategory === category.value && 'shadow-md'
          )}
        >
          <span aria-hidden="true">{category.icon}</span>
          <span>{category.label}</span>
        </Button>
      ))}
    </div>
  );
}
