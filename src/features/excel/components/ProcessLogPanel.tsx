import { Card } from '@/components/ui/card';
import { FileText } from 'lucide-react';

interface Props {
  logs: string[];
}

export function ProcessLogPanel({ logs }: Props) {
  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5" />
          <h3 className="text-lg font-semibold">处理日志</h3>
        </div>

        <div className="h-[300px] w-full rounded-md border p-4 overflow-y-auto">
          <div className="space-y-1 font-mono text-sm">
            {logs.map((log, index) => (
              <div
                key={index}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <span className="text-xs text-muted-foreground mr-2">
                  [{index + 1}]
                </span>
                {log}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
