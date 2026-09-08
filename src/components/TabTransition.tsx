import React from 'react';

interface TabTransitionProps {
  children: React.ReactNode;
  activeTab: string;
}

export default function TabTransition({ children, activeTab }: TabTransitionProps) {
  return (
    // The parent preserves visited panels. A key here remounts every panel,
    // discarding its data/filters and repeating all mount effects on navigation.
    <div className="w-full h-full" data-active-tab={activeTab}>
      {children}
    </div>
  );
}
