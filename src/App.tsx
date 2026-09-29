import { useEffect } from 'react';
import { useStore } from './state/store';
import { usePlayback } from './hooks/usePlayback';
import { Header } from './components/Header';
import { ControlPanel } from './components/ControlPanel/ControlPanel';
import { SummaryBar } from './components/SummaryBar';
import { MapView } from './components/MapView/MapView';
import { TimelineBar } from './components/TimelineBar';
import { Charts } from './components/charts/Charts';
import { ComparisonView } from './components/compare/ComparisonView';
import { dataSource } from './data';
import styles from './App.module.css';

export function App() {
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const tab = useStore((s) => s.tab);
  usePlayback();

  useEffect(() => {
    useStore.getState().init();
  }, []);

  return (
    <div className={styles.app}>
      <Header />
      {status === 'loading' && <div className={styles.center}>Loading the ORBIS network…</div>}
      {status === 'error' && (
        <div className={styles.center}>
          <div>
            <strong>Could not load data</strong>
            <p>{error}</p>
            <p className={styles.muted}>Source: {dataSource.name}. Try <code>npm run data</code>, or open with <code>?mock=1</code>.</p>
          </div>
        </div>
      )}
      {status === 'ready' && tab === 'compare' && <ComparisonView />}
      {status === 'ready' && tab !== 'compare' && (
        <div className={styles.body}>
          <ControlPanel />
          <main className={styles.main}>
            <SummaryBar />
            <MapView />
            <TimelineBar />
            <section className={styles.charts}>
              <Charts />
            </section>
          </main>
        </div>
      )}
    </div>
  );
}
