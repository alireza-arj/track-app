import { fixtureSnapshot } from './fixtures';
import { describe, expect, test } from 'bun:test';
import {
  activityError,
  addDays,
  coachSchema,
  dailyEntries,
  emptySnapshot,
  normalizeSnapshot,
  snapshotSchema,
  timeline,
  totals,
  type Activity,
} from '../packages/shared/domain';
const activity: Activity = {
  id: 'a',
  date: '2026-10-31',
  title: 'Read',
  start: 540,
  end: 600,
  categoryId: 'work',
  note: '',
};
describe('Journal integrity', () => {
  test('starts empty and removes only known legacy demo records', () => {
    expect(emptySnapshot().activities).toEqual([]);
    const legacy = fixtureSnapshot('2026-10-31');
    const real = {...activity,id:'owner-created',date:'2026-11-01'};
    legacy.activities.push(real);
    const migrated = normalizeSnapshot({...legacy,sampleMode:true});
    expect(migrated.activities).toEqual([real]);
    expect(migrated.categories).toEqual(legacy.categories);
    expect('sampleMode' in migrated).toBe(false);
  });
  test('rejects overlaps but accepts adjacent intervals', () => {
    const s = emptySnapshot();
    s.activities = [activity];
    expect(activityError({ ...activity, id: 'b', start: 599, end: 660 }, s)).toContain('overlap');
    expect(activityError({ ...activity, id: 'b', start: 600, end: 660 }, s)).toBeNull();
    expect(activityError({ ...activity, id: 'b', date: '2026-11-01' }, s)).toBeNull();
  });
  test('rejects impossible dates, zero duration, and missing categories', () => {
    const s = emptySnapshot();
    expect(activityError({ ...activity, date: '2026-02-30' }, s)).not.toBeNull();
    expect(activityError({ ...activity, end: 540 }, s)).not.toBeNull();
    expect(activityError({ ...activity, categoryId: 'missing' }, s)).not.toBeNull();
  });
  test('accepts midnight as 1440 and identifies precise unlogged gaps', () => {
    const s = emptySnapshot();
    expect(activityError({ ...activity, start: 1380, end: 1440 }, s)).toBeNull();
    expect(timeline([activity])).toEqual([
      { start: 0, end: 540, gap: true },
      activity,
      { start: 600, end: 1440, gap: true },
    ]);
  });
  test('backup validates references, unique IDs/names and overlaps', () => {
    const s = fixtureSnapshot('2026-10-31');
    expect(snapshotSchema.safeParse(s).success).toBe(true);
    expect(
      snapshotSchema.safeParse({ ...s, activities: [...s.activities, s.activities[0]] }).success,
    ).toBe(false);
    expect(
      snapshotSchema.safeParse({ ...s, categories: s.categories.filter((c) => c.id !== 'work') })
        .success,
    ).toBe(false);
    expect(
      snapshotSchema.safeParse({
        ...s,
        categories: s.categories.map((c) => ({ ...c, archived: true })),
      }).success,
    ).toBe(false);
  });
  test('archiving preserves historic activity classification', () => {
    const s = emptySnapshot();
    s.activities = [activity];
    s.categories[0].archived = true;
    expect(snapshotSchema.safeParse(s).success).toBe(true);
    expect(totals(s.activities, s.categories)[0].minutes).toBe(60);
  });
  test('calendar arithmetic crosses months and leap years without UTC conversion', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(dailyEntries(emptySnapshot(), '2026-10-31')).toEqual([]);
  });
  test('AI context must cover seven days and include only that range', () => {
    const s = fixtureSnapshot('2026-10-31');
    const request = {
      requestId: crypto.randomUUID(),
      question: 'Help me plan',
      from: '2026-10-25',
      to: '2026-10-31',
      timezone: 'Asia/Tehran',
      categories: s.categories,
      activities: s.activities,
      history: [],
    };
    expect(coachSchema.safeParse(request).success).toBe(true);
    expect(coachSchema.safeParse({ ...request, from: '2026-10-24' }).success).toBe(false);
    expect(
      coachSchema.safeParse({
        ...request,
        activities: [...s.activities, { ...activity, id: 'outside', date: '2026-11-01' }],
      }).success,
    ).toBe(false);
  });
});
