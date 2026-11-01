import { useStore } from '../../state/store';
import { fmtPct } from '../../lib/format';
import styles from './About.module.css';

/** Plain-language description of the model and data. Parameters come from the data bundle. */
export function AboutView() {
  const catalog = useStore((s) => s.catalog)!;
  const network = useStore((s) => s.network)!;
  const setTab = useStore((s) => s.setTab);

  return (
    <div className={styles.page}>
      <article className={styles.article}>
        <h2>About this simulator</h2>
        <p className={styles.lead}>
          The Antonine Plague struck the Roman Empire from 165 CE, and the disease behind it is still debated. This
          simulator explores how each candidate pathogen would have spread across the empire, and which of them fits the
          timing of the epidemic in Rome.
        </p>

        <h3>How to use it</h3>
        <ul>
          <li>
            <button className={styles.link} onClick={() => setTab('spread')}>Spread</button>: replay one simulated
            epidemic on the map. Choose a pathogen and a run, press play, and click a place to trace how the epidemic
            reached it.
          </li>
          <li>
            <button className={styles.link} onClick={() => setTab('compare')}>Scenario comparison</button>: see when the
            epidemic peaks in Rome under each pathogen, and how the evidence between them changes with the date window.
          </li>
        </ul>

        <h3>The model</h3>
        <p>
          The epidemic is simulated as a stochastic SEIR process in {network.nodes.length} settlements linked by the
          roads, rivers and sea routes of the ORBIS network. People travel between settlements, and more of them travel
          between large, well-connected places. Every run starts at Nisibis on 1 January 165 CE. Births balance natural
          deaths, so population falls only through disease deaths, and there is no later demographic recovery.
        </p>

        <h3>Seasonal sea travel</h3>
        <p>
          Sea travel follows the sailing calendar: full from 15 May to 14 September, 60% in spring and autumn, and 20%
          from 15 November to 14 March. Coastal and open-sea routes are scaled alike; roads and rivers are not scaled.
          In addition, a small number of routes close completely in some months, following ORBIS. They are in the
          Atlantic and the western Mediterranean.
        </p>

        <h3>Selecting runs</h3>
        <p>
          For each pathogen, 100,000 simulations are drawn with different values of transmissibility (R₀), mobility (η)
          and distance friction (α). A run is accepted if the epidemic peaks in Rome between 26 October 166 and 28 February
          167, soon after the triumph of Lucius Verus on 12 October 166. Comparing how often each pathogen is accepted gives
          the evidence for it. Only accepted runs appear in the Spread tab.
        </p>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Pathogen</th><th>Latent period</th><th>Infectious period</th><th>Fatality rate</th><th>R₀ range</th><th>Accepted runs</th>
            </tr>
          </thead>
          <tbody>
            {catalog.pathogens.map((p) => (
              <tr key={p.tag}>
                <td>{p.label}</td>
                <td>{p.params.T_e} days</td>
                <td>{p.params.T_i} days</td>
                <td>{fmtPct(p.params.IFR)}</td>
                <td>{p.prior_ranges.R0[0]}–{p.prior_ranges.R0[1]}</td>
                <td>{p.n_runs.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>Keep in mind</h3>
        <ul>
          <li>These are model scenarios, not reconstructions. A single run is one possible epidemic, not what happened.</li>
          <li>Runs are selected on one date only, the peak in Rome. Other places and dates are not used for selection.</li>
          <li>The strength of the seasonal reduction is an assumption, and reading the ORBIS monthly field as route closures is our interpretation.</li>
          <li>Fatality rates and natural histories are fixed for each pathogen, using modern estimates.</li>
        </ul>

        <h3>Sources</h3>
        <ul className={styles.refs}>
          <li>Scheidel W., Meeks E. ORBIS: The Stanford Geospatial Network Model of the Roman World (route data).</li>
          <li>Tammuz O. (2005) Mare clausum? Sailing seasons in the Mediterranean in early antiquity. <i>Mediterranean Historical Review</i> 20(2):145–162.</li>
          <li>Duncan-Jones R.P. (2018) The Antonine plague revisited. <i>Arctos</i> 52:41–72.</li>
        </ul>
        <p className={styles.code}>
          Source code:{' '}
          <a href="https://github.com/ngozzi/antonine-plague-dashboard" target="_blank" rel="noreferrer">github.com/ngozzi/antonine-plague-dashboard</a>
        </p>
      </article>
    </div>
  );
}
