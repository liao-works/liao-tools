/**
 * 模拟网络延迟
 */
export const delay = (ms: number = 800): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * 生成随机数
 */
export const randomInt = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * 随机选择数组中的一个元素
 */
export const randomChoice = <T>(array: T[]): T => {
  return array[Math.floor(Math.random() * array.length)];
};

/**
 * 模拟进度更新
 */
export const simulateProgress = (
  callback: (progress: number) => void,
  duration: number = 3000,
  steps: number = 100
): Promise<void> => {
  return new Promise((resolve) => {
    let current = 0;
    const interval = duration / steps;
    
    const timer = setInterval(() => {
      current += 1;
      callback(current);
      
      if (current >= steps) {
        clearInterval(timer);
        resolve();
      }
    }, interval);
  });
};
