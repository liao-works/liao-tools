export type ProcessType = 'sea-rail-with-image' | 'sea-rail-no-image' | 'air-freight';

export interface ProcessConfig {
  process_type: ProcessType;
  weight_column: number;
  box_column: number;
  copy_images: boolean;
}

export interface ProcessRequest {
  file_path: string;
  config: ProcessConfig;
}

export interface ProcessResponse {
  success: boolean;
  output_path: string;
  message: string;
  logs: string[];
}

export const ProcessTypeLabels: Record<ProcessType, string> = {
  'sea-rail-with-image': '海铁数据（有图版）',
  'sea-rail-no-image': '海铁数据（无图版）',
  'air-freight': '空运数据',
};
