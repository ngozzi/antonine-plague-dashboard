import { useMemo, useState } from 'react';
import { useStore } from '../../state/store';
import { evidence, type Evidence } from '../../lib/abc';
import { formatDate } from '../../lib/calendar';
import { PeakDensity, type DensityMode } from './PeakDensity';
import { BayesFactors, Posterior, UPPER_BOUNDS } from './Panels';
import { ORDER } from './palette';
import styles from './Compare.module.css';

/**
 * Scenario comparison: which pathogen best explains an epidemic peaking in
 * Rome in late 166 CE? Reproduces the ABC model selection of
 * final_paper/plot1/plot_peak_density.ipynb, with an interactive window.
 */
export function ComparisonView() {
  const data = useStore((s) => s.comparison);
  const error = useStore((s) => s.comparisonError);
  const win = useStore((s) => s.window);
  const setWindow = useStore((s) => s.setWindow);
  const [mode, setMode] = useState<DensityMode>('all');

  const pathogens = useMemo(
    () => (data ? [...data.pathogens].sort((a, b) => ORDER.indexOf(a.tag) - ORDER.indexOf(b.tag)) : []),
    [data],
  );
  const ev = useMemo(() => {
    const out: Record<string, Evidence> = {};
    for (const p of pathogens) out[p.tag] = evidence(p, win[0], win[1]);
    return out;
  }, [pathogens, win]);

  if (error) return <div className={styles.center}>Could not load comparison data: {error}</div>;
  if (!data) return <div className={styles.center}>Loading prior draws…</div>;

  const parade = data.parade_day;
  const lowers = [1, 2, 3, 4, 5, 6].map((wk) => parade + 7 * wk);

  return (
    <div className={styles.view}>
      <div className={styles.controls}>
        <div className={styles.ctrl}>
          <span className="eyebrow">Window start</span>
          <div className={styles.chips}>
            {lowers.map((d, i) => (
              <button key={d} className={win[0] === d ? styles.chipOn : ''} onClick={() => setWindow([d, win[1]])} title={formatDate(d)}>
                +{i + 1} wk
              </button>
            ))}
          </div>
        </div>
        <div className={styles.ctrl}>
          <span className="eyebrow">Window end</span>
          <div className={styles.chips}>
            {UPPER_BOUNDS.map(([d, l]) => (
              <button key={d} className={win[1] === d ? styles.chipOn : ''} onClick={() => setWindow([win[0], d])}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.ctrl}>
          <span className="eyebrow">Density scale</span>
          <div className={styles.chips}>
            <button className={mode === 'all' ? styles.chipOn : ''} onClick={() => setMode('all')} title="Area = share of ALL prior draws (proportional to the evidence)">
              All prior draws
            </button>
            <button className={mode === 'reached' ? styles.chipOn : ''} onClick={() => setMode('reached')} title="Density among draws whose epidemic reaches Rome (as in the paper figure)">
              Draws reaching Rome
            </button>
          </div>
        </div>
        <div className={styles.info} tabIndex={0} aria-describedby="method-tip">
          <span className={styles.infoIcon} aria-hidden>i</span> Method
          <div id="method-tip" role="tooltip" className={styles.infoTip}>
            <p>
              ABC rejection over {pathogens.map((p) => p.n_total.toLocaleString()).join(' / ')} prior draws of (R₀, mobility, friction). A draw is
              accepted when its epidemic peaks in Rome inside the window.
            </p>
            <p>
              Evidence = accepted / all draws; BF = ratio of evidences, 95% CI from binomial Monte Carlo error on log BF. Posterior with equal
              prior odds on the three pathogens.
            </p>          </div>
        </div>
        <div className={styles.winReadout}>
          <span className="eyebrow">Acceptance window</span>
          <b className="num">
            {formatDate(win[0], false)} – {formatDate(win[1], false)}
          </b>
          <span className={`${styles.muted} num`}>
            {win[1] - win[0] + 1} days · starts {Math.abs(Math.round(((win[0] - parade) / 7) * 10) / 10)} wk {win[0] >= parade ? 'after' : 'before'} the parade
          </span>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.density}>
          <PeakDensity pathogens={pathogens} evidence={ev} window={win} parade={parade} mode={mode} onWindow={setWindow} />
        </div>
        <div className={styles.side}>
          <Posterior pathogens={pathogens} evidence={ev} />
          <BayesFactors pathogens={pathogens} evidence={ev} />
        </div>
      </div>
    </div>
  );
}
