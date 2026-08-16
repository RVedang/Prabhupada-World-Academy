import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  GitCommit,
  CheckSquare,
  Flame,
  Wrench,
  BarChart3,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Bell,
  Sparkles,
  Command,
  Filter,
  X,
  PhoneCall
} from 'lucide-react';
import GlobalCommandPalette from './GlobalCommandPalette';
import LogInteractionModal from './LogInteractionModal';

export type CrmTabId = 'dashboard' | 'devotees' | 'pipeline' | 'tasks' | 'sadhana' | 'services' | 'analytics';

interface CrmSidebarLayoutProps {
  activeTab: CrmTabId;
  onSelectTab: (tab: CrmTabId) => void;
  children: React.ReactNode;
  userRole?: string;
  userName?: string;
  onOpenLogInteraction?: () => void;
  onOpenDevotee360?: (devoteeId: string) => void;
}

export const CrmSidebarLayout: React.FC<CrmSidebarLayoutProps> = ({
  activeTab,
  onSelectTab,
  children,
  userRole = 'Mentor',
  userName = 'Devotee',
  onOpenLogInteraction,
  onOpenDevotee360,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);

  // Global Ctrl+K / Cmd+K key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const navItems: { id: CrmTabId; label: string; icon: React.ReactNode; badge?: string | number }[] = [
    { id: 'dashboard', label: 'Executive Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'devotees', label: 'Devotees 360°', icon: <Users className="w-5 h-5" />, badge: 'Live' },
    { id: 'pipeline', label: 'Growth Funnel', icon: <GitCommit className="w-5 h-5" /> },
    { id: 'tasks', label: 'Mentor Task Center', icon: <CheckSquare className="w-5 h-5" />, badge: '3' },
    { id: 'sadhana', label: 'Sadhana & Attendance', icon: <Flame className="w-5 h-5" /> },
    { id: 'services', label: 'Ops & Services', icon: <Wrench className="w-5 h-5" /> },
    { id: 'analytics', label: 'Analytics & Reports', icon: <BarChart3 className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row overflow-hidden font-sans">
      {/* ── SIDEBAR NAVIGATION ── */}
      <aside
        className={`bg-slate-900/90 border-r border-slate-800 flex flex-col transition-all duration-300 z-30 shrink-0 ${
          collapsed ? 'w-20' : 'w-72'
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          {!collapsed && (
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold shadow-lg shadow-amber-500/20">
                📿
              </div>
              <div>
                <h1 className="font-bold text-base text-slate-100 leading-tight">Devotee CRM</h1>
                <p className="text-[11px] text-amber-400 font-medium">Prabhupada World</p>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="mx-auto w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold">
              📿
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors hidden md:block"
            title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        </div>

        {/* Global Action Button */}
        <div className="p-3">
          <button
            onClick={() => (onOpenLogInteraction ? onOpenLogInteraction() : setLogModalOpen(true))}
            className={`w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-semibold rounded-xl p-3 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/15 transition-all ${
              collapsed ? 'px-0' : ''
            }`}
          >
            <PhoneCall className="w-4 h-4 shrink-0" />
            {!collapsed && <span className="text-sm">Log Interaction</span>}
          </button>
        </div>

        {/* Command Search Quick Button */}
        <div className="px-3 mb-2">
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className={`w-full bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 rounded-xl p-2.5 flex items-center gap-2.5 text-slate-400 text-xs transition-colors ${
              collapsed ? 'justify-center px-0' : 'justify-between'
            }`}
          >
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              {!collapsed && <span>Search CRM...</span>}
            </div>
            {!collapsed && (
              <kbd className="bg-slate-900 border border-slate-700 px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-400">
                ⌘K
              </kbd>
            )}
          </button>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 px-3 py-2 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                } ${collapsed ? 'justify-center px-0' : ''}`}
                title={collapsed ? item.label : undefined}
              >
                <div className={isActive ? 'text-amber-400' : 'text-slate-400'}>{item.icon}</div>
                {!collapsed && <span className="truncate flex-1 text-left">{item.label}</span>}
                {!collapsed && item.badge && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isActive ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer User Info */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-900/40">
          <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
            <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-amber-400 text-sm shrink-0">
              {userName.charAt(0).toUpperCase()}
            </div>
            {!collapsed && (
              <div className="overflow-hidden">
                <p className="text-xs font-semibold text-slate-200 truncate">{userName}</p>
                <p className="text-[10px] text-amber-400 font-medium truncate">{userRole}</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT AREA ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-950">
        {/* Top Header Bar */}
        <header className="h-16 border-b border-slate-800/80 bg-slate-900/40 backdrop-blur px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-100 capitalize">
              {navItems.find((n) => n.id === activeTab)?.label || 'Devotee CRM'}
            </h2>
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-400 font-medium">
              <Sparkles className="w-3 h-3 text-amber-400" /> CRM V2.5 Active
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-100 hover:border-slate-700 transition-colors"
              title="Search Command Palette (Ctrl+K)"
            >
              <Search className="w-4 h-4" />
            </button>
            <button
              onClick={() => (onOpenLogInteraction ? onOpenLogInteraction() : setLogModalOpen(true))}
              className="px-3.5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Log Touchpoint
            </button>
          </div>
        </header>

        {/* Scrollable Viewport */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-950">
          {children}
        </main>
      </div>

      {/* Global Command Palette */}
      <GlobalCommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        devotees={[]}
        onSelectDevotee={(devotee: any) => {
          if (onOpenDevotee360 && devotee?.id) onOpenDevotee360(devotee.id);
        }}
      />

      {/* Global Log Interaction Modal */}
      {logModalOpen && (
        <LogInteractionModal
          open={logModalOpen}
          devoteeId=""
          devoteeName="Selected Devotee"
          onClose={() => setLogModalOpen(false)}
          onSuccess={() => setLogModalOpen(false)}
        />
      )}
    </div>
  );
};
