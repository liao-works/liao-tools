import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { UserTool, CreateUserToolRequest, UpdateUserToolRequest } from '@/types';
import { Loader2, FolderOpen, AppWindow } from 'lucide-react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { AppPickerDialog } from './AppPickerDialog';

interface InstalledApp {
  name: string;
  display_name: string;
  path: string;
  icon_base64?: string;  // Base64 编码的图标数据
  publisher?: string;
  version?: string;
}

interface ToolEditDialogProps {
  tool?: UserTool | null;
  open: boolean;
  onSave: (tool: CreateUserToolRequest | UpdateUserToolRequest) => Promise<void>;
  onCancel: () => void;
}

export function ToolEditDialog({ tool, open, onSave, onCancel }: ToolEditDialogProps) {
  const [formData, setFormData] = useState<Partial<CreateUserToolRequest>>({
    name: '',
    description: '',
    icon: '',
    executablePath: '',
    arguments: '',
    workingDirectory: '',
    category: 'custom',
    hotkey: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [appPickerOpen, setAppPickerOpen] = useState(false);

  // 当对话框打开或tool变化时，重置表单数据
  useEffect(() => {
    if (open) {
      if (tool) {
        setFormData({
          name: tool.name,
          description: tool.description,
          icon: tool.icon,
          executablePath: tool.executablePath,
          arguments: tool.arguments,
          workingDirectory: tool.workingDirectory,
          category: tool.category,
          hotkey: tool.hotkey,
        });
      } else {
        setFormData({
          name: '',
          description: '',
          icon: '',
          executablePath: '',
          arguments: '',
          workingDirectory: '',
          category: 'custom',
          hotkey: '',
        });
      }
    }
  }, [tool, open]);

  const handleSave = async () => {
    if (!formData.name || !formData.executablePath) {
      return;
    }

    setIsSaving(true);
    try {
      if (tool) {
        const updateData: UpdateUserToolRequest = {
          id: tool.id!,
          name: formData.name!,
          description: formData.description || '',
          icon: formData.icon,
          executablePath: formData.executablePath!,
          arguments: formData.arguments,
          workingDirectory: formData.workingDirectory,
          category: formData.category || 'custom',
          hotkey: formData.hotkey,
          enabled: true,
        };
        await onSave(updateData);
      } else {
        const createData: CreateUserToolRequest = {
          name: formData.name!,
          description: formData.description || '',
          icon: formData.icon,
          executablePath: formData.executablePath!,
          arguments: formData.arguments,
          workingDirectory: formData.workingDirectory,
          category: formData.category || 'custom',
          hotkey: formData.hotkey,
        };
        await onSave(createData);
      }
      onCancel();
    } catch (error) {
      console.error('保存失败:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // 处理选择可执行文件
  const handleSelectExecutable = async () => {
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [
          {
            name: '可执行文件',
            extensions: ['exe', 'app', 'bat', 'sh', 'cmd'],
          },
        ],
      });

      if (selected && typeof selected === 'string') {
        // 从路径中提取文件名作为默认名称
        const fileName = selected.split(/[/\\]/).pop() || '';
        const nameWithoutExt = fileName.replace(/\.(exe|app|bat|sh|cmd)$/, '');

        setFormData({
          ...formData,
          executablePath: selected,
          name: formData.name || nameWithoutExt || '',
        });
      }
    } catch (error) {
      console.error('选择文件失败:', error);
    }
  };

  // 处理从已安装程序中选择
  const handleSelectFromInstalled = () => {
    setAppPickerOpen(true);
  };

  // 处理选择已安装的应用
  const handleAppSelected = (app: InstalledApp) => {
    console.log('ToolEditDialog 接收到的应用:', app);
    console.log('应用路径:', app.path);
    console.log('路径是否为空:', app.path === '');

    setAppPickerOpen(false);

    setFormData({
      ...formData,
      name: app.display_name,
      executablePath: app.path,
      icon: app.icon_base64,
      description: app.publisher ? `由 ${app.publisher} 开发` : '',
    });

    console.log('更新后的 formData:', {
      ...formData,
      name: app.display_name,
      executablePath: app.path,
      icon: app.icon_base64,
      description: app.publisher ? `由 ${app.publisher} 开发` : '',
    });
  };

  // 处理选择工作目录
  const handleSelectWorkingDirectory = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
      });

      if (selected && typeof selected === 'string') {
        setFormData({ ...formData, workingDirectory: selected });
      }
    } catch (error) {
      console.error('选择目录失败:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onCancel}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tool ? '编辑工具' : '添加工具'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 工具名称 */}
          <div>
            <Label htmlFor="name">
              工具名称 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="例如：Visual Studio Code"
            />
          </div>

          {/* 描述 */}
          <div>
            <Label htmlFor="description">描述</Label>
            <Input
              id="description"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="简短描述这个工具的用途"
            />
          </div>

          {/* 程序路径 */}
          <div>
            <Label htmlFor="path">
              程序路径 <span className="text-red-500">*</span>
            </Label>
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  id="path"
                  value={formData.executablePath || ''}
                  onChange={(e) => setFormData({ ...formData, executablePath: e.target.value })}
                  placeholder="C:\\Program Files\\... 或 /Applications/..."
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSelectExecutable}
                  className="shrink-0"
                  title="浏览文件系统"
                >
                  <FolderOpen className="h-4 w-4 mr-2" />
                  浏览文件
                </Button>
                <Button
                  type="button"
                  variant="default"
                  onClick={handleSelectFromInstalled}
                  className="shrink-0"
                  title="从已安装程序选择"
                >
                  <AppWindow className="h-4 w-4 mr-2" />
                  已安装程序
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                💡 推荐使用"已安装程序"按钮，自动填充应用信息
              </p>
            </div>
          </div>

          {/* 命令参数 */}
          <div>
            <Label htmlFor="args">命令参数（可选）</Label>
            <Input
              id="args"
              value={formData.arguments || ''}
              onChange={(e) => setFormData({ ...formData, arguments: e.target.value })}
              placeholder="--arg1 value1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              程序启动时传递的参数，使用空格分隔
            </p>
          </div>

          {/* 工作目录 */}
          <div>
            <Label htmlFor="workingDir">工作目录（可选）</Label>
            <div className="flex gap-2">
              <Input
                id="workingDir"
                value={formData.workingDirectory || ''}
                onChange={(e) => setFormData({ ...formData, workingDirectory: e.target.value })}
                placeholder="程序运行的工作目录"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleSelectWorkingDirectory}
                className="shrink-0"
              >
                <FolderOpen className="h-4 w-4 mr-2" />
                浏览
              </Button>
            </div>
          </div>

          {/* 分类 */}
          <div>
            <Label htmlFor="category">分类</Label>
            <select
              id="category"
              value={formData.category || 'custom'}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              <option value="system">系统</option>
              <option value="utility">实用</option>
              <option value="development">开发</option>
              <option value="media">媒体</option>
              <option value="custom">自定义</option>
            </select>
          </div>

          {/* 快捷键 */}
          <div>
            <Label htmlFor="hotkey">快捷键（可选）</Label>
            <Input
              id="hotkey"
              value={formData.hotkey || ''}
              onChange={(e) => setFormData({ ...formData, hotkey: e.target.value })}
              placeholder="Ctrl+Alt+1 或 Command+1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              支持: Ctrl, Alt, Shift, Command(Mac), Super(Win) + 字母/数字
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !formData.name || !formData.executablePath}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            保存
          </Button>
        </div>
      </DialogContent>

      {/* 程序选择对话框 */}
      <AppPickerDialog
        open={appPickerOpen}
        onSelect={handleAppSelected}
        onCancel={() => setAppPickerOpen(false)}
      />
    </Dialog>
  );
}
