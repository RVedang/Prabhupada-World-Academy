import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Lightbulb, Users, Square as Grid3X3, Activity, Settings2 } from 'lucide-react';
import BvReportTab from '@/components/guide/BvReportTab';
import BvStatsPanel from '@/components/guide/BvStatsPanel';
import BvImprovementTab from '@/components/guide/BvImprovementTab';
import GuideBvTab from '@/components/guide/GuideBvTab';
import BvSessionMatrixTab from '@/components/guide/BvSessionMatrixTab';
import SadhanaSection from '@/components/guide/SadhanaSection';
import BvslManagementTab from '@/components/guide/BvslManagementTab';
import { useUserProfile } from '@/contexts/UserProfileContext';
import type { SadhanaGroupOption } from '@/components/guide/ReportsTab';

interface Props {
  guideId: string;
  bvslMode?: boolean;
  residencyIds?: string[];
  groupOptions?: SadhanaGroupOption[];
  /** Supervisor dashboard already has navigable group cards in its main Groups tab. */
  summaryOnlyGroups?: boolean;
}

type SubTab = 'report' | 'stats' | 'improvement' | 'groups' | 'bvmatrix' | 'sadhana' | 'management';

const STORAGE_KEY = 'folk_bv_subtab_v4';

function readStoredSubTab(): SubTab {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    const valid: SubTab[] = ['report', 'stats', 'improvement', 'groups', 'bvmatrix', 'sadhana', 'management'];
    if (valid.includes(v as SubTab)) return v as SubTab;
  } catch {}
  return 'bvmatrix';
}

export default function BvSection({ guideId, bvslMode, residencyIds, groupOptions, summaryOnlyGroups }: Props) {
  const { profile } = useUserProfile();
  const [subTab, setSubTab] = useState<SubTab>(readStoredSubTab);

  const roleUpper = String(profile?.role || '').toUpperCase();
  const isSupervisorOrAbove =
    !bvslMode ||
    !!profile?.isBvAdmin ||
    !!profile?.isBvSuperAdmin ||
    !!profile?.isBvSupervisor ||
    !!profile?.isBvMentor ||
    ['ADMIN', 'SUPER_ADMIN', 'SUPERVISOR', 'MENTOR', 'GUIDE', 'SUPER_GUIDE', 'PW_ADMIN'].includes(roleUpper);

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, subTab); } catch {}
  }, [subTab]);

  const activeSubTab = (!isSupervisorOrAbove && subTab === 'report') ? 'bvmatrix' : subTab;

  const tabs = [
    { value: 'bvmatrix'    as SubTab, label: 'BV Report',    icon: Grid3X3    },
    ...(isSupervisorOrAbove ? [{ value: 'report' as SubTab, label: 'RGF / RGSF Report', icon: BarChart3 }] : []),
    ...(!bvslMode ? [{ value: 'sadhana'     as SubTab, label: 'Facilitator Sadhana', icon: Activity   }] : []),
    { value: 'stats'       as SubTab, label: 'Stats',        icon: TrendingUp },
    { value: 'improvement' as SubTab, label: 'Improvement',  icon: Lightbulb  },
    { value: 'groups'      as SubTab, label: 'Groups',       icon: Users      },
    ...(!bvslMode ? [{ value: 'management' as SubTab, label: 'Management', icon: Settings2 }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-0 border-b border-border overflow-x-auto overflow-y-hidden scrollbar-none [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {tabs.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setSubTab(value)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
              activeSubTab === value
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {activeSubTab === 'bvmatrix'    && <BvSessionMatrixTab guideId={guideId} bvslMode={bvslMode} residencyIds={residencyIds} />}
      {activeSubTab === 'report'      && <BvReportTab guideId={guideId} bvslMode={bvslMode} residencyIds={residencyIds} />}
      {activeSubTab === 'sadhana'     && <SadhanaSection guideId={guideId} bvslMode={bvslMode} />}
      {activeSubTab === 'stats'       && <BvStatsPanel guideId={guideId} bvslMode={bvslMode} residencyIds={residencyIds} showIndividualStats={isSupervisorOrAbove} groupOptions={groupOptions} />}
      {activeSubTab === 'improvement' && <BvImprovementTab guideId={guideId} bvslMode={bvslMode} residencyIds={residencyIds} />}
      {activeSubTab === 'groups'      && <GuideBvTab guideId={guideId} bvslMode={bvslMode} residencyIds={residencyIds} summaryOnly={summaryOnlyGroups} />}
      {activeSubTab === 'management'  && !bvslMode && <BvslManagementTab guideId={guideId} />}
    </div>
  );
}
