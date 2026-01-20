import { invoke } from '@tauri-apps/api/core'

/**
 * 使用 shell 命令直接打开文件（绕过 opener 插件的安全限制）
 * @param filePath 文件路径
 * @throws Error 当文件打开失败时抛出错误
 */
export async function openFileWithShell(filePath: string): Promise<void> {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('文件路径无效')
  }

  try {
    // 使用我们自定义的 Rust 命令来打开文件
    // 这样可以绕过 opener 插件的安全限制
    await invoke('open_file_with_default_app', { filePath })
  } catch (error) {
    console.error('打开文件失败:', error)
    throw new Error(`无法打开文件: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 打开文件的 URL（可以是本地文件路径或网页链接）
 * @param url 文件 URL 或路径
 * @throws Error 当打开失败时抛出错误
 */
export async function openUrlPath(url: string): Promise<void> {
  if (!url || typeof url !== 'string') {
    throw new Error('URL 无效')
  }

  try {
    // 判断是 URL 还是文件路径
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')) {
      // 对于网页 URL，使用 opener 的 openUrl
      const { openUrl } = await import('@tauri-apps/plugin-opener')
      await openUrl(url)
    } else {
      // 对于文件路径，使用 shell 命令打开
      await invoke('open_file_with_default_app', { filePath: url })
    }
  } catch (error) {
    console.error('打开 URL 失败:', error)
    throw new Error(`无法打开 URL: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 检查文件是否为 Excel 文件
 * @param filePath 文件路径
 * @returns 是否为 Excel 文件
 */
export function isExcelFile(filePath: string): boolean {
  const excelExtensions = ['.xlsx', '.xls', '.xlsm']
  const extension = filePath.toLowerCase().split('.').pop()
  return extension ? excelExtensions.some(ext => `.${extension}` === ext) : false
}

/**
 * 获取文件扩展名
 * @param filePath 文件路径
 * @returns 文件扩展名（包含点号）
 */
export function getFileExtension(filePath: string): string {
  const lastDotIndex = filePath.lastIndexOf('.')
  return lastDotIndex === -1 ? '' : filePath.substring(lastDotIndex).toLowerCase()
}

/**
 * 获取文件名（不含扩展名）
 * @param filePath 文件路径
 * @returns 文件名（不含扩展名）
 */
export function getFileNameWithoutExtension(filePath: string): string {
  const fileName = filePath.split(/[/\\]/).pop() || filePath
  const lastDotIndex = fileName.lastIndexOf('.')
  return lastDotIndex === -1 ? fileName : fileName.substring(0, lastDotIndex)
}

/**
 * 获取文件名（含扩展名）
 * @param filePath 文件路径
 * @returns 文件名（含扩展名）
 */
export function getFileName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || filePath
}
