import { emptySnapshot, localDate, weekDays, type Snapshot } from '../packages/shared/domain';
export function fixtureSnapshot(today = localDate()): Snapshot {
  const s = emptySnapshot();
  for (const [i, date] of weekDays(today).entries()) {
    const records: [string, number, number, string][] = [
      ['Sleep', 0, 450, 'sleep'],
      ['Breakfast & a slow morning', 450, 540, 'personal'],
      ['Project work', 540, 660 + i * 10, 'work'],
      ['Lunch & a break', 720, 810, 'personal'],
      ['Learning & making things', 810, 960, 'work'],
      ['An afternoon walk', 1020, 1080, 'movement'],
      ['Dinner, family & a movie', 1080, 1320, 'personal'],
      ['Sleep', 1320, 1440, 'sleep'],
    ];
    records.forEach(([title, start, end, categoryId], j) =>
      s.activities.push({ id: `sample-${i}-${j}`, date, title, start, end, categoryId, note: '' }),
    );
  }
  return s;
}
