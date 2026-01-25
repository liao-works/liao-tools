import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DisplayTool } from '@/types';
import { cn } from '@/lib/utils';
import { getIconComponent } from '@/lib/system-tools';
import { LucideIcon } from 'lucide-react';

interface SystemToolCardProps {
  tool: DisplayTool;
  onLaunch: (tool: DisplayTool) => void;
  disabled?: boolean;
}

export function SystemToolCard({ tool, onLaunch, disabled }: SystemToolCardProps) {
  const IconComponent = getIconComponent(tool.icon) as LucideIcon;

  const categoryColors: Record<string, string> = {
    system: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    utility: 'bg-green-500/10 text-green-500 border-green-500/20',
    development: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    media: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  };

  const categoryLabels: Record<string, string> = {
    system: '系统',
    utility: '实用',
    development: '开发',
    media: '媒体',
  };

  return (
    <Card
      className={cn(
        'group hover:shadow-lg transition-all duration-200',
        'hover:scale-[1.02] active:scale-[0.98]',
        'cursor-pointer',
        !tool.enabled && 'opacity-50'
      )}
      onClick={() => !disabled && tool.enabled && onLaunch(tool)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'h-12 w-12 rounded-lg flex items-center justify-center',
                'bg-primary/10 group-hover:bg-primary/20',
                'transition-colors duration-200'
              )}
            >
              {IconComponent && <IconComponent className="h-6 w-6 text-primary" />}
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg line-clamp-1">{tool.name}</CardTitle>
              <CardDescription className="line-clamp-2 text-xs">
                {tool.description}
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* 分类标签 */}
        <Badge
          variant="outline"
          className={cn('text-xs', categoryColors[tool.category])}
        >
          {categoryLabels[tool.category] || tool.category}
        </Badge>

        {/* 启动按钮 */}
        <Button
          className="w-full"
          size="sm"
          disabled={disabled || !tool.enabled}
          onClick={(e) => {
            e.stopPropagation();
            onLaunch(tool);
          }}
        >
          启动工具
        </Button>

        {/* 快捷键提示 */}
        {tool.hotkey && (
          <div className="flex justify-center">
            <kbd className="px-2 py-1 text-xs font-semibold text-muted-foreground bg-muted rounded-md">
              {tool.hotkey}
            </kbd>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
