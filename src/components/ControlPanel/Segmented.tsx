import styles from './ControlPanel.module.css';

interface Option {
  id: string;
  label: string;
  title?: string;
}

/** Small segmented control (radio group). */
export function Segmented({
  value,
  options,
  onChange,
  large,
}: {
  value: string;
  options: Option[];
  onChange: (id: string) => void;
  large?: boolean;
}) {
  return (
    <div className={`${styles.segmented} ${large ? styles.large : ''}`} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          title={o.title}
          className={value === o.id ? styles.segOn : ''}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
