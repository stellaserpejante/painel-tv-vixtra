import { getCurrentPeriod, getCurrentQuarter, getLast30Days, toHubSpotDateRange, getCurrentMonthName } from '../src/lib/time';
for (const iso of ['2026-09-21T18:00:00Z','2026-10-01T02:30:00Z','2026-12-31T23:00:00Z','2027-01-01T01:00:00Z']) {
  const d = new Date(iso);
  const p = getCurrentPeriod(d);
  const q = getCurrentQuarter(d);
  const l = getLast30Days(d);
  console.log(iso, '=>', p.key, p.monthName,
    '| mês:', p.start.toISOString().slice(0,16), '->', p.end.toISOString().slice(0,16),
    '| Q'+q.quarter,
    '| 30d:', l.start.toISOString().slice(0,10),
    '| HS:', JSON.stringify(toHubSpotDateRange(p.start, p.end)));
}
