import * as Slider from '@radix-ui/react-slider';
import { useStore } from '../state/store';
import { formatDate, formatDuration, yearStart } from '../lib/calendar';
import styles from './TimelineBar.module.css';

const SPEEDS = [0.5, 1, 2, 4];

export function TimelineBar() {
  const derived = useStore((s) => s.derived);
  const t = useStore((s) => s.t);
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.speed);
  const { toggle, restart, setT, pause, setSpeed } = useStore.getState();

  const tEnd = derived?.tEnd ?? 1;
  const pct = (d: number) => `${(d / tEnd) * 100}%`;
  const years: number[] = [];
  for (let y = 165; yearStart(y) <= tEnd; y++) years.push(y);

  return (
    <div className={styles.bar}>
      <div className={styles.buttons}>
        <button className={styles.play} onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} disabled={!derived}>
          {playing ? (
            <svg width="16" height="16" viewBox="0 0 16 16"><rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16"><path d="M4 2.2v11.6a.6.6 0 0 0 .9.5l9.2-5.8a.6.6 0 0 0 0-1L4.9 1.7a.6.6 0 0 0-.9.5z" fill="currentColor" /></svg>
          )}
        </button>
        <button className={styles.icon} onClick={restart} aria-label="Restart" title="Restart (Home)">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M3 8a5 5 0 1 0 1.6-3.7" />
            <path d="M3 2.5v2.8h2.8" />
          </svg>
        </button>
      </div>

      <div className={styles.clock}>
        <div className={`${styles.date} num`}>{formatDate(t)}</div>
        <div className={`${styles.elapsed} num`}>
          Day {Math.floor(t - (derived?.tStart ?? 0))} · {formatDuration(Math.max(0, t - (derived?.tStart ?? 0)))} since outbreak
        </div>
      </div>

      <div className={styles.track}>
        <Slider.Root
          className={styles.sliderRoot}
          min={0}
          max={tEnd}
          step={1}
          value={[t]}
          onValueChange={([v]) => { pause(); setT(v); }}
          aria-label="Simulated time"
        >
          <Slider.Track className={styles.sliderTrack}>
            <Slider.Range className={styles.sliderRange} />
          </Slider.Track>
          <Slider.Thumb className={styles.sliderThumb} />
        </Slider.Root>
        <div className={styles.ticks}>
          {years.map((y) => (
            <span key={y} className={styles.tick} style={{ left: pct(yearStart(y)) }}>
              {y}
            </span>
          ))}
          {derived?.tRome != null && (
            <span className={styles.rome} style={{ left: pct(derived.tRome) }} title={`Reaches Rome ${formatDate(derived.tRome)}`}>
              Rome
            </span>
          )}
        </div>
      </div>

      <div className={styles.speed} role="radiogroup" aria-label="Playback speed">
        {SPEEDS.map((s) => (
          <button key={s} role="radio" aria-checked={speed === s} className={speed === s ? styles.on : ''} onClick={() => setSpeed(s)}>
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}
