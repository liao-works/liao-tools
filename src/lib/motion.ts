/**
 * framer-motion 动效常量 —— 与 CSS token(--duration-* / --ease-*)保持同步。
 * 修改任一侧时必须同步另一侧(数值对应:CSS 毫秒 / framer 秒)。
 */
export const MOTION_DURATION = {
  instant: 0.08,
  fast: 0.14,
  base: 0.2,
  slow: 0.32,
} as const;

export const MOTION_EASE = {
  out: [0.25, 1, 0.5, 1],
  inOut: [0.4, 0, 0.2, 1],
  spring: [0.34, 1.56, 0.64, 1],
} as const;
