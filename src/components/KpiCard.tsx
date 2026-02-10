import './styles.css';

interface Props {
  label: string;
  value: string;
  tone?: 'good' | 'warn' | 'bad' | 'neutral';
}

export function KpiCard({ label, value, tone = 'neutral' }: Props) {
  return (
    <div className={`card kpi tone-${tone}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}
