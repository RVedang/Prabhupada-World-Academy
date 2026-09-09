import React, { Profiler } from 'react';
import { recordDashboardRender } from '@/lib/app-endpoints-sdk';

interface TabTransitionProps {
  children: React.ReactNode;
  activeTab: string;
}

export default function TabTransition({ children, activeTab }: TabTransitionProps) {
  const content = (
    // Keep the active dashboard at full opacity. Fading this wrapper blends
    // every text and icon color with the card background, making the entire
    // interface look disabled while tabs or routes change.
    <div className="w-full h-full min-w-0" data-active-tab={activeTab}>
      {children}
    </div>
  );
  return process.env.NODE_ENV === 'production' ? content : (
    <Profiler id={`dashboard:${activeTab}`} onRender={recordDashboardRender}>{content}</Profiler>
  );
}
