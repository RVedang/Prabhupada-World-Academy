import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Menu, ChevronDown } from 'lucide-react';
import TabTransition from '@/components/TabTransition';

export interface TabConfig {
  value: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: number;
}

interface TabRouterProps {
  tabs: TabConfig[];
  defaultTab?: string;
  children: (activeTab: string, changeTab: (tab: string) => void) => React.ReactNode;
  desktopCols?: number;
  /** When true, ignores URL hash — always starts at defaultTab and doesn't write hash */
  ignoreUrlHash?: boolean;
}

/** Number of tabs shown inline on desktop before collapsing the rest into "More" */
const VISIBLE_COUNT = 7;

export default function TabRouter({ tabs, defaultTab, children, desktopCols, ignoreUrlHash }: TabRouterProps) {
  const [activeTab, setActiveTab] = useState(() => {
    if (ignoreUrlHash) return defaultTab || tabs[0]?.value || '';
    return window.location.hash.slice(1) || defaultTab || tabs[0]?.value || '';
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showRightFade, setShowRightFade] = useState(false);
  const [showLeftFade, setShowLeftFade] = useState(false);

  // Detect scroll position to show/hide fade indicators
  const checkFades = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeftFade(el.scrollLeft > 4);
    setShowRightFade(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkFades();
    el.addEventListener('scroll', checkFades, { passive: true });
    const ro = new ResizeObserver(checkFades);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', checkFades);
      ro.disconnect();
    };
  }, [checkFades, tabs]);

  // Scroll active tab into view when it changes
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const active = el.querySelector('[data-active]') as HTMLElement | null;
    if (active) {
      active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [activeTab]);

  useEffect(() => {
    if (ignoreUrlHash) return;
    
    // Sync hash on initial mount to fix client-side hydration state mismatch
    const hash = window.location.hash.slice(1);
    const initialTab = tabs.find(t => t.value === hash);
    if (initialTab) {
      setActiveTab(initialTab.value);
    }

    const onPop = () => {
      const currentHash = window.location.hash.slice(1);
      const validTab = tabs.find(t => t.value === currentHash);
      if (validTab) setActiveTab(validTab.value);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [tabs, ignoreUrlHash]);

  const handleChange = useCallback((value: string) => {
    setActiveTab(value);
    setMobileOpen(false);
    if (!ignoreUrlHash) {
      window.history.pushState(null, '', `#${value}`);
    }
  }, [ignoreUrlHash]);

  const activeLabel = tabs.find(t => t.value === activeTab)?.label || 'Menu';
  const ActiveIcon = tabs.find(t => t.value === activeTab)?.icon;

  const visibleTabs = tabs;

  return (
    <Tabs value={activeTab} onValueChange={handleChange} className="w-full">
      {/* Desktop Navigation */}
      <div className="hidden md:block relative mb-6 no-print">
        {/* Left fade */}
        {showLeftFade && (
          <div className="absolute left-0 top-0 bottom-0 w-8 z-10 pointer-events-none rounded-l-md"
            style={{ background: 'linear-gradient(to right, hsl(var(--background)) 0%, transparent 100%)' }}
          />
        )}
        {/* Right fade */}
        {showRightFade && (
          <div className="absolute right-0 top-0 bottom-0 w-8 z-10 pointer-events-none rounded-r-md"
            style={{ background: 'linear-gradient(to left, hsl(var(--background)) 0%, transparent 100%)' }}
          />
        )}

        <div
          ref={scrollRef}
          className="w-full overflow-x-auto overflow-y-hidden scrollbar-none [&::-webkit-scrollbar]:hidden py-0.5"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <TabsList
            className="w-full h-9 bg-muted/40 p-1 rounded-full border border-border/50 shadow-xs flex items-center justify-between gap-1 overflow-y-hidden"
          >
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex items-center justify-center gap-1.5 whitespace-nowrap px-2.5 sm:px-3 py-1 text-xs font-medium rounded-full transition-all duration-200 border-transparent bg-transparent text-muted-foreground hover:text-foreground data-[active]:bg-white data-[active]:text-foreground data-[active]:shadow-xs data-[active]:font-semibold data-[active]:border data-[active]:border-border/40 dark:data-[active]:bg-white/15 dark:data-[active]:text-foreground h-7 shrink-0 flex-1"
                >
                  {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
                  <span>{tab.label}</span>
                  {tab.badge != null && tab.badge > 0 && (
                    <span className="ml-0.5 bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                      {tab.badge}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>
      </div>

      {/* Mobile Navigation — categorized drawer */}
      <div className="md:hidden mb-6 no-print">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger className="w-full">
            <Button variant="outline" className="w-full justify-between" asChild={false}>
              <span className="flex items-center gap-2">
                {ActiveIcon && <ActiveIcon className="w-4 h-4" />}
                {activeLabel}
              </span>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto rounded-t-xl">
            <div className="pt-2 pb-4">
              <p className="text-sm font-medium text-muted-foreground mb-3 px-1">Navigate to</p>
              <div className="grid grid-cols-2 gap-2">
                {tabs.map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.value;
                  return (
                    <Button
                      key={tab.value}
                      variant={isActive ? 'default' : 'outline'}
                      size="sm"
                      className="justify-start h-10 text-xs"
                      onClick={() => handleChange(tab.value)}
                    >
                      {Icon && <Icon className="w-4 h-4 mr-1.5 shrink-0" />}
                      <span className="truncate">{tab.label}</span>
                      {tab.badge != null && tab.badge > 0 && (
                        <span className="ml-auto bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                          {tab.badge}
                        </span>
                      )}
                    </Button>
                  );
                })}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <TabTransition activeTab={activeTab}>
        {children(activeTab, handleChange)}
      </TabTransition>
    </Tabs>
  );
}
