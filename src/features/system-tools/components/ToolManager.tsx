import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DisplayTool } from '@/types';
import { GripVertical, Edit, Trash2, Power, PowerOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getIconComponent } from '@/lib/system-tools';
import { invoke } from '@tauri-apps/api/core';

interface SortableToolCardProps {
  tool: DisplayTool;
  onEdit: (tool: DisplayTool) => void;
  onDelete: (tool: DisplayTool) => void;
  onToggle: (tool: DisplayTool) => void;
}

function SortableToolCard({ tool, onEdit, onDelete, onToggle }: SortableToolCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tool.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const IconComponent = getIconComponent(tool.icon);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative bg-card border rounded-lg p-4 transition-all',
        isDragging && 'opacity-50 shadow-lg'
      )}
    >
      <div className="flex items-center gap-4">
        {/* 拖拽手柄 */}
        <button
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5" />
        </button>

        {/* 图标 */}
        <div className="h-12 w-12 rounded-lg flex items-center justify-center bg-primary/10">
          <IconComponent className="h-6 w-6 text-primary" />
        </div>

        {/* 工具信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold truncate">{tool.name}</h3>
            {tool.type === 'system' && (
              <Badge variant="outline" className="text-xs">
                系统
              </Badge>
            )}
            {!tool.enabled && (
              <Badge variant="secondary" className="text-xs">
                已禁用
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate">{tool.description}</p>
          {tool.hotkey && (
            <p className="text-xs text-muted-foreground mt-1">
              快捷键: <kbd className="px-1 py-0.5 bg-muted rounded">{tool.hotkey}</kbd>
            </p>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onToggle(tool)}
            title={tool.enabled ? '禁用' : '启用'}
          >
            {tool.enabled ? (
              <Power className="h-4 w-4" />
            ) : (
              <PowerOff className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(tool)}
            title="编辑"
          >
            <Edit className="h-4 w-4" />
          </Button>
          {tool.type === 'custom' && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(tool)}
              title="删除"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

interface ToolManagerProps {
  tools: DisplayTool[];
  onUpdate: () => void;
  onEdit: (tool: DisplayTool) => void;
  onDelete: (tool: DisplayTool) => void;
  onToggle: (tool: DisplayTool) => void;
}

export function ToolManager({
  tools,
  onUpdate,
  onEdit,
  onDelete,
  onToggle,
}: ToolManagerProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 移动8px后才开始拖拽
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = tools.findIndex((item) => item.id === active.id);
      const newIndex = tools.findIndex((item) => item.id === over.id);

      const newTools = arrayMove(tools, oldIndex, newIndex);

      // 保存排序到后端
      try {
        await invoke('reorder_tools', {
          toolIds: newTools.map(t => t.id),
        });
        onUpdate();
      } catch (error) {
        console.error('保存排序失败:', error);
      }
    }
  };

  if (tools.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-muted-foreground">暂无工具</p>
          <p className="text-sm text-muted-foreground mt-2">
            点击"添加工具"按钮添加自定义工具
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">工具管理</h3>
          <p className="text-sm text-muted-foreground">
            拖拽卡片可以调整工具顺序
          </p>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={tools.map(t => t.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {tools.map((tool) => (
              <SortableToolCard
                key={tool.id}
                tool={tool}
                onEdit={onEdit}
                onDelete={onDelete}
                onToggle={onToggle}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
