import { useState, useEffect } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';

const RESIDENT_CRITERIA = [
  {
    field: 'Soulful Japa/ Holy Name Quotes + Vaishnava Pranam Mantra',
    max: 1,
    rule: '• Attended fully: 1 mark\n• Not/partially attended: 0 marks'
  },
  {
    field: 'Japa Visibly Done in MTH/Balcony',
    max: 2,
    rule: '• 35 to 40 mins (Sunday: 105 to 120 mins): 2 marks\n• 20 to 35 mins (Sunday: 60 to 105 mins): 1 mark\n• Less than 20 mins (Sunday: less than 60 mins): 0 marks'
  },
  {
    field: 'DA + NA + GP + Kirtan',
    max: 3,
    rule: '• Attended full 30 mins: 3 marks\n• Attended 20 to 29 mins: 2 marks\n• Attended 10 to 19 mins: 1 mark\n• Attended less than 10 mins: 0 marks'
  },
  {
    field: 'Bath (penalty)',
    max: 0,
    rule: '• Attended without taking a bath: 1 point penalty\n• Took bath before attending: No penalty'
  },
  {
    field: 'Srimad Bhagavatam',
    max: 2,
    rule: '• Attended 25 to 30 mins in MT Hall: 2 marks\n• Attended 15 to 24 mins in MT Hall: 1 mark\n• Less than 15 mins / Not attended: 0 marks'
  },
  {
    field: 'Cleanliness',
    max: 1,
    rule: '• Cleaned assigned area before 8:00 AM: 1 mark\n• Cleaned after 8:00 AM or not cleaned: 0 marks'
  },
  {
    field: 'Report Filling',
    max: 1,
    rule: '• Submitted on the same day (before midnight): 1 mark\n• Submitted backdated/late: 0 marks'
  },
  {
    field: 'Daily Assigned Service',
    max: 2,
    rule: '• Service completed fully: 2 marks\n• Completed partially or not done: 0 marks'
  },
  {
    field: 'SP Book Reading',
    max: 3,
    rule: 'Based on resident stay duration:\n• Stay > 6 months:\n  - >40 min: 3 marks | 31-40 min: 2 marks | 20-30 min: 1 mark\n• Stay 3 to 6 months:\n  - >30 min: 3 marks | 21-30 min: 2 marks | 10-20 min: 1 mark\n• Stay 0 to 3 months:\n  - >20 min: 3 marks | 15-20 min: 2 marks | 5-14 min: 1 mark'
  },
  {
    field: 'Chanting Rounds',
    max: 4,
    rule: 'Based on resident stay duration:\n• Stay > 6 months:\n  - >=16 rounds: 4 marks | 10-15 rounds: 3 marks | 5-9 rounds: 2 marks | 4 rounds: 1 mark\n• Stay 3 to 6 months:\n  - >=8 rounds: 4 marks | 6-7 rounds: 3 marks | 3-5 rounds: 2 marks | 2 rounds: 1 mark\n• Stay 0 to 3 months:\n  - >=4 rounds: 4 marks | 3 rounds: 3 marks | 2 rounds: 2 marks | 1 round: 1 mark'
  },
  {
    field: 'Sleep Quality',
    max: 1,
    rule: '• Slept before 10:30 PM: 1 mark\n• Slept after 10:30 PM: 0 marks'
  },
];

const NR_CRITERIA = [
  {
    field: 'Wake-up Time',
    max: 4,
    rule: 'Target wake-up times by Ashray level:\n• Upasaka: by 6:00 AM\n• Caranashraya: by 5:00 AM\n• Harinam Diksha: by 4:00 AM\n• Penalty: 1 point for every 15 mins of delay'
  },
  {
    field: 'Sleep Time',
    max: 4,
    rule: 'Target sleep times by Ashray level:\n• Upasaka: by 11:00 PM\n• Caranashraya: by 10:30 PM\n• Harinam Diksha: by 10:00 PM\n• Penalty: 1 point for every 15 mins of delay'
  },
  {
    field: 'Chanting Rounds',
    max: 8,
    rule: 'Target rounds by Ashray level:\n• Jigyasa / Shraddhavan: 1 round\n• Sevak: 4 rounds\n• Sadhaka: 8 rounds\n• Upasaka: 12 rounds\n• Caranashraya / Harinam Diksha: 16 rounds\n• Scoring: Pro-rata points scored based on target'
  },
  {
    field: 'Reading Time',
    max: 4,
    rule: 'Target reading duration by Ashray level:\n• Jigyasa / Shraddhavan: 5 mins\n• Sevak: 10 mins\n• Sadhaka: 15 mins\n• Upasaka: 20 mins\n• Caranashraya: 30 mins\n• Harinam Diksha: 60 mins\n• Scoring: Pro-rata points scored based on target'
  },
  {
    field: 'Hearing Time',
    max: 4,
    rule: '• Targets: Same duration targets as Reading Time\n• Note: Attended Bhakti Vriksha session counts as 50% reading & 50% hearing credit'
  },
  {
    field: 'Filled Same Day',
    max: 4,
    rule: '• Same-day submission (before midnight): 4 marks\n• Late submission: 2 points penalty per day of delay\n• Exempt: Jigyasa and Shraddhavan levels are not scored'
  },
  {
    field: 'Seva / Service',
    max: 4,
    rule: 'Target service duration by Ashray level:\n• Upasaka: 20 mins\n• Caranashraya: 30 mins\n• Harinam Diksha: 60 mins\n• Sevak & Sadhaka: Tracked on leaderboard (Yes/No) but not scored\n• Jigyasa & Shraddhavan: Exempt'
  },
  {
    field: 'Bhakti Vriksha',
    max: 4,
    rule: 'Target duration by Ashray level:\n• Caranashraya & Harinam Diksha: 30 mins\n• Sevak, Sadhaka & Upasaka: Tracked on leaderboard (Yes/No) but not scored\n• Jigyasa & Shraddhavan: Exempt'
  },
];

const TH = 'px-3 py-2 text-left text-xs font-bold text-foreground border-b border-border bg-muted whitespace-nowrap';
const TD = 'px-3 py-2 text-xs border-b border-border/50 align-top';

function CriteriaTable({ title, rows }: { title: string; rows: typeof RESIDENT_CRITERIA }) {
  return (
    <div>
      <p className="text-xs font-bold text-foreground mb-2 uppercase tracking-wide">{title}</p>
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className={`${TH} w-[160px] min-w-[140px]`}>Field</th>
              <th className={`${TH} w-[80px] text-center`}>Max Points</th>
              <th className={TH}>Scoring Rules</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-card' : 'bg-muted/20'}>
                <td className={`${TD} font-semibold text-foreground`}>{row.field}</td>
                <td className={`${TD} text-center font-bold ${row.max > 0 ? 'text-primary' : 'text-destructive'}`}>
                  {row.max > 0 ? row.max : 'Penalty'}
                </td>
                <td className={`${TD} text-muted-foreground leading-relaxed whitespace-pre-line`}>{row.rule}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ScoringCriteriaPanel({ isResident, mode }: { isResident?: boolean; mode?: 'resident' | 'non_resident' | 'all' }) {
  const [open, setOpen] = useState(false);

  const effectiveMode = mode || (isResident ? 'resident' : 'non_resident');

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full flex items-center justify-start gap-2 text-muted-foreground hover:text-foreground h-8 px-3 py-1 text-sm font-medium rounded-md hover:bg-accent transition-colors">
        <Info className="w-4 h-4" />
        <span className="text-sm font-medium">Scoring Criteria</span>
        {open ? <ChevronDown className="w-4 h-4 ml-auto" /> : <ChevronRight className="w-4 h-4 ml-auto" />}
      </CollapsibleTrigger>
      <CollapsibleContent className="border rounded-lg p-4 mt-1 bg-card">
        {effectiveMode === 'all' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CriteriaTable title="Resident Scoring Criteria" rows={RESIDENT_CRITERIA} />
            <CriteriaTable title="Non-Resident Scoring Criteria" rows={NR_CRITERIA} />
          </div>
        ) : effectiveMode === 'resident' ? (
          <CriteriaTable title="Resident Scoring Criteria" rows={RESIDENT_CRITERIA} />
        ) : (
          <CriteriaTable title="Non-Resident Scoring Criteria" rows={NR_CRITERIA} />
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
