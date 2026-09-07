export function isSadhanaReminderDue(config: {
  enabled: boolean;
  times: string[];
  frequency: string;
  customDays?: number[];
}, now = new Date()): boolean {
  if (!config.enabled) return false;
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  const day = ist.getUTCDay();
  if (config.frequency === 'weekdays' && (day === 0 || day === 6)) return false;
  if (config.frequency === 'custom' && !(config.customDays || []).includes(day)) return false;
  const time = ist.toISOString().slice(11, 16);
  return config.times.includes(time);
}
