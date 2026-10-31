import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { AnimatePresence, motion, useDragControls, usePresence } from 'motion/react';
import { motionTiming, useAppMotion } from './motion';
import {
  Activity as ActivityIcon,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpFromLine,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Coffee,
  Heart,
  House,
  Leaf,
  LoaderCircle,
  MessageCircle,
  Moon,
  MoreHorizontal,
  Music,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Tag,
  Trash2,
  WifiOff,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import {
  activityError,
  addDays,
  colors,
  dailyEntries,
  duration,
  formatDate,
  formatTime,
  iconNames,
  localDate,
  snapshotSchema,
  timeline,
  totals,
  weekDays,
  type Activity,
  type Category,
  type Message,
  type Snapshot,
  type CoachInput,
} from '../../../packages/shared/domain';
import {
  downloadBackup,
  onJournalChange,
  parseBackup,
  readJournal,
  requestPersistence,
  updateJournal,
} from './storage';
import {
  askCoach,
  checkConnection,
  connectionUrl,
  loadConnection,
  saveConnection,
  type Connection,
  type Health,
} from './connection';
const icons: Record<Category['icon'], LucideIcon> = {
  briefcase: BriefcaseBusiness,
  moon: Moon,
  sun: Sun,
  activity: ActivityIcon,
  book: BookOpen,
  coffee: Coffee,
  heart: Heart,
  music: Music,
  code: Code2,
  leaf: Leaf,
};
const uuid = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  const a = crypto.getRandomValues(new Uint8Array(16));
  a[6] = (a[6] & 15) | 64;
  a[8] = (a[8] & 63) | 128;
  return [...a]
    .map((n, i) => ([4, 6, 8, 10].includes(i) ? '-' : '') + n.toString(16).padStart(2, '0'))
    .join('');
};
type Screen = 'day' | 'week' | 'coach';
type Notification = { text: string; undo?: () => Promise<void> };
type Sheet =
  | {
      kind: 'activity';
      entry?: Activity;
      draft?: Activity;
      date?: string;
      start?: number;
      end?: number;
    }
  | { kind: 'settings' }
  | { kind: 'categories' }
  | { kind: 'category'; category?: Category }
  | { kind: 'import'; data: Snapshot }
  | null;
function CategoryIcon({
  category,
  size = 20,
}: {
  category: Pick<Category, 'icon' | 'color'>;
  size?: number;
}) {
  const Icon = icons[category.icon];
  return (
    <span className="category-icon" style={{ background: category.color }}>
      <Icon size={size} aria-hidden="true" />
    </span>
  );
}
function SheetFrame({
  title,
  contentKey,
  children,
  onClose,
}: {
  title: string;
  contentKey: number;
  children: ReactNode;
  onClose: () => void;
}) {
  const controls = useDragControls();
  const { reduced, instant, transition } = useAppMotion();
  const ref = useRef<HTMLElement>(null);
  const original = useRef(document.activeElement as HTMLElement | null);
  useLayoutEffect(() => {
    const content = ref.current?.querySelector('.sheet-content');
    if (content) content.scrollTop = 0;
    ref.current
      ?.querySelector<HTMLElement>('button:not(:disabled),input,select,textarea')
      ?.focus({ preventScroll: true });
  }, [contentKey]);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const node = ref.current;
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'Tab') {
        const all = [
          ...node!.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href]'),
        ].filter((el) => !el.hasAttribute('disabled') && el.getClientRects().length);
        const first = all[0],
          last = all.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', key);
      original.current?.isConnected && original.current.focus({ preventScroll: true });
    };
  }, [onClose]);
  return (
    <motion.div
      className="scrim"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, pointerEvents: 'auto' }}
      exit={{ opacity: 0, pointerEvents: 'none' }}
      transition={transition()}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        className="sheet-position"
        initial={{ transform: reduced || instant ? 'none' : 'translateY(100%)' }}
        animate={{ transform: 'translateY(0%)' }}
        exit={{ transform: reduced || instant ? 'none' : 'translateY(100%)' }}
        transition={transition(motionTiming.sheet, 'drawer')}
      >
        <motion.section
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby="sheet-title"
          className="sheet"
          drag={reduced ? false : 'y'}
          dragControls={controls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.65 }}
          dragTransition={{ bounceStiffness: 100, bounceDamping: 10 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > 100 || info.velocity.y > 650) onClose();
          }}
        >
          <div
            className="sheet-handle-area"
            aria-hidden="true"
            onPointerDown={(e) => {
              if (!reduced && e.isPrimary && e.button === 0) controls.start(e);
            }}
          >
            <div className="sheet-handle" />
          </div>
          <header className="sheet-header">
            <h2 id="sheet-title">{title}</h2>
            <button className="circle small" aria-label="Close sheet" onClick={onClose}>
              <X size={18} />
            </button>
          </header>
          <div key={contentKey} className="sheet-content">
            {children}
          </div>
        </motion.section>
      </motion.div>
    </motion.div>
  );
}
export function App() {
  const [data, setData] = useState<Snapshot | null>(null),
    [fatal, setFatal] = useState(''),
    [screen, setScreen] = useState<Screen>('day'),
    [date, setDate] = useState(localDate()),
    [sheet, setSheetValue] = useState<Sheet>(null),
    [toast, setToast] = useState<Notification | null>(null),
    [busy, setBusy] = useState(false),
    [connection, setConnection] = useState(loadConnection),
    [health, setHealth] = useState<Health | null>(null),
    [healthError, setHealthError] = useState(''),
    [chatError, setChatError] = useState(''),
    [chatBusy, setChatBusy] = useState(false),
    [question, setQuestion] = useState(''),
    [pending, setPending] = useState<CoachInput | null>(null),
    [online, setOnline] = useState(navigator.onLine),
    [expanded, setExpanded] = useState(false);
  const { instant, reduced, transition } = useAppMotion();
  const categoryReturn = useRef<{ entry?: Activity; draft: Activity } | null>(null);
  const sheetInstance = useRef(0);
  function setSheet(next: Sheet) {
    sheetInstance.current += 1;
    setSheetValue(next);
  }
  const controller = useRef<AbortController | null>(null),
    fileInput = useRef<HTMLInputElement>(null),
    lastMessage = useRef<HTMLDivElement>(null),
    operation = useRef(false);
  const {
    needRefresh: [needsRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW();
  useEffect(() => {
    let alive = true;
    const load = () =>
      readJournal()
        .then((s) => {
          if (alive) setData(s);
        })
        .catch(() => {
          if (alive)
            setFatal(
              'Daylog could not read local storage. Your browser may be blocking it. Keep your site data and try another normal browser window.',
            );
        });
    void load();
    const unsub = onJournalChange(() => void load());
    return () => {
      alive = false;
      unsub();
    };
  }, []);
  useEffect(() => {
    const handler = () => setOnline(navigator.onLine);
    window.addEventListener('online', handler);
    window.addEventListener('offline', handler);
    return () => {
      window.removeEventListener('online', handler);
      window.removeEventListener('offline', handler);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.undo ? 10000 : 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (screen === 'coach') void connect(connection);
  }, [screen]);
  useEffect(() => {
    if (screen === 'coach' && data?.messages.length)
      lastMessage.current?.scrollIntoView({ behavior: 'instant', block: 'nearest' });
  }, [data?.messages.length]);
  useEffect(() => () => controller.current?.abort(), []);
  async function commit(mutate: (s: Snapshot) => Snapshot | void, success?: string) {
    if (operation.current) return false;
    operation.current = true;
    setBusy(true);
    try {
      const next = await updateJournal(mutate);
      setData(next);
      void requestPersistence();
      if (success) setToast({ text: success });
      return true;
    } catch (e) {
      setToast({ text: e instanceof Error ? e.message : 'Could not save. Please try again.' });
      return false;
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  async function connect(value: Connection) {
    setHealth(null);
    setHealthError('');
    try {
      const status = await checkConnection(value);
      setHealth(status);
      return status;
    } catch (e) {
      setHealthError(e instanceof Error ? e.message : 'Connection failed.');
      return null;
    }
  }
  async function deleteActivity(entry: Activity) {
    if (
      await commit((s) => {
        s.activities = s.activities.filter((e) => e.id !== entry.id);
      })
    ) {
      setSheet(null);
      setToast({
        text: 'Activity deleted',
        undo: async () => {
          await commit((s) => {
            const error = activityError(entry, s);
            if (error) throw new Error(error);
            s.activities.push(entry);
          }, 'Activity restored');
        },
      });
    }
  }
  async function send(text = question, retry?: CoachInput) {
    if (!data || chatBusy || (!text.trim() && !retry)) return;
    setChatError('');
    if (!health?.configured) {
      setChatError(healthError || 'Connect your local server and configure OpenAI first.');
      return;
    }
    const to = date,
      from = addDays(to, -6),
      now = Date.now(),
      id = retry?.requestId || uuid();
    const input: CoachInput = retry || {
      requestId: id,
      question: text.trim(),
      from,
      to,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      categories: data.categories,
      activities: data.activities.filter((e) => e.date >= from && e.date <= to),
      history: data.messages.slice(-12).map((m) => ({ role: m.role, content: m.content })),
    };
    if (!retry) {
      if (input.question.length > 2000) {
        setChatError('Keep your message under 2,000 characters.');
        return;
      }
      if (
        !(await commit((s) => {
          s.messages.push({
            id,
            role: 'user',
            content: input.question,
            createdAt: now,
            range: from + ' to ' + to,
          });
          s.messages = s.messages.slice(-500);
        }))
      )
        return;
      setQuestion('');
    }
    setPending(input);
    setChatBusy(true);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const response = await askCoach(connection, input, abort.signal);
      await commit((s) => {
        if (!s.messages.some((m) => m.id === id + '-reply'))
          s.messages.push({
            id: id + '-reply',
            role: 'assistant',
            content: response.answer,
            createdAt: Date.now(),
            range: input.from + ' to ' + input.to,
          });
        s.messages = s.messages.slice(-500);
      });
      setPending(null);
    } catch (e) {
      setChatError(e instanceof Error ? e.message : 'Could not reach the coach.');
    } finally {
      setChatBusy(false);
      controller.current = null;
    }
  }
  const closeSheet = useRef(() => {
    categoryReturn.current = null;
    setSheet(null);
  }).current;
  if (fatal)
    return (
      <main className="boot-error">
        <ShieldCheck />
        <h1>Let’s protect your journal.</h1>
        <p>{fatal}</p>
        <button className="primary" onClick={() => location.reload()}>
          Try again
        </button>
      </main>
    );
  if (!data)
    return (
      <main className="loading">
        <span className="brand-symbol">
          <ActivityIcon />
        </span>
        <h1>Daylog</h1>
        <p>A little clarity for your day.</p>
        <LoaderCircle className="spin" aria-label="Opening your journal" />
      </main>
    );
  const entries = dailyEntries(data, date),
    dayTotals = totals(entries, data.categories),
    logged = entries.reduce((n, e) => n + e.end - e.start, 0),
    days = weekDays(date),
    weekEntries = data.activities.filter((e) => e.date >= days[0] && e.date <= date),
    weekTotals = totals(weekEntries, data.categories),
    weekMinutes = weekEntries.reduce((n, e) => n + e.end - e.start, 0),
    loggedDays = new Set(weekEntries.map((e) => e.date)).size,
    rows = timeline(entries),
    lookup = new Map(data.categories.map((c) => [c.id, c])),
    firstEntry = data.activities.length === 0;
  const pageTitle =
    screen === 'day'
      ? date === localDate()
        ? 'Today'
        : formatDate(date, { weekday: 'long' })
      : screen === 'week'
        ? 'Your week'
        : 'A little clarity.';
  function openActivity() {
    const previousEnd = entries.at(-1)?.end ?? 540;
    const start = previousEnd === 1440 ? 0 : previousEnd;
    setSheet({
      kind: 'activity',
      date: previousEnd === 1440 ? addDays(date, 1) : date,
      start,
      end: Math.min(start + 60, 1440),
    });
  }
  function renderSheet() {
    if (!sheet) return null;
    switch (sheet.kind) {
      case 'activity':
        return (
          <ActivityEditor
            key={sheet.entry?.id || 'new'}
            date={sheet.date ?? date}
            entry={sheet.entry}
            draftValue={sheet.draft}
            start={sheet.start}
            end={sheet.end}
            data={data!}
            busy={busy}
            onDelete={deleteActivity}
            onNewCategory={(draft) => {
              categoryReturn.current = { entry: sheet.entry, draft };
              setSheet({ kind: 'category' });
            }}
            onSave={async (entry) => {
              const ok = await commit(
                (s) => {
                  const error = activityError(entry, s);
                  if (error) throw new Error(error);
                  s.activities = [...s.activities.filter((e) => e.id !== entry.id), entry];
                },
                sheet.entry ? 'Activity updated' : 'Activity logged',
              );
              if (ok) {
                setDate(entry.date);
                setSheet(null);
              }
            }}
          />
        );
      case 'settings':
        return (
          <>
            <div className="settings-intro">
              <span className="privacy-icon">
                <ShieldCheck size={23} />
              </span>
              <div>
                <h3>Yours, on this device.</h3>
                <p>
                  Activities stay here. Only the week you choose is sent when you ask your coach.
                </p>
              </div>
            </div>
            <p className="eyebrow">YOUR JOURNAL</p>
            <div className="group">
              <button className="settings-row" onClick={() => setSheet({ kind: 'categories' })}>
                <Tag />
                <span>
                  Categories
                  <small>{data!.categories.filter((c) => !c.archived).length} available</small>
                </span>
                <ChevronRight />
              </button>
              <button
                className="settings-row"
                onClick={() => {
                  downloadBackup(data!);
                  setToast({ text: 'Backup exported' });
                }}
              >
                <ArrowDownToLine />
                <span>
                  Export backup<small>Activities, categories & conversations</small>
                </span>
                <ChevronRight />
              </button>
              <button className="settings-row" onClick={() => fileInput.current?.click()}>
                <ArrowUpFromLine />
                <span>
                  Restore backup<small>Replace this device’s journal</small>
                </span>
                <ChevronRight />
              </button>
            </div>
            <p className="field-hint">
              Browser data can be cleared. Keep a backup somewhere safe. Backups do not contain your
              connection token.
            </p>
            <ConnectionEditor
              connection={connection}
              busy={chatBusy}
              onSave={async (value) => {
                setConnection(value);
                saveConnection(value);
                await connect(value);
              }}
              health={health}
              error={healthError}
            />
            <p className="version">Daylog 1.0 · Made for a little more room.</p>
          </>
        );
      case 'categories':
        return (
          <>
            <p className="sheet-description">
              Give your time a name. Colors stay consistent across your journal.
            </p>
            <div className="group category-list">
              {data!.categories.map((c) => (
                <button
                  key={c.id}
                  className="settings-row"
                  onClick={() => setSheet({ kind: 'category', category: c })}
                >
                  <CategoryIcon category={c} />
                  <span>
                    {c.name}
                    <small>
                      {c.archived
                        ? 'Archived'
                        : data!.activities.filter((e) => e.categoryId === c.id).length +
                          ' activities'}
                    </small>
                  </span>
                  <ChevronRight />
                </button>
              ))}
            </div>
            <button className="primary" onClick={() => setSheet({ kind: 'category' })}>
              <Plus size={18} />
              New category
            </button>
          </>
        );
      case 'category':
        return (
          <CategoryEditor
            category={sheet.category}
            categories={data!.categories}
            busy={busy}
            onSave={async (c) => {
              if (
                await commit((s) => {
                  const previous = s.categories.find((x) => x.id === c.id);
                  if (
                    s.categories.some(
                      (x) => x.id !== c.id && x.name.toLowerCase() === c.name.toLowerCase(),
                    )
                  )
                    throw new Error('A category with this name already exists.');
                  if (c.archived && !s.categories.some((x) => x.id !== c.id && !x.archived))
                    throw new Error('Keep at least one active category.');
                  s.categories = previous
                    ? s.categories.map((x) => (x.id === c.id ? c : x))
                    : [...s.categories, c];
                }, 'Category saved')
              ) {
                const back = categoryReturn.current;
                categoryReturn.current = null;
                if (back)
                  setSheet({
                    kind: 'activity',
                    entry: back.entry,
                    draft: { ...back.draft, categoryId: c.id },
                  });
                else setSheet({ kind: 'categories' });
              }
            }}
          />
        );
      case 'import':
        return (
          <>
            <div className="restore-icon">
              <RefreshCw size={27} />
            </div>
            <h3>Restore this journal?</h3>
            <p className="sheet-description">
              This backup contains {sheet.data.activities.length} activities and{' '}
              {sheet.data.categories.length} categories. It will replace your current journal on
              this device.
            </p>
            <p className="field-hint">
              Export your current journal first if you want to keep a copy.
            </p>
            <button className="secondary full" onClick={() => downloadBackup(data!)}>
              Export current journal
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                if (await commit(() => sheet.data, 'Journal restored')) {
                  setSheet(null);
                  setExpanded(false);
                }
              }}
            >
              Restore backup
            </button>
          </>
        );
    }
  }
  const titles = {
    activity: sheet?.kind === 'activity' && sheet.entry ? 'Edit activity' : 'Log activity',
    settings: 'Your space',
    categories: 'Categories',
    category: sheet?.kind === 'category' && sheet.category ? 'Edit category' : 'New category',
    import: 'Restore backup',
  };
  return (
    <div className="app-shell">
      <div className="app-body" inert={sheet !== null}>
        <header className="topbar">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setScreen('day');
            }}
            className="wordmark"
          >
            <span className="brand-symbol">
              <ActivityIcon size={16} />
            </span>
            daylog<span className="brand-dot">.</span>
          </a>
          <button
            className="circle"
            aria-label="Open settings"
            onClick={() => {
              void connect(connection);
              setSheet({ kind: 'settings' });
            }}
          >
            <Settings2 size={19} />
          </button>
        </header>
        {!online && (
          <div className="status-banner">
            <WifiOff size={15} />
            Offline. Your journal still works.
          </div>
        )}
        {needsRefresh && (
          <div className="status-banner">
            An update is ready.
            <button onClick={() => void updateServiceWorker(true)}>Update</button>
          </div>
        )}
        <main key={screen} className="main">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {screen === 'coach'
                  ? 'YOUR TIME, UNDERSTOOD'
                  : screen === 'week'
                    ? formatDate(days[0]) + ' — ' + formatDate(date)
                    : formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
              <h1>{pageTitle}</h1>
            </div>
            {screen !== 'coach' && (
              <label className="circle date-control" aria-label="Choose journal date">
                <CalendarDays size={21} />
                <input
                  type="date"
                  aria-label="Choose journal date"
                  value={date}
                  onInput={(e) => {
                    if (
                      e.currentTarget.value &&
                      /^\d{4}-\d{2}-\d{2}$/.test(e.currentTarget.value)
                    ) {
                      setDate(e.currentTarget.value);
                      setExpanded(false);
                    }
                  }}
                />
              </label>
            )}
          </div>
          {screen === 'day' && (
            <>
              <div className="day-selector" aria-label="Choose a day">
                {weekDays(localDate()).map((d) => (
                  <button
                    key={d}
                    className={d === date ? 'selected' : ''}
                    aria-pressed={d === date}
                    onClick={() => {
                      setDate(d);
                      setExpanded(false);
                    }}
                  >
                    {d === date && (
                      <motion.b
                        className="day-indicator"
                        aria-hidden="true"
                        layoutId={instant || reduced ? undefined : 'day-selection'}
                        transition={transition(motionTiming.fast, 'inOut')}
                      />
                    )}
                    <span>{formatDate(d, { weekday: 'short' }).slice(0, 1)}</span>
                    <strong>{formatDate(d, { day: 'numeric' })}</strong>
                    {data.activities.some((e) => e.date === d) ? (
                      <i />
                    ) : (
                      <i className="empty-dot" />
                    )}
                  </button>
                ))}
              </div>
              <section className="summary-card">
                <div className="summary-heading">
                  <div>
                    <p className="card-overline">Your day, accounted for</p>
                    <div className="hero-number">
                      <strong>{Math.round((logged / 60) * 10) / 10}</strong>
                      <span>
                        hours logged<span className="of-day">of 24 hours</span>
                      </span>
                    </div>
                  </div>
                  <span className="summary-glyph">
                    <ActivityIcon size={27} />
                  </span>
                </div>
                <Allocation entries={entries} categories={data.categories} />
                <div className="category-totals">
                  {dayTotals.length ? (
                    dayTotals.map((c) => (
                      <div key={c.id}>
                        <i style={{ background: c.color }} />
                        <span>{c.name}</span>
                        <strong>{duration(c.minutes)}</strong>
                      </div>
                    ))
                  ) : (
                    <p className="quiet">A little work. A little rest. It all belongs here.</p>
                  )}
                </div>
              </section>
              <div className="section-heading">
                <h2>Your timeline</h2>
                <span>
                  {entries.length} {entries.length === 1 ? 'activity' : 'activities'}
                </span>
              </div>
              {firstEntry ? (
                <section className="empty-state">
                  <span className="empty-art">
                    <Sun size={30} />
                  </span>
                  <h3>A day worth noticing.</h3>
                  <p>
                    What did you spend time on?
                    <br />
                    Start with one thing. The picture grows from there.
                  </p>
                  <button className="primary" onClick={openActivity}>
                    <Plus size={18} />
                    Log your first activity
                  </button>
                </section>
              ) : !entries.length ? (
                <section className="empty-state compact">
                  <CalendarDays size={27} />
                  <h3>A fresh page.</h3>
                  <p>No activities logged on {formatDate(date)}.</p>
                  <button className="text-button" onClick={openActivity}>
                    Log an activity <Plus size={16} />
                  </button>
                </section>
              ) : (
                <>
                  <div className="timeline group">
                    {(expanded ? rows : rows.slice(0, 6)).map((entry, i) =>
                      'gap' in entry ? (
                        <button
                          key={'gap' + i}
                          className="timeline-row gap-row"
                          onClick={() =>
                            setSheet({
                              kind: 'activity',
                              start: entry.start,
                              end: Math.min(entry.start + 60, entry.end),
                            })
                          }
                        >
                          <span className="gap-icon">
                            <Plus size={19} />
                          </span>
                          <span className="entry-copy">
                            <strong>Room to fill in</strong>
                            <small>
                              {formatTime(entry.start)} — {formatTime(entry.end)}
                            </small>
                          </span>
                          <span className="entry-duration">
                            {duration(entry.end - entry.start)}
                            <ChevronRight size={13} />
                          </span>
                        </button>
                      ) : (
                        <button
                          key={entry.id}
                          className="timeline-row"
                          onClick={() => setSheet({ kind: 'activity', entry })}
                        >
                          <CategoryIcon category={lookup.get(entry.categoryId)!} />
                          <span className="entry-copy">
                            <strong>{entry.title}</strong>
                            <small>
                              {formatTime(entry.start)} — {formatTime(entry.end)}
                              {entry.note && <span className="note-dot" />}
                            </small>
                          </span>
                          <span className="entry-duration">
                            {duration(entry.end - entry.start)}
                          </span>
                        </button>
                      ),
                    )}
                  </div>
                  {rows.length > 6 && (
                    <button
                      className="show-more"
                      aria-expanded={expanded}
                      onClick={() => setExpanded((v) => !v)}
                    >
                      {expanded ? 'Show less' : 'Rest of the day · ' + (rows.length - 6) + ' more'}
                      <ChevronDown
                        size={15}
                        style={{ transform: expanded ? 'rotate(180deg)' : undefined }}
                      />
                    </button>
                  )}
                </>
              )}
              {entries.length > 0 && (
                <p className="day-footer">
                  {logged === 1440 ? (
                    <>
                      <CheckCheck size={14} />
                      All 24 hours, remembered.
                    </>
                  ) : (
                    <>{duration(1440 - logged)} unlogged. Rest counts, too.</>
                  )}
                </p>
              )}
            </>
          )}
          {screen === 'week' && (
            <>
              <div className="range-control">
                <button
                  className="circle small"
                  aria-label="Previous week"
                  onClick={() => setDate(addDays(date, -7))}
                >
                  <ChevronLeft size={19} />
                </button>
                <span>Seven days, one picture</span>
                <button
                  className="circle small"
                  aria-label="Next week"
                  onClick={() => setDate(addDays(date, 7))}
                >
                  <ChevronRight size={19} />
                </button>
              </div>
              <section className="week-card">
                <p className="card-overline">A week in your life</p>
                <div className="hero-number">
                  <strong>{Math.round((weekMinutes / 60) * 10) / 10}</strong>
                  <span>
                    hours logged<span className="of-day">across {loggedDays} of 7 days</span>
                  </span>
                </div>
                <div className="week-chart">
                  {days.map((d) => {
                    const es = dailyEntries(data, d),
                      sum = es.reduce((n, e) => n + e.end - e.start, 0);
                    return (
                      <button
                        className="week-row"
                        key={d}
                        aria-label={formatDate(d) + ', ' + duration(sum) + ' logged. Open day.'}
                        onClick={() => {
                          setDate(d);
                          setScreen('day');
                          setExpanded(false);
                        }}
                      >
                        <span>{formatDate(d, { weekday: 'short' })}</span>
                        <Allocation entries={es} categories={data.categories} />
                        <small>{sum ? duration(sum) : '—'}</small>
                      </button>
                    );
                  })}
                </div>
                <div className="legend">
                  {weekTotals.map((c) => (
                    <span key={c.id}>
                      <i style={{ background: c.color }} />
                      {c.name}
                    </span>
                  ))}
                  <span>
                    <i className="unlogged-dot" />
                    Unlogged
                  </span>
                </div>
              </section>
              <section className="group breakdown">
                {weekTotals.length ? (
                  weekTotals
                    .sort((a, b) => b.minutes - a.minutes)
                    .map((c) => (
                      <div className="breakdown-row" key={c.id}>
                        <CategoryIcon category={c} size={17} />
                        <span>
                          {c.name}
                          <small>
                            {Math.round((c.minutes / Math.max(weekMinutes, 1)) * 100)}% of logged
                            time
                          </small>
                        </span>
                        <strong>{duration(c.minutes)}</strong>
                      </div>
                    ))
                ) : (
                  <div className="empty-state compact">
                    <h3>Your patterns start here.</h3>
                    <p>Log a few activities to see how your week adds up.</p>
                  </div>
                )}
              </section>
              <section className="insight-card">
                <span className="insight-label">
                  <Sparkles size={17} />
                  Make room for what matters
                </span>
                <h3>A little reflection goes a long way.</h3>
                <p>
                  {loggedDays < 7
                    ? `You have ${loggedDays} of 7 days logged. A fuller picture makes for more grounded suggestions.`
                    : 'Your week is ready to reflect on. What would you like to make more time for?'}
                </p>
                <button className="text-button" onClick={() => setScreen('coach')}>
                  Reflect with your coach <ArrowRight size={16} />
                </button>
              </section>
            </>
          )}
          {screen === 'coach' && (
            <>
              <p className="coach-subtitle">
                Less rushing. More intention.
                <br />
                Let’s make a little room for you.
              </p>
              <button
                className={'connection-badge ' + (health?.configured ? 'ready' : '')}
                onClick={() => setSheet({ kind: 'settings' })}
              >
                <i />
                {health?.configured
                  ? 'Local server connected'
                  : health
                    ? 'OpenAI needs setup'
                    : healthError
                      ? 'Local server offline'
                      : 'Checking local server…'}
                <ChevronRight size={13} />
              </button>
              <div className="context-card">
                <span>
                  <CalendarDays size={16} />
                  {formatDate(days[0])} — {formatDate(date)}
                </span>
                <span>
                  {weekEntries.length} activities · {loggedDays}/7 days
                </span>
              </div>
              <div className="conversation" aria-live="polite" aria-relevant="additions">
                {!data.messages.length && (
                  <div className="coach-welcome">
                    <span className="coach-mark">
                      <Sparkles size={28} />
                    </span>
                    <h2>
                      A fresh perspective,
                      <br />
                      on your everyday.
                    </h2>
                    <p>
                      I’ll help you reflect on where your time goes, and turn that into a plan that
                      feels like yours.
                    </p>
                  </div>
                )}
                {data.messages.map((m) => (
                  <article key={m.id} className={'message ' + m.role}>
                    {m.role === 'assistant' && (
                      <span className="message-label">
                        <Sparkles size={13} />
                        Daylog coach
                      </span>
                    )}
                    <p>{m.content}</p>
                    <time>
                      {new Date(m.createdAt).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </article>
                ))}
                {chatBusy && (
                  <div className="thinking">
                    <LoaderCircle size={16} className="spin" />
                    Finding a little clarity…
                    <button onClick={() => controller.current?.abort()}>Cancel</button>
                  </div>
                )}
                <div ref={lastMessage} />
              </div>
              {!data.messages.length && (
                <div className="prompts">
                  {['Help me plan tomorrow', 'Where did my time go this week?'].map((text) => (
                    <button
                      key={text}
                      onClick={() => {
                        setQuestion(text);
                        if (health?.configured) void send(text);
                      }}
                    >
                      {text}
                      <ArrowRight size={16} />
                    </button>
                  ))}
                </div>
              )}
              {chatError && (
                <div className="inline-error" role="alert">
                  {chatError}
                  {pending && !chatBusy && health?.configured && (
                    <button className="text-button" onClick={() => void send('', pending)}>
                      Retry this message <RefreshCw size={14} />
                    </button>
                  )}
                </div>
              )}
              <form
                className="composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <textarea
                  aria-label="Message your coach"
                  placeholder="What would you like to make room for?"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  rows={2}
                  maxLength={2000}
                />
                <button
                  aria-label="Send message"
                  type="submit"
                  disabled={chatBusy || busy || !question.trim()}
                >
                  <ArrowUp size={20} />
                </button>
              </form>
              <p className="privacy-note">
                <ShieldCheck size={12} />
                Your selected week and recent chat go to OpenAI only when you send. Advice is a
                draft, not a calendar change.
              </p>
              {data.messages.length > 0 && (
                <button
                  className="text-button muted center"
                  disabled={chatBusy || busy}
                  onClick={async () => {
                    controller.current?.abort();
                    await commit((s) => {
                      s.messages = [];
                    }, 'Started a new conversation');
                    setPending(null);
                    setChatError('');
                  }}
                >
                  Start a new conversation
                </button>
              )}
            </>
          )}
        </main>
        <footer className="storage-note">
          <span className="tiny-dot" />
          {offlineReady ? 'Available offline' : 'Saved on this device'}
          <span>daylog 1.0</span>
        </footer>
        <div className="dock-wrap">
          <nav className={'dock active-' + screen} aria-label="Main navigation">
            <motion.button
              layout={instant || reduced ? false : 'position'}
              transition={transition(motionTiming.fast, 'inOut')}
              aria-label="Today"
              aria-current={screen === 'day' ? 'page' : undefined}
              className={screen === 'day' ? 'active' : ''}
              onClick={() => setScreen('day')}
            >
              {screen === 'day' && (
                <motion.i
                  className="dock-indicator"
                  aria-hidden="true"
                  layoutId={instant || reduced ? undefined : 'dock-selection'}
                  transition={transition(motionTiming.surface, 'inOut')}
                />
              )}
              <House size={23} />
              <span>Today</span>
            </motion.button>
            <motion.button
              layout={instant || reduced ? false : 'position'}
              transition={transition(motionTiming.fast, 'inOut')}
              aria-label="Week"
              aria-current={screen === 'week' ? 'page' : undefined}
              className={screen === 'week' ? 'active' : ''}
              onClick={() => setScreen('week')}
            >
              {screen === 'week' && (
                <motion.i
                  className="dock-indicator"
                  aria-hidden="true"
                  layoutId={instant || reduced ? undefined : 'dock-selection'}
                  transition={transition(motionTiming.surface, 'inOut')}
                />
              )}
              <CalendarDays size={23} />
              <span>Week</span>
            </motion.button>
            <button className="dock-add" aria-label="Log activity" onClick={openActivity}>
              <Plus size={30} />
            </button>
            <motion.button
              layout={instant || reduced ? false : 'position'}
              transition={transition(motionTiming.fast, 'inOut')}
              aria-label="Coach"
              aria-current={screen === 'coach' ? 'page' : undefined}
              className={screen === 'coach' ? 'active' : ''}
              onClick={() => setScreen('coach')}
            >
              {screen === 'coach' && (
                <motion.i
                  className="dock-indicator"
                  aria-hidden="true"
                  layoutId={instant || reduced ? undefined : 'dock-selection'}
                  transition={transition(motionTiming.surface, 'inOut')}
                />
              )}
              <MessageCircle size={23} />
              <span>Coach</span>
            </motion.button>
          </nav>
        </div>
      </div>
      <input
        ref={fileInput}
        type="file"
        className="visually-hidden"
        accept="application/json,.json"
        aria-label="Choose a backup file"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            setSheet({ kind: 'import', data: await parseBackup(file) });
          } catch (error) {
            setToast({ text: error instanceof Error ? error.message : 'Could not read backup.' });
          }
        }}
      />
      <AnimatePresence>
        {sheet && (
          <SheetFrame
            key="journal-sheet"
            contentKey={sheetInstance.current}
            title={titles[sheet.kind]}
            onClose={closeSheet}
          >
            {renderSheet()}
          </SheetFrame>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {toast && (
          <Toast key="notification" notification={toast} onDismiss={() => setToast(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
function Toast({ notification, onDismiss }: { notification: Notification; onDismiss: () => void }) {
  const [present, safeToRemove] = usePresence();
  const { transition } = useAppMotion();
  const duration = transition().duration;
  useEffect(() => {
    if (present) return;
    if (!duration) {
      safeToRemove?.();
      return;
    }
    const timer = window.setTimeout(() => safeToRemove?.(), duration * 1000);
    return () => window.clearTimeout(timer);
  }, [present, safeToRemove, duration]);
  return (
    <div
      className="toast"
      role="status"
      data-ending={!present || undefined}
      aria-hidden={!present || undefined}
      inert={!present}
    >
      <Check size={17} />
      <span>{notification.text}</span>
      {notification.undo && (
        <button
          onClick={() => {
            onDismiss();
            void notification.undo?.();
          }}
        >
          Undo
        </button>
      )}
      <button className="toast-close" aria-label="Dismiss notification" onClick={onDismiss}>
        <X size={14} />
      </button>
    </div>
  );
}
function Allocation({ entries, categories }: { entries: Activity[]; categories: Category[] }) {
  const values = totals(entries, categories);
  return (
    <div
      className="allocation"
      role="img"
      aria-label={
        values.length
          ? values.map((c) => c.name + ' ' + duration(c.minutes)).join(', ')
          : 'No time logged'
      }
    >
      {values.map((c) => (
        <span key={c.id} style={{ width: (c.minutes / 1440) * 100 + '%', background: c.color }} />
      ))}
    </div>
  );
}
function ActivityEditor({
  date,
  entry,
  draftValue,
  start = 540,
  end = 600,
  data,
  busy,
  onSave,
  onDelete,
  onNewCategory,
}: {
  date: string;
  entry?: Activity;
  draftValue?: Activity;
  start?: number;
  end?: number;
  data: Snapshot;
  busy: boolean;
  onSave: (a: Activity) => Promise<void>;
  onDelete: (a: Activity) => Promise<void>;
  onNewCategory: (draft: Activity) => void;
}) {
  const [draft, setDraft] = useState<Activity>(
    draftValue ||
      entry || {
        id: uuid(),
        date,
        title: '',
        categoryId: data.categories.find((c) => !c.archived)!.id,
        start,
        end,
        note: '',
      },
  );
  const [touched, setTouched] = useState(false),
    [error, setError] = useState('');
  const set = (patch: Partial<Activity>) => {
    setDraft((v) => ({ ...v, ...patch }));
    setTouched(true);
  };
  const issue = activityError(draft, data);
  function capture(form: HTMLFormElement): Activity {
    const fields = new FormData(form);
    const toMinute = (key: string) => {
      const [h, m] = String(fields.get(key)).split(':').map(Number);
      return h * 60 + m;
    };
    return {
      ...draft,
      date: String(fields.get('date')),
      start: toMinute('start'),
      end: toMinute('end') || 1440,
    };
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    const next = capture(e.currentTarget);
    setDraft(next);
    const currentIssue = activityError(next, data);
    if (currentIssue) {
      setError(currentIssue);
      return;
    }
    try {
      await onSave(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save activity.');
    }
  }
  const activeCategories = data.categories.filter((c) => !c.archived || c.id === draft.categoryId);
  return (
    <form onSubmit={submit}>
      <div className="group form-group">
        <label className="title-field">
          Activity
          <input
            autoComplete="off"
            aria-label="Activity name"
            placeholder="What did you do?"
            value={draft.title}
            maxLength={120}
            onChange={(e) => set({ title: e.target.value })}
            required
          />
        </label>
        <label className="form-row">
          Date
          <input
            name="date"
            type="date"
            defaultValue={draft.date}
            onInput={(e) => set({ date: e.currentTarget.value })}
            required
          />
        </label>
        <label className="form-row">
          From
          <input
            name="start"
            type="time"
            defaultValue={formatTime(draft.start)}
            onInput={(e) => {
              if (e.currentTarget.value) {
                const [h, m] = e.currentTarget.value.split(':').map(Number);
                set({ start: h * 60 + m });
              }
            }}
            required
          />
        </label>
        <label className="form-row">
          Until
          <input
            name="end"
            type="time"
            defaultValue={draft.end === 1440 ? '00:00' : formatTime(draft.end)}
            onInput={(e) => {
              if (e.currentTarget.value) {
                const [h, m] = e.currentTarget.value.split(':').map(Number);
                set({ end: h * 60 + m || 1440 });
              }
            }}
            required
          />
        </label>
      </div>
      <div className="field-heading">
        <span>Category</span>
        <button
          type="button"
          className="text-button"
          onClick={(e) => onNewCategory(capture(e.currentTarget.form!))}
        >
          <Plus size={14} />
          New category
        </button>
      </div>
      <div className="category-picker" role="group" aria-label="Activity category">
        {activeCategories.map((c) => {
          const Icon = icons[c.icon];
          return (
            <button
              key={c.id}
              type="button"
              className={draft.categoryId === c.id ? 'selected' : ''}
              aria-pressed={draft.categoryId === c.id}
              style={{ '--category': c.color } as CSSProperties}
              onClick={() => set({ categoryId: c.id })}
            >
              <Icon size={16} />
              {c.name}
              {draft.categoryId === c.id && <Check size={13} />}
            </button>
          );
        })}
      </div>
      <details className="note-disclosure" open={draft.note ? true : undefined}>
        <summary>
          Add a note <span>optional</span>
        </summary>
        <textarea
          aria-label="Activity note"
          placeholder="Anything you want to remember…"
          rows={2}
          maxLength={500}
          value={draft.note}
          onChange={(e) => set({ note: e.target.value })}
        />
      </details>
      <p className="field-hint">
        {draft.end > draft.start ? duration(draft.end - draft.start) + ' · ' : ''}00:00 as the end
        time means midnight at the end of this day. Split overnight activities across two dates.
      </p>
      {(error || (touched && issue && draft.title)) && (
        <p className="inline-error" role="alert">
          {issue || error}
        </p>
      )}
      <button className="primary" type="submit" disabled={busy}>
        {busy ? <LoaderCircle className="spin" size={17} /> : <Check size={18} />}Save activity
      </button>
      {entry && (
        <button
          type="button"
          className="danger-button"
          disabled={busy}
          onClick={() => void onDelete(entry)}
        >
          <Trash2 size={16} />
          Delete activity
        </button>
      )}
    </form>
  );
}
function CategoryEditor({
  category,
  categories,
  busy,
  onSave,
}: {
  category?: Category;
  categories: Category[];
  busy: boolean;
  onSave: (c: Category) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Category>(
      category || { id: uuid(), name: '', color: colors[0], icon: 'book', archived: false },
    ),
    [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    const next = { ...draft, name: draft.name.trim() };
    if (!next.name) {
      setError('Give this category a name.');
      return;
    }
    if (
      categories.some((c) => c.id !== next.id && c.name.toLowerCase() === next.name.toLowerCase())
    ) {
      setError('A category with this name already exists.');
      return;
    }
    try {
      await onSave(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save category.');
    }
  }
  const preview = {
    ...draft,
    icon: iconNames.includes(draft.icon) ? draft.icon : ('book' as const),
  };
  return (
    <form onSubmit={submit}>
      <div className="category-preview">
        <CategoryIcon category={preview} size={26} />
      </div>
      <label className="standalone-label">
        Name
        <input
          aria-label="Category name"
          className="input"
          placeholder="e.g. Deep work, Cooking, Reading"
          maxLength={32}
          value={draft.name}
          onChange={(e) => setDraft((v) => ({ ...v, name: e.target.value }))}
          required
        />
      </label>
      <p className="field-heading">Color</p>
      <div className="color-picker" role="group" aria-label="Category color">
        {colors.map((color, i) => (
          <button
            type="button"
            key={color}
            style={{ background: color }}
            aria-label={['Violet', 'Orange', 'Green', 'Blue', 'Pink', 'Teal', 'Purple', 'Amber'][i]}
            aria-pressed={draft.color === color}
            className={draft.color === color ? 'selected' : ''}
            onClick={() => setDraft((v) => ({ ...v, color }))}
          >
            {draft.color === color && <Check size={19} />}
          </button>
        ))}
      </div>
      <p className="field-heading">Icon</p>
      <div className="icon-picker" role="group" aria-label="Category icon">
        {iconNames.map((name) => {
          const Icon = icons[name];
          return (
            <button
              type="button"
              key={name}
              aria-label={name}
              aria-pressed={draft.icon === name}
              className={draft.icon === name ? 'selected' : ''}
              onClick={() => setDraft((v) => ({ ...v, icon: name }))}
            >
              <Icon size={22} />
            </button>
          );
        })}
      </div>
      {category && (
        <label className="switch-row">
          <span>
            Archive category<small>Keep past activities, hide it from new entries.</small>
          </span>
          <input
            type="checkbox"
            checked={draft.archived}
            onChange={(e) => setDraft((v) => ({ ...v, archived: e.target.checked }))}
          />
        </label>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy} type="submit">
        <Check size={18} />
        Save category
      </button>
    </form>
  );
}
function ConnectionEditor({
  connection,
  onSave,
  health,
  error,
  busy,
}: {
  connection: Connection;
  onSave: (c: Connection) => Promise<void>;
  health: Health | null;
  error: string;
  busy: boolean;
}) {
  const [draft, setDraft] = useState(connection),
    [checking, setChecking] = useState(false),
    [localError, setLocalError] = useState('');
  return (
    <section className="connection-settings">
      <p className="eyebrow">LOCAL AI SERVER</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setLocalError('');
          try {
            const value = { url: connectionUrl(draft.url), token: draft.token.trim() };
            setChecking(true);
            await onSave(value);
          } catch (e) {
            setLocalError(e instanceof Error ? e.message : 'Invalid connection.');
          } finally {
            setChecking(false);
          }
        }}
      >
        <div className="group form-group">
          <label className="stacked-field">
            Server address
            <input
              className="input"
              type="url"
              aria-label="Server address"
              placeholder="Same origin (default)"
              value={draft.url}
              onChange={(e) => setDraft((v) => ({ ...v, url: e.target.value }))}
              autoCapitalize="none"
              autoCorrect="off"
            />
          </label>
          <label className="stacked-field">
            Connection token
            <input
              className="input"
              type="password"
              aria-label="Connection token"
              placeholder="DAYLOG_TOKEN from your server"
              value={draft.token}
              onChange={(e) => setDraft((v) => ({ ...v, token: e.target.value }))}
              autoComplete="off"
            />
          </label>
        </div>
        <p className="field-hint">
          Leave the address empty when running Daylog with its local proxy. For a hosted app, enter
          a private HTTPS address for your computer. On a phone, localhost refers to the phone.
        </p>
        <button className="secondary full" disabled={checking || busy} type="submit">
          {checking ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />}Save &
          test connection
        </button>
        {health && (
          <p className={health.configured ? 'connection-success' : 'inline-error'} role="status">
            {health.configured
              ? 'Connected. Your coach is ready.'
              : 'Server reached. Set ' +
                health.missing.join(', ') +
                ' in its .env file and restart.'}
          </p>
        )}
        {(localError || error) && (
          <p className="inline-error" role="alert">
            {localError || error}
          </p>
        )}
        <p className="field-hint">
          Your OpenAI API key belongs in the server’s .env file. This app only stores the local
          connection token on this device.
        </p>
      </form>
    </section>
  );
}
