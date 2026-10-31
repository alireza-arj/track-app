import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { MotionConfig } from 'motion/react';

// CSS and Motion share one timing scale, including the reduced-motion variant.
export const motionTiming = {
  feedback: 0.13,
  fast: 0.16,
  surface: 0.2,
  sheet: 0.28,
  reduced: 0.12,
};
export const motionEase = {
  out: [0.23, 1, 0.32, 1],
  inOut: [0.77, 0, 0.175, 1],
  drawer: [0.32, 0.72, 0, 1],
} as const;
const motionStyles = {
  '--ease-out': `cubic-bezier(${motionEase.out.join(',')})`,
  '--ease-in-out': `cubic-bezier(${motionEase.inOut.join(',')})`,
  '--ease-drawer': `cubic-bezier(${motionEase.drawer.join(',')})`,
  ...Object.fromEntries(
    Object.entries(motionTiming).map(([name, seconds]) => [
      `--duration-${name}`,
      `${seconds * 1000}ms`,
    ]),
  ),
} as CSSProperties;
const MotionPreferences = createContext({ instant: false, reduced: false });
const reducedMotionQuery = '(prefers-reduced-motion: reduce)';
function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(reducedMotionQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
const getReducedMotion = () => window.matchMedia(reducedMotionQuery).matches;
const getServerReducedMotion = () => false;

export function MotionProvider({ children }: { children: ReactNode }) {
  const [keyboard, setKeyboard] = useState(false);
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    getServerReducedMotion,
  );
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) setKeyboard(true);
    };
    const onPointer = () => setKeyboard(false);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
    };
  }, []);
  return (
    <MotionPreferences.Provider value={{ instant: keyboard, reduced }}>
      <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
        <div
          className="motion-root"
          style={motionStyles}
          data-motion-input={keyboard ? 'keyboard' : 'pointer'}
        >
          {children}
        </div>
      </MotionConfig>
    </MotionPreferences.Provider>
  );
}

export function useAppMotion() {
  const { instant, reduced } = useContext(MotionPreferences);
  return {
    instant,
    reduced,
    transition: (duration = motionTiming.surface, ease: keyof typeof motionEase = 'out') => ({
      duration: instant ? 0 : reduced ? motionTiming.reduced : duration,
      ease: motionEase[ease],
    }),
  };
}
