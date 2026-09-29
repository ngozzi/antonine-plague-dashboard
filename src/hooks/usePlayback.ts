import { useEffect } from 'react';
import { PLAYBACK_DAYS_PER_SECOND } from '../lib/colors';
import { useStore } from '../state/store';

/** requestAnimationFrame loop advancing the simulated time while playing. */
export function usePlayback() {
  const playing = useStore((s) => s.playing);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); // clamp after tab switches
      last = now;
      const { t, speed, derived, setT, pause } = useStore.getState();
      if (!derived) return;
      const next = t + dt * PLAYBACK_DAYS_PER_SECOND * speed;
      if (next >= derived.tEnd) {
        setT(derived.tEnd);
        pause();
        return;
      }
      setT(next);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // Keyboard: space = play/pause, ←/→ = ±30 days, Home = restart
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const s = useStore.getState();
      if (e.code === 'Space') { e.preventDefault(); s.toggle(); }
      else if (e.code === 'ArrowRight') s.setT(s.t + 30);
      else if (e.code === 'ArrowLeft') s.setT(s.t - 30);
      else if (e.code === 'Home') s.restart();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
