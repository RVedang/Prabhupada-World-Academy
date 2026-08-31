import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DurationPicker } from '@/components/ui/duration-picker';

interface Props {
  values: Record<string, any>;
  onChange: (values: Record<string, any>) => void;
}

// Duration fields (stored as minutes, rendered as HH:MM)
const DURATION_FIELDS = [
  { key: 'pr_calling_time', label: 'Time spent in Calling' },
  { key: 'pr_one_on_one_time', label: 'Time spent on 1-on-1' },
  { key: 'pr_book_dist_time', label: 'Book Distribution Time' },
  { key: 'pr_rdua_time', label: 'RDUA Hosting Time (if not counted in reading)' },
  { key: 'pr_plan_time', label: 'Time spent in Making Preaching Plan' },
];

const NUMBER_FIELDS = [
  { key: 'pr_books_distributed', label: 'No. of Books Distributed' },
  { key: 'pr_contacts_collected', label: 'No. of Contacts Collected' },
  { key: 'pr_unique_one_on_ones', label: 'No. of 1-to-1s (Unique Individuals)' },
];

export const BV_DURATION_KEYS = DURATION_FIELDS.map(f => f.key);

export default function BvslPreachingSection({ values, onChange }: Props) {
  const set = (key: string, val: any) => onChange({ ...values, [key]: val });

  return (
    <div className="bg-card border rounded-xl p-4 shadow-sm space-y-4">
      <div className="flex items-center gap-2 pb-1 border-b">
        <span className="text-lg">🌟</span>
        <h3 className="font-semibold text-base">Bhakti Vriksha Report</h3>
      </div>

      {/* Duration fields */}
      <div className="space-y-3">
        {DURATION_FIELDS.map(f => (
          <div key={f.key} className="space-y-1">
            <Label className="text-sm font-medium">{f.label}</Label>
            <DurationPicker
              value={values[f.key] === '' || values[f.key] === undefined || values[f.key] === null ? undefined : Number(values[f.key])}
              onChange={minutes => set(f.key, minutes)}
            />
          </div>
        ))}
      </div>

      {/* Number fields */}
      <div className="space-y-3">
        {NUMBER_FIELDS.map(f => (
          <div key={f.key} className="space-y-1">
            <Label className="text-sm font-medium">{f.label}</Label>
            <Input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="0"
              value={values[f.key] !== undefined && values[f.key] !== null && values[f.key] !== '' ? String(values[f.key]) : ''}
              onChange={e => {
                const raw = e.target.value.replace(/[^0-9]/g, '');
                set(f.key, raw === '' ? '' : parseInt(raw, 10));
              }}
            />
          </div>
        ))}
      </div>


    </div>
  );
}
