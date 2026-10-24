import { BookOpen } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { openUrlPath } from '@/lib/file-opener';
import { getTutorialUrl, type TutorialFeatureId } from '@/lib/tutorial-links';

interface TutorialLinkProps {
  /** 功能 ID，对应 tutorial-links.ts 中的教程映射 */
  featureId: TutorialFeatureId;
  /** 悬浮提示与无障碍名称，默认「查看教程」 */
  label?: string;
  /** 是否显示文字标签（如设置页的「在线教程」）；默认仅图标 */
  showLabel?: boolean;
  variant?: ButtonProps['variant'];
  className?: string;
}

/**
 * 打开当前功能在线教程的入口按钮。
 * 复用 file-opener 的 openUrlPath（Tauri opener）在系统浏览器中打开；
 * 悬浮提示沿用项目现有的原生 title 属性（项目未安装 tooltip 组件）。
 */
export function TutorialLink({
  featureId,
  label = '查看教程',
  showLabel = false,
  variant = 'ghost',
  className,
}: TutorialLinkProps) {
  const { toast } = useToast();

  const openTutorial = () => {
    void openUrlPath(getTutorialUrl(featureId)).catch((error: unknown) => {
      console.error('打开教程失败:', error);
      toast({
        title: '打开教程失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    });
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={showLabel ? 'sm' : 'icon'}
      title={label}
      aria-label={label}
      onClick={openTutorial}
      className={className}
    >
      <BookOpen className="h-4 w-4" aria-hidden="true" />
      {showLabel && <span>{label}</span>}
    </Button>
  );
}
