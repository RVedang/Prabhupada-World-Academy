import { createContext, useContext, useRef, type ReactNode } from 'react';

const DashboardActivity = createContext(true);
export const useDashboardActivity = () => useContext(DashboardActivity);

/** Mount on first visit, preserve form/filter state, and pause hidden refreshes. */
export default function DashboardPanel({ active, children }: { active: boolean; children: ReactNode }) {
  const parentActive = useDashboardActivity();
  const visited = useRef(active);
  if (active) visited.current = true;
  if (!visited.current) return null;
  return (
    <DashboardActivity.Provider value={active && parentActive}>
      <div hidden={!active} className={active ? 'block' : 'hidden'}>{children}</div>
    </DashboardActivity.Provider>
  );
}
