import { useReactiveLoader } from '@/hooks/useReactiveLoader';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import { useDebouncedCallback } from 'use-debounce';
import { getAshrayChecklist, saveAshrayChecklist, requestAshrayUpgrade } from '@/lib/endpoints-sdk';
import type { GetAshrayUpgradePathOutputType } from '@/lib/endpoints-sdk';
import AshrayChecklistSection from './AshrayChecklistSection';
import AshrayApplySection from './AshrayApplySection';

type PracticeGroup = GetAshrayUpgradePathOutputType['practiceGroups'][0];

function isRequired(req: string): boolean {
  return !!req && req !== '-' && req !== '—';
}

interface Props {
  currentLevel: string;
  userId: string;
  practiceGroups: PracticeGroup[];
  readOnly?: boolean;
}

export default function AshrayCriteriaGrid({ currentLevel, userId, practiceGroups, readOnly = false }: Props) {
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [nextExamDate, setNextExamDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [applyLoading, setApplyLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pendingSave, setPendingSave] = useState(false);
  const editVersion = useRef(0);

  // All required items for the current level
  const requiredKeys = practiceGroups
    .flatMap(g => g.practices)
    .filter(p => isRequired(p.requirements[currentLevel] || ''))
    .map(p => p.fieldKey);

  const allChecked = requiredKeys.length > 0 && requiredKeys.every(k => checkedItems.has(k));

  useEffect(() => {
    loadChecklist();
  }, [userId, currentLevel]);

  const loadChecklist = useReactiveLoader(async (read) => {
    !read.background && !read.cancelled && setLoading(true);
    try {
      const res = await read(() => getAshrayChecklist({ userId }));
      // If saved checklist is for a different level, start fresh
      const items = res.ashrayLevel === currentLevel ? res.checkedItems : [];
      !read.cancelled && setCheckedItems(new Set(items));
      !read.cancelled && setNextExamDate(res.nextExamDate);
      !read.cancelled && setSubmitted(!!res.hasPendingUpgrade);
    } catch {
      if (read.cancelled) return;
      // silent — checklist just starts empty
    } finally {
      !read.cancelled && setLoading(false);
    }
  }, [userId, currentLevel], !pendingSave);

  const debouncedSave = useDebouncedCallback(async (keys: string[]) => {
    const savingVersion = editVersion.current;
    try {
      await saveAshrayChecklist({ userId, ashrayLevel: currentLevel, checkedItems: keys });
      if (editVersion.current === savingVersion) setPendingSave(false);
    } catch {
      toast.error('Failed to save checklist');
    }
  }, 800);

  const handleToggle = useCallback((fieldKey: string, checked: boolean) => {
    editVersion.current++;
    setPendingSave(true);
    setCheckedItems(prev => {
      const next = new Set(prev);
      checked ? next.add(fieldKey) : next.delete(fieldKey);
      debouncedSave(Array.from(next));
      return next;
    });
  }, [currentLevel, userId]);

  const handleApply = async () => {
    setApplyLoading(true);
    try {
      await requestAshrayUpgrade({ userId, currentLevel } as any);
      setSubmitted(true);
      toast.success('Application submitted! Your guide will review it.');
    } catch {
      toast.error('Failed to submit application');
    } finally {
      setApplyLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent className="space-y-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <CardTitle className="text-base">
            {readOnly ? 'Ashraya Checklist' : 'My Ashraya Checklist'}
          </CardTitle>
          <Badge className="gap-1">
            <Star className="w-3 h-3 fill-current" /> {currentLevel}
          </Badge>
          {readOnly && (
            <Badge variant="outline" className="text-xs">Read-only view</Badge>
          )}
        </div>
        {!readOnly && (
          <p className="text-sm text-muted-foreground mt-1">
            Check off each requirement as you complete it. Your progress will be saved automatically. Once all requirements are completed, apply for the next level.
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-5">
        {practiceGroups.map(group => (
          <AshrayChecklistSection
            key={group.category}
            category={group.category}
            practices={group.practices}
            currentLevel={currentLevel}
            checkedItems={checkedItems}
            onToggle={handleToggle}
            readOnly={readOnly}
          />
        ))}

        <AshrayApplySection
          allChecked={allChecked}
          totalRequired={requiredKeys.length}
          checkedCount={requiredKeys.filter(k => checkedItems.has(k)).length}
          nextExamDate={nextExamDate}
          onApply={handleApply}
          loading={applyLoading}
          submitted={submitted}
          readOnly={readOnly}
        />
      </CardContent>
    </Card>
  );
}
