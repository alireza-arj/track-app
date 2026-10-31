import { z } from 'zod';
export const iconNames = [
  'briefcase',
  'moon',
  'sun',
  'activity',
  'book',
  'coffee',
  'heart',
  'music',
  'code',
  'leaf',
] as const;
export const colors = [
  '#7956ff',
  '#ff9500',
  '#16a86a',
  '#2585ff',
  '#f34579',
  '#00a6b2',
  '#d061e8',
  '#d38022',
] as const;
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + 'T12:00:00');
    return !Number.isNaN(d.getTime()) && localDate(d) === s;
  }, 'Choose a valid date');
export const categorySchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().trim().min(1).max(32),
  color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  icon: z.enum(iconNames),
  archived: z.boolean(),
});
export const activitySchema = z
  .object({
    id: z.string().min(1).max(80),
    date: dateSchema,
    title: z.string().trim().min(1).max(120),
    categoryId: z.string().min(1).max(80),
    start: z.number().int().min(0).max(1439),
    end: z.number().int().min(1).max(1440),
    note: z.string().max(500).default(''),
  })
  .refine((e) => e.end > e.start, { message: 'End time must be after start time.', path: ['end'] });
export const messageSchema = z.object({
  id: z.string().min(1).max(80),
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(24000),
  createdAt: z.number().finite(),
  range: z.string().max(80),
});
export const snapshotSchema = z
  .object({
    version: z.literal(1),
    categories: z.array(categorySchema).min(1).max(200),
    activities: z.array(activitySchema).max(50000),
    messages: z.array(messageSchema).max(500),
  })
  .superRefine((s, ctx) => {
    for (const [key, items] of [
      ['categories', s.categories],
      ['activities', s.activities],
      ['messages', s.messages],
    ] as const) {
      if (new Set(items.map((i) => i.id)).size !== items.length)
        ctx.addIssue({ code: 'custom', message: 'Duplicate IDs in ' + key });
    }
    if (new Set(s.categories.map((c) => c.name.toLowerCase())).size !== s.categories.length)
      ctx.addIssue({ code: 'custom', message: 'Category names must be unique.' });
    if (!s.categories.some((c) => !c.archived))
      ctx.addIssue({ code: 'custom', message: 'Keep at least one active category.' });
    const ids = new Set(s.categories.map((c) => c.id));
    const days = new Map<string, Activity[]>();
    for (const e of s.activities) {
      if (!ids.has(e.categoryId))
        ctx.addIssue({ code: 'custom', message: 'An activity refers to a missing category.' });
      const day = days.get(e.date) || [];
      day.push(e);
      days.set(e.date, day);
    }
    for (const day of days.values()) {
      day.sort((a, b) => a.start - b.start);
      for (let i = 1; i < day.length; i++)
        if (day[i].start < day[i - 1].end)
          ctx.addIssue({ code: 'custom', message: 'Activities cannot overlap.' });
    }
  });
export type Category = z.infer<typeof categorySchema>;
export type Activity = z.infer<typeof activitySchema>;
export type Message = z.infer<typeof messageSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
/** Remove only explicitly marked preview fixtures; preserve user-created records. */
export function normalizeSnapshot(raw: unknown): Snapshot {
  const value = snapshotSchema.parse(raw);
  if (raw && typeof raw === 'object' && 'sampleMode' in raw && raw.sampleMode === true) {
    value.activities = value.activities.filter((entry) => !entry.id.startsWith('sample-'));
  }
  return value;
}
export const defaultCategories: Category[] = [
  { id: 'work', name: 'Work', color: colors[0], icon: 'briefcase', archived: false },
  { id: 'personal', name: 'Personal', color: colors[1], icon: 'sun', archived: false },
  { id: 'movement', name: 'Movement', color: colors[2], icon: 'activity', archived: false },
  { id: 'sleep', name: 'Sleep', color: colors[3], icon: 'moon', archived: false },
];
export function emptySnapshot(): Snapshot {
  return {
    version: 1,
    categories: structuredClone(defaultCategories),
    activities: [],
    messages: [],
  };
}
export function localDate(d = new Date()) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}
export function addDays(date: string, amount: number) {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + amount);
  return localDate(d);
}
export function weekDays(end: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(end, i - 6));
}
export function formatDate(
  date: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' },
) {
  return new Intl.DateTimeFormat('en-US', options).format(new Date(date + 'T12:00:00'));
}
export function formatTime(minute: number) {
  return (
    String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0')
  );
}
export function duration(mins: number) {
  return (
    [Math.floor(mins / 60) ? Math.floor(mins / 60) + 'h' : '', mins % 60 ? (mins % 60) + 'm' : '']
      .filter(Boolean)
      .join(' ') || '0m'
  );
}
export function dailyEntries(s: Snapshot, date: string) {
  return s.activities.filter((e) => e.date === date).sort((a, b) => a.start - b.start);
}
export function activityError(entry: Activity, s: Snapshot) {
  const result = activitySchema.safeParse(entry);
  if (!result.success) return result.error.issues[0].message;
  if (!s.categories.some((c) => c.id === entry.categoryId)) return 'Choose a category.';
  if (
    s.activities.some(
      (e) =>
        e.id !== entry.id && e.date === entry.date && entry.start < e.end && entry.end > e.start,
    )
  )
    return 'This time overlaps another activity.';
  return null;
}
export type Gap = { start: number; end: number; gap: true };
export function timeline(entries: Activity[]): (Activity | Gap)[] {
  const rows: (Activity | Gap)[] = [];
  let cursor = 0;
  for (const e of [...entries].sort((a, b) => a.start - b.start)) {
    if (e.start > cursor) rows.push({ start: cursor, end: e.start, gap: true });
    rows.push(e);
    cursor = Math.max(cursor, e.end);
  }
  if (cursor < 1440) rows.push({ start: cursor, end: 1440, gap: true });
  return rows;
}
export function totals(entries: Activity[], categories: Category[]) {
  return categories
    .map((c) => ({
      ...c,
      minutes: entries
        .filter((e) => e.categoryId === c.id)
        .reduce((n, e) => n + e.end - e.start, 0),
    }))
    .filter((c) => c.minutes > 0);
}
export const coachSchema = z
  .object({
    requestId: z.string().uuid(),
    question: z.string().trim().min(1).max(2000),
    from: dateSchema,
    to: dateSchema,
    timezone: z.string().max(80),
    categories: z.array(categorySchema).max(200),
    activities: z.array(activitySchema).max(2000),
    history: z
      .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(12000) }))
      .max(12),
  })
  .superRefine((d, c) => {
    if (addDays(d.from, 6) !== d.to)
      c.addIssue({ code: 'custom', message: 'Coach context must cover exactly seven days.' });
    if (d.activities.some((e) => e.date < d.from || e.date > d.to))
      c.addIssue({ code: 'custom', message: 'Activity outside selected context.' });
    const ids = new Set(d.categories.map((c) => c.id));
    if (d.activities.some((e) => !ids.has(e.categoryId)))
      c.addIssue({ code: 'custom', message: 'Missing context category.' });
    for (const date of weekDays(d.to)) {
      const day = d.activities.filter((e) => e.date === date).sort((a, b) => a.start - b.start);
      if (day.some((e, i) => i > 0 && e.start < day[i - 1].end))
        c.addIssue({ code: 'custom', message: 'Overlapping context activities.' });
    }
  });
export type CoachInput = z.infer<typeof coachSchema>;
