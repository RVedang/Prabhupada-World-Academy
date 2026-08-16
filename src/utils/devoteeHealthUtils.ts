/**
 * Devotee Health Score Utility
 * Computes dynamic engagement and health score (0-100%) for a devotee
 */

export interface DevoteeHealthMetrics {
  sadhanaCompliancePercent?: number; // 0 - 100
  attendancePercent?: number;        // 0 - 100
  daysSinceLastOneToOne?: number;    // days count
  hasOverdueRentOrTrips?: boolean;
}

export interface DevoteeHealthResult {
  score: number;
  level: 'HEALTHY' | 'NEEDS_ATTENTION' | 'AT_RISK';
  label: string;
  badgeClass: string;
  textColor: string;
  reasons: string[];
}

export function calculateDevoteeHealth(metrics: DevoteeHealthMetrics): DevoteeHealthResult {
  let totalScore = 0;
  const reasons: string[] = [];

  // 1. Sadhana Compliance (Weight: 40 points)
  const sadhanaRate = Math.min(100, Math.max(0, metrics.sadhanaCompliancePercent ?? 70));
  const sadhanaScore = (sadhanaRate / 100) * 40;
  totalScore += sadhanaScore;
  if (sadhanaRate < 50) {
    reasons.push('Low Sadhana compliance (<50%)');
  }

  // 2. Attendance Regularity (Weight: 30 points)
  const attendanceRate = Math.min(100, Math.max(0, metrics.attendancePercent ?? 75));
  const attendanceScore = (attendanceRate / 100) * 30;
  totalScore += attendanceScore;
  if (attendanceRate < 50) {
    reasons.push('Infrequent attendance (<50%)');
  }

  // 3. Days Since Last 1-on-1 Touchpoint (Weight: 15 points)
  const days1to1 = metrics.daysSinceLastOneToOne ?? 14;
  let oneToOneScore = 15;
  if (days1to1 > 30) {
    oneToOneScore = 0;
    reasons.push('No 1-on-1 touchpoint in >30 days');
  } else if (days1to1 > 14) {
    oneToOneScore = 7.5;
    reasons.push('Over 2 weeks since last 1-on-1');
  } else if (days1to1 > 7) {
    oneToOneScore = 12;
  }
  totalScore += oneToOneScore;

  // 4. Dues & Cleanliness Responsiveness (Weight: 15 points)
  if (metrics.hasOverdueRentOrTrips) {
    reasons.push('Pending rent/trips dues');
  } else {
    totalScore += 15;
  }

  const finalScore = Math.round(totalScore);

  if (finalScore >= 75) {
    return {
      score: finalScore,
      level: 'HEALTHY',
      label: '🟢 Thriving',
      badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
      textColor: 'text-emerald-600 dark:text-emerald-400',
      reasons: reasons.length ? reasons : ['Consistent sadhana & regular touchpoints'],
    };
  }

  if (finalScore >= 45) {
    return {
      score: finalScore,
      level: 'NEEDS_ATTENTION',
      label: '🟡 Needs Touchpoint',
      badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
      textColor: 'text-amber-600 dark:text-amber-400',
      reasons,
    };
  }

  return {
    score: finalScore,
    level: 'AT_RISK',
    label: '🔴 At-Risk',
    badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
    textColor: 'text-rose-600 dark:text-rose-400',
    reasons: reasons.length ? reasons : ['Multiple inactivity factors flagged'],
  };
}
