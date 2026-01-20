import * as React from "react"
import { openFileWithShell } from "@/lib/file-opener"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { Copy, CheckCircle, ExternalLink } from "lucide-react"

interface FileOpenDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  filePath: string
  title?: string
  description?: string
  fileName?: string
}

export function FileOpenDialog({
  open,
  onOpenChange,
  filePath,
  title = "处理完成",
  description = "文件已生成完成",
  fileName,
}: FileOpenDialogProps) {
  const { toast } = useToast()
  const [copied, setCopied] = React.useState(false)

  const handleOpenFile = async () => {
    try {
      // 使用 shell 命令直接打开文件（绕过 opener 插件的安全限制）
      await openFileWithShell(filePath)
      onOpenChange(false)
    } catch (error) {
      console.error("打开文件失败:", error)
      toast({
        title: "打开文件失败",
        description: `无法打开文件: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      })
    }
  }

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(filePath)
      setCopied(true)
      toast({
        title: "已复制",
        description: "文件路径已复制到剪贴板",
      })
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error("复制失败:", error)
      toast({
        title: "复制失败",
        description: "请手动复制文件路径",
        variant: "destructive",
      })
    }
  }

  const displayFileName = fileName || filePath.split(/[/\\]/).pop() || filePath

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* 文件信息 */}
          <div className="space-y-2">
            <div className="text-sm font-medium">输出文件</div>
            <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" title={displayFileName}>
                  {displayFileName}
                </div>
                <div className="text-xs text-muted-foreground truncate" title={filePath}>
                  {filePath}
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyPath}
              className="flex-1 sm:flex-initial"
            >
              {copied ? (
                <CheckCircle className="h-4 w-4 mr-2" />
              ) : (
                <Copy className="h-4 w-4 mr-2" />
              )}
              {copied ? "已复制" : "复制路径"}
            </Button>
          </div>
          
          <Button
            onClick={handleOpenFile}
            className="flex-1 sm:flex-initial"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            打开文件
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
