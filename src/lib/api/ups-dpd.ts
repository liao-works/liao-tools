import { invoke } from '@tauri-apps/api/core';

export type TemplateType = 'ups' | 'dpd';

export interface ProcessRequest {
  main_file_path: string;
  detail_file_path?: string;
  template_type: TemplateType;
}

export interface ProcessResponse {
  success: boolean;
  output_path: string;
  message: string;
  logs: string[];
}

export interface TemplateConfig {
  template_type: TemplateType;
  template_path?: string;
  use_default: boolean;
}

export const TemplateTypeLabels: Record<TemplateType, string> = {
  ups: 'UPS总结单',
  dpd: 'DPD数据预报',
};

/**
 * 处理 UPS/DPD 文件
 */
export async function processUpsDpdFile(
  request: ProcessRequest
): Promise<ProcessResponse> {
  return invoke('process_ups_dpd_file', { request });
}

/**
 * 获取模板配置
 */
export async function getTemplateConfig(
  templateType: TemplateType
): Promise<TemplateConfig> {
  return invoke('get_template_config', { templateType });
}

/**
 * 保存模板配置
 */
export async function saveTemplateConfig(
  config: TemplateConfig
): Promise<void> {
  return invoke('save_template_config', { config });
}

/**
 * 验证模板文件
 */
export async function validateTemplateFile(filePath: string): Promise<boolean> {
  return invoke('validate_template_file', { filePath });
}

/**
 * 重置为默认模板
 */
export async function resetToDefaultTemplate(
  templateType: TemplateType
): Promise<void> {
  return invoke('reset_to_default_template', { templateType });
}
