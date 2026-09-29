import { useStore, type Tab } from '../state/store';
import styles from './Header.module.css';

const TABS: { id: Tab; label: string; ready: boolean }[] = [
  { id: 'spread', label: 'Spread', ready: true },
  { id: 'impact', label: 'Demographic impact', ready: false },
  { id: 'arrival', label: 'Arrival times', ready: false },
  { id: 'centrality', label: 'Network centrality', ready: false },
  { id: 'compare', label: 'Scenario comparison', ready: false },
];

export function Header() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  return (
    <header className={styles.header}>
      <div className={styles.title}>
        <h1>Antonine Plague Simulator</h1>
        <p>Epidemic spread across the ORBIS transport network</p>
      </div>
      <nav className={styles.tabs} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            disabled={!t.ready}
            className={`${styles.tab} ${tab === t.id ? styles.active : ''}`}
            onClick={() => setTab(t.id)}
            title={t.ready ? undefined : 'Coming soon'}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
