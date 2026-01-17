import type { ExcelProcessType, ExcelProcessResult, ExcelProgress } from '@/types';
import { delay } from './utils';

/**
 * 模拟Excel文件处理
 */
export const mockProcessExcel = async (
  _mainFile: File,
  detailFile: File | null,
  processType: ExcelProcessType,
  onProgress?: (progress: ExcelProgress) => void
): Promise<ExcelProcessResult> => {
  const steps = [
    { message: '正在读取主文件...', percentage: 10 },
    { message: '正在验证数据格式...', percentage: 25 },
    { message: '正在处理数据...', percentage: 50 },
    { message: detailFile ? '正在合并明细表...' : '正在填充模板...', percentage: 75 },
    { message: '正在生成输出文件...', percentage: 90 },
    { message: '处理完成！', percentage: 100 },
  ];
  
  for (const step of steps) {
    if (onProgress) {
      onProgress({
        current: step.percentage,
        total: 100,
        percentage: step.percentage,
        message: step.message,
      });
    }
    await delay(500);
  }
  
  return {
    success: true,
    outputPath: `/output/${processType}_processed_${Date.now()}.xlsx`,
    processedRows: 150,
    errors: [],
  };
};

/**
 * 模拟模板下载
 */
export const mockDownloadTemplate = async (processType: ExcelProcessType): Promise<Blob> => {
  await delay(300);
  
  const templateContent = processType === 'UPS'
    ? '订单号,收件人,地址,商品描述,数量\n'
    : '运单号,发件人,目的地,重量,体积\n';
  
  return new Blob([templateContent], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  });
};

/**
 * 模拟验证文件
 */
export const mockValidateFile = async (file: File): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
}> => {
  await delay(400);
  
  const fileSize = file.size;
  const fileName = file.name;
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // 检查文件大小
  if (fileSize > 10 * 1024 * 1024) {
    errors.push('文件大小超过10MB');
  }
  
  // 检查文件扩展名
  if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
    errors.push('文件格式不正确，请上传Excel文件');
  }
  
  // 模拟一些警告
  if (fileSize < 1024) {
    warnings.push('文件可能为空');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
};

/**
 * 模拟获取文件信息
 */
export const mockGetFileInfo = async (file: File): Promise<{
  name: string;
  size: number;
  rows: number;
  columns: string[];
}> => {
  await delay(300);
  
  return {
    name: file.name,
    size: file.size,
    rows: Math.floor(Math.random() * 200) + 50,
    columns: ['A', 'B', 'C', 'D', 'E'],
  };
};
