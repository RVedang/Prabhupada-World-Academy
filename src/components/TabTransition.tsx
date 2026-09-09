import React, { Profiler, useEffect } from 'react';
import { motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import { recordDashboardRender } from '@/lib/app-endpoints-sdk';

interface TabTransitionProps {
  children: React.ReactNode;
  activeTab: string;
}

export default function TabTransition({ children, activeTab }: TabTransitionProps) {
  const controls = useAnimationControls();
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (reducedMotion) { controls.set({ opacity: 1, y: 0 }); return; }
    controls.set({ opacity: 0.75, y: 4 });
    void controls.start({ opacity: 1, y: 0, transition: { duration: 0.16, ease: 'easeOut' } });
  }, [activeTab, controls, reducedMotion]);
  const content = (
    // The parent preserves visited panels. A key here remounts every panel,
    // discarding its data/filters and repeating all mount effects on navigation.
    <motion.div initial={false} animate={controls} className="w-full h-full min-w-0" data-active-tab={activeTab}>
      {children}
    </motion.div>
  );
  return process.env.NODE_ENV === 'production' ? content : (
    <Profiler id={`dashboard:${activeTab}`} onRender={recordDashboardRender}>{content}</Profiler>
  );
}
