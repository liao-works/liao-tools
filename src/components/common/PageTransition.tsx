import { motion } from 'framer-motion';
import { ReactNode } from 'react';
import { MOTION_DURATION, MOTION_EASE } from '@/lib/motion';

interface PageTransitionProps {
  children: ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: MOTION_DURATION.base, ease: MOTION_EASE.inOut }}
    >
      {children}
    </motion.div>
  );
}
