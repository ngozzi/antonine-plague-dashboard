import { useStore } from '../../state/store';
import styles from './MapView.module.css';

const Dot = ({ fill, ring }: { fill: string; ring?: string }) => (
  <svg width="14" height="14" viewBox="0 0 14 14">
    {ring && <circle cx="7" cy="7" r="6" fill="none" stroke={ring} strokeWidth="1.2" />}
    <circle cx="7" cy="7" r="3.5" fill={fill} />
  </svg>
);

const Line = ({ color, dash, width = 1.4 }: { color: string; dash?: string; width?: number }) => (
  <svg width="22" height="10" viewBox="0 0 22 10">
    <line x1="1" y1="5" x2="21" y2="5" stroke={color} strokeWidth={width} strokeDasharray={dash} />
  </svg>
);

export function MapLegend() {
  const selected = useStore((s) => s.selected);
  return (
    <div className={styles.legend} aria-label="Legend">
      <span className={styles.legendItem}><Dot fill="#68788c" /> Not yet invaded</span>
      <span className={styles.legendItem}><Line color="#788696" /> Road</span>
      <span className={styles.legendItem}><Dot fill="#b22222" ring="#b22222" /> Newly invaded</span>
      <span className={styles.legendItem}><Line color="#6888a8" dash="4 3" /> Sea route</span>
      <span className={styles.legendItem}><Dot fill="#80161a" /> Invaded</span>
      <span className={styles.legendItem}><Line color="#608ea0" width={1.8} /> River</span>
      <span className={styles.legendItem}><Dot fill="#d4911e" ring="#d4911e" /> Outbreak source</span>
      <span className={styles.legendItem}><Line color="#b22222" width={2} /> Transmission</span>
      {selected === null ? (
        <span className={styles.legendHint}>Click a place to trace its invasion path</span>
      ) : (
        <>
          <span className={styles.legendItem}><Line color="#80161a" width={3} /> Path taken</span>
          <span className={styles.legendItem}><Line color="#1a1a1a" dash="3 3" width={1.8} /> Path still ahead</span>
        </>
      )}
    </div>
  );
}
