import { useRef, useState } from 'react';
import { Download, FileSpreadsheet, Loader2, Upload, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  exportBulkUsers,
  getBulkUserExportOptions,
  getBulkUserImportTemplate,
  importBulkUsers,
  previewBulkUserImport,
} from '@/lib/endpoints-sdk';
import { BULK_USER_MAX_FILE_BYTES, parseCsv, type ParsedCsv } from '@/config/bulkUserCsv';
import { exportToCsv } from '@/utils/exportCsv';

interface PreviewRow {
  rowNumber: number;
  status: 'new' | 'existing' | 'invalid';
  email: string;
  fullName: string;
  errors: string[];
}


interface PreviewResult {
  totalRecords: number;
  newUsers: number;
  existingUsers: number;
  invalidRecords: number;
  rows: PreviewRow[];
}

interface ImportResult {
  created: number;
  alreadyExisting: number;
  failed: number;
  failures: Array<{ rowNumber: number; email: string; fullName: string; errors: string[] }>;
}

interface ExportOptions {
  groups: Array<{ id: string; name: string }>;
  guides: Array<{ id: string; name: string }>;
}

export default function BulkUserManagement({ isSuperGuide, onImported }: { isSuperGuide: boolean; onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [options, setOptions] = useState<ExportOptions>({ groups: [], guides: [] });
  const [filters, setFilters] = useState({ status: 'all', startDate: '', endDate: '', groupId: 'all', assignedGuideId: 'all' });

  const resetImport = () => {
    setFileName(''); setParsed(null); setPreview(null); setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const downloadTemplate = async () => {
    try {
      const template = await getBulkUserImportTemplate({});
      exportToCsv(template.filename, template.headers, []);
    } catch (error: any) {
      toast.error(error?.message || 'Unable to download the import template');
    }
  };

  const chooseFile = async (file?: File) => {
    if (!file) return;
    resetImport();
    if (!file.name.toLowerCase().endsWith('.csv')) { toast.error('Please select a CSV file'); return; }
    if (file.size > BULK_USER_MAX_FILE_BYTES) { toast.error('CSV file must be 5 MB or smaller'); return; }
    setFileName(file.name);
    setBusy(true);
    try {
      const csv = parseCsv(await file.text());
      const checked = await previewBulkUserImport(csv);
      setParsed(csv);
      setPreview(checked);
    } catch (error: any) {
      toast.error(error?.message || 'Unable to validate the CSV');
      setFileName('');
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = async () => {
    if (!parsed || !preview?.newUsers) return;
    setBusy(true);
    try {
      const imported = await importBulkUsers(parsed);
      setResult(imported);
      setPreview(null);
      onImported();
      toast.success(`Import complete: ${imported.created} users created`);
    } catch (error: any) {
      toast.error(error?.message || 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const downloadErrors = () => {
    if (!result?.failures.length || !parsed) return;
    const headers = ['rowNumber', ...parsed.headers, 'errors'];
    const rows = result.failures.map(failure => {
      const source = parsed.rows[failure.rowNumber - 2] || {};
      return [failure.rowNumber, ...parsed.headers.map(header => source[header] || ''), failure.errors.join('; ')];
    });
    exportToCsv('folk-user-import-errors.csv', headers, rows);
  };

  const openExport = async () => {
    setExportOpen(true);
    setBusy(true);
    try {
      setOptions(await getBulkUserExportOptions({}));
    } catch (error: any) {
      toast.error(error?.message || 'Unable to load export filters');
    } finally {
      setBusy(false);
    }
  };

  const runExport = async () => {
    if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
      toast.error('Start date must be before end date'); return;
    }
    setBusy(true);
    try {
      const exported = await exportBulkUsers(filters);
      if (!exported.rows.length) { toast.info('No users match the selected filters'); return; }
      const textColumns = exported.headers.filter((header, index) =>
        /(?:phone|whatsapp|dob)/i.test(header)
        || exported.rows.some(row => /^\+?\d{10,}$/.test(String(row[index] ?? '').replace(/^'+/, '').trim())),
      );
      exportToCsv(exported.filename, exported.headers, exported.rows, {
        textColumns,
      });
      setExportOpen(false);
    } catch (error: any) {
      toast.error(error?.message || 'Unable to export users');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={downloadTemplate}><Download className="w-4 h-4" /> Download Import Template</Button>
        <Button variant="outline" size="sm" onClick={() => { resetImport(); setImportOpen(true); }}><Upload className="w-4 h-4" /> Import Users</Button>
        <Button variant="outline" size="sm" onClick={openExport}><FileSpreadsheet className="w-4 h-4" /> Export Users</Button>
      </div>

      <Dialog open={importOpen} onOpenChange={open => { if (!busy) setImportOpen(open); }}>
        <DialogContent className="sm:max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Bhakti Vriksha Users</DialogTitle>
            <DialogDescription>
              Upload the application-generated template. Every new member is assigned to your FOLK Guide profile and receives only normal User access.
            </DialogDescription>
          </DialogHeader>

          {!result && (
            <div className="space-y-4">
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={event => chooseFile(event.target.files?.[0])} />
              <button type="button" className="w-full rounded-lg border border-dashed p-8 text-center hover:bg-muted/40" onClick={() => fileRef.current?.click()} disabled={busy}>
                {busy ? <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /> : <Upload className="w-8 h-8 mx-auto text-primary" />}
                <span className="mt-2 block font-medium">{fileName || 'Choose CSV file'}</span>
                <span className="text-xs text-muted-foreground">Maximum 1,000 records and 5 MB</span>
              </button>

              {preview && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      ['Total Records', preview.totalRecords], ['New Users', preview.newUsers],
                      ['Existing Users', preview.existingUsers], ['Invalid Records', preview.invalidRecords],
                    ].map(([label, value]) => <div key={String(label)} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p></div>)}
                  </div>
                  {(preview.invalidRecords > 0 || preview.existingUsers > 0) && (
                    <div className="max-h-56 overflow-auto rounded-lg border">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-muted"><tr><th className="p-2 text-left">Row</th><th className="p-2 text-left">User</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Details</th></tr></thead>
                        <tbody>{preview.rows.filter(row => row.status !== 'new').map(row => (
                          <tr key={row.rowNumber} className="border-t"><td className="p-2">{row.rowNumber}</td><td className="p-2">{row.fullName}<br/><span className="text-muted-foreground">{row.email}</span></td><td className="p-2 capitalize">{row.status}</td><td className="p-2">{row.errors.join('; ') || 'Will not be duplicated'}</td></tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {result && (
            <div className="space-y-4 text-center py-3">
              <Users className="w-12 h-12 text-primary mx-auto" />
              <h3 className="text-lg font-semibold">Import Completed</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Created</p><p className="text-xl font-bold">{result.created}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Already Existing</p><p className="text-xl font-bold">{result.alreadyExisting}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Failed</p><p className="text-xl font-bold">{result.failed}</p></div>
              </div>
              {result.failed > 0 && <Button variant="outline" onClick={downloadErrors}><Download className="w-4 h-4" /> Download Error Report</Button>}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={busy}>{result ? 'Close' : 'Cancel'}</Button>
            {preview && <Button onClick={confirmImport} disabled={busy || preview.newUsers === 0}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} Import {preview.newUsers} New Users</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={exportOpen} onOpenChange={open => { if (!busy) setExportOpen(open); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Export FOLK Users</DialogTitle><DialogDescription>Only users allowed by your existing guide hierarchy are included.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="space-y-1"><Label>Status</Label><Select value={filters.status} onValueChange={value => setFilters(current => ({ ...current, status: value || 'all' }))}><SelectTrigger><span>{filters.status === 'all' ? 'All' : filters.status === 'active' ? 'Active Users' : 'Inactive Users'}</span></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="active">Active Users</SelectItem><SelectItem value="inactive">Inactive Users</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label>Bhakti Vriksha Group</Label><Select value={filters.groupId} onValueChange={value => setFilters(current => ({ ...current, groupId: value || 'all' }))}><SelectTrigger><span>{filters.groupId === 'all' ? 'All' : options.groups.find(group => group.id === filters.groupId)?.name || filters.groupId}</span></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem>{options.groups.map(group => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>From Date</Label><Input type="date" value={filters.startDate} onChange={event => setFilters(current => ({ ...current, startDate: event.target.value }))} /></div>
            <div className="space-y-1"><Label>To Date</Label><Input type="date" value={filters.endDate} onChange={event => setFilters(current => ({ ...current, endDate: event.target.value }))} /></div>
            {isSuperGuide && <div className="space-y-1 sm:col-span-2"><Label>Assigned Guide</Label><Select value={filters.assignedGuideId} onValueChange={value => setFilters(current => ({ ...current, assignedGuideId: value || 'all' }))}><SelectTrigger><span>{filters.assignedGuideId === 'all' ? 'All' : options.guides.find(guide => guide.id === filters.assignedGuideId)?.name || filters.assignedGuideId}</span></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem>{options.guides.map(guide => <SelectItem key={guide.id} value={guide.id}>{guide.name}</SelectItem>)}</SelectContent></Select></div>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setExportOpen(false)} disabled={busy}>Cancel</Button><Button onClick={runExport} disabled={busy}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} Export CSV</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
