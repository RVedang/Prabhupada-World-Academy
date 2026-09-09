import React, { Profiler } from 'react';
import { recordDashboardRender } from '@/lib/app-endpoints-sdk';

interface TabTransitionProps {
  children: React.ReactNode;
  activeTab: string;
}

export default function TabTransition({ children, activeTab }: TabTransitionProps) {
  const content = (
    // The parent preserves visited panels. A key here remounts every panel,
    // discarding its data/filters and repeating all mount effects on navigation.
    <div className="w-full h-full" data-active-tab={activeTab}>
      {children}
    </div>
  );
  return process.env.NODE_ENV === 'production' ? content : (
    <Profiler id={`dashboard:${activeTab}`} onRender={recordDashboardRender}>{content}</Profiler>
  );
}
