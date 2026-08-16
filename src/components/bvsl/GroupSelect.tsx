import { useState, useRef, useEffect } from 'react';
import { Users, ChevronDown, Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Group {
  id: string;
  groupName: string;
  [key: string]: any;
}

interface GroupSelectProps {
  groups: Group[];
  selectedGroupId: string;
  onSelectGroup: (groupId: string) => void;
  className?: string;
}

export default function GroupSelect({ groups, selectedGroupId, onSelectGroup, className }: GroupSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedGroup = groups.find(g => g.id === selectedGroupId) || groups[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredGroups = search.trim()
    ? groups.filter(g => (g.groupName || '').toLowerCase().includes(search.toLowerCase()))
    : groups;

  return (
    <div className={cn('relative inline-block text-left', className)} ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-xl bg-card border border-border/80 shadow-xs hover:border-primary/50 hover:bg-accent/40 transition-all text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-[220px]"
      >
        <div className="flex items-center gap-2 truncate">
          <Users className="w-4 h-4 text-primary shrink-0" />
          <span className="truncate">{selectedGroup?.groupName || 'Select Reading Group'}</span>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200', isOpen && 'rotate-180 text-primary')} />
      </button>

      {/* Popover Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-72 rounded-xl bg-popover text-popover-foreground shadow-lg border border-border/80 z-50 p-1.5 animate-in fade-in-0 zoom-in-95 duration-150">
          {groups.length > 5 && (
            <div className="relative mb-1.5 p-1">
              <Search className="absolute left-3 top-3 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search group..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onClick={e => e.stopPropagation()}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/50 rounded-lg border border-border/50 focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
              />
            </div>
          )}

          <div className="max-h-60 overflow-y-auto space-y-0.5 custom-scrollbar pr-0.5">
            {filteredGroups.length === 0 ? (
              <div className="py-3 text-center text-xs text-muted-foreground">No groups found</div>
            ) : (
              filteredGroups.map(g => {
                const isSelected = g.id === selectedGroupId;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      onSelectGroup(g.id);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={cn(
                      'flex items-center justify-between w-full px-3 py-2 text-xs rounded-lg transition-colors font-medium text-left',
                      isSelected
                        ? 'bg-primary/10 text-primary font-semibold'
                        : 'hover:bg-muted/70 text-foreground'
                    )}
                  >
                    <span className="truncate">{g.groupName || 'Unnamed Group'}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0 ml-2" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
