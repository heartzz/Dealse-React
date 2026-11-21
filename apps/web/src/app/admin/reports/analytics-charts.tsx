import type { ReactNode } from "react";
import type { SeriesPoint } from "./report-types";

const colors = ["#087f83", "#ec9c43", "#7868ce", "#d76f68"];
const dateLabel = (key: string, bucket: string) => {
  const date = new Date(`${key}T12:00:00+05:30`);
  return new Intl.DateTimeFormat("en-IN", bucket === "month" ? { month: "short", year: "2-digit", timeZone: "Asia/Kolkata" } : { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(date);
};

export function TrendChart({ title, points, series, bucket, kind = "line" }: { title: string; points: SeriesPoint[]; series: Array<{ key: keyof SeriesPoint; label: string }>; bucket: string; kind?: "line" | "bar" }) {
  if (!points.length) return <ChartCard title={title}><p className="admin-empty">No activity was recorded in this period.</p></ChartCard>;
  const width = 720, height = 210, left = 38, top = 12, chartWidth = width - left - 10, chartHeight = height - top - 32;
  const max = Math.max(1, ...points.flatMap((point) => series.map(({ key }) => Number(point[key] ?? 0))));
  const x = (index: number) => left + (points.length < 2 ? chartWidth / 2 : index * chartWidth / (points.length - 1));
  const y = (value: number) => top + chartHeight - value / max * chartHeight;
  const step = chartWidth / Math.max(1, points.length - 1);
  return <ChartCard title={title}>
    <div className="analytics-chart-scroll"><svg className="analytics-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} chart`}>
      <title>{title}</title>
      {[0, .5, 1].map((fraction) => <g key={fraction}><line x1={left} x2={width - 8} y1={top + chartHeight * fraction} y2={top + chartHeight * fraction} className="analytics-gridline" /><text x={left - 8} y={top + chartHeight * fraction + 4} textAnchor="end" className="analytics-axis-label">{Math.round(max * (1 - fraction))}</text></g>)}
      {series.map(({ key, label }, seriesIndex) => {
        const values = points.map((point) => Number(point[key] ?? 0));
        if (kind === "bar") {
          const barWidth = Math.max(2, step / (series.length + 1));
          return <g key={String(key)} fill={colors[seriesIndex]}>{values.map((value, index) => <rect key={`${String(key)}-${index}`} x={x(index) - (series.length * barWidth) / 2 + seriesIndex * barWidth} y={y(value)} width={barWidth - 2} height={Math.max(0, top + chartHeight - y(value))} rx="2"><title>{`${dateLabel(points[index].bucket, bucket)} · ${label}: ${value}`}</title></rect>)}</g>;
        }
        const path = values.map((value, index) => `${index ? "L" : "M"}${x(index)},${y(value)}`).join(" ");
        return <g key={String(key)}><path d={path} fill="none" stroke={colors[seriesIndex]} strokeWidth="2.5" strokeLinejoin="round" />{values.map((value, index) => <circle key={`${String(key)}-${index}`} cx={x(index)} cy={y(value)} r="3.5" fill={colors[seriesIndex]}><title>{`${dateLabel(points[index].bucket, bucket)} · ${label}: ${value}`}</title></circle>)}</g>;
      })}
      {points.map((point, index) => (index === 0 || index === points.length - 1 || index % Math.ceil(points.length / 5) === 0) ? <text key={point.bucket} x={x(index)} y={height - 6} textAnchor="middle" className="analytics-axis-label">{dateLabel(point.bucket, bucket)}</text> : null)}
    </svg></div>
    <div className="analytics-legend">{series.map(({ key, label }, index) => <span key={String(key)}><i style={{ background: colors[index] }} />{label}</span>)}</div>
  </ChartCard>;
}

export function StatusDonut({ title, values }: { title: string; values: Array<{ label: string; value: number }> }) {
  const total = values.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;
  return <ChartCard title={title}>{total ? <div className="analytics-donut-layout"><svg viewBox="0 0 120 120" role="img" aria-label={`${title}, ${total} total`}><circle cx="60" cy="60" r="44" fill="none" stroke="#edf1f2" strokeWidth="16" />{values.map((item, index) => { const fraction = item.value / total; const node = <circle key={item.label} cx="60" cy="60" r="44" fill="none" stroke={colors[index]} strokeWidth="16" strokeDasharray={`${fraction * 276.46} ${276.46 - fraction * 276.46}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)"><title>{`${item.label}: ${item.value}`}</title></circle>; offset += fraction * 276.46; return node; })}<text x="60" y="57" textAnchor="middle" className="analytics-donut-total">{total}</text><text x="60" y="73" textAnchor="middle" className="analytics-donut-caption">claims</text></svg><div className="analytics-legend analytics-legend--vertical">{values.map((item, index) => <span key={item.label}><i style={{ background: colors[index] }} />{item.label}<strong>{item.value}</strong></span>)}</div></div> : <p className="admin-empty">No claims were issued in this period.</p>}</ChartCard>;
}

export function ChartCard({ title, children }: { title: string; children: ReactNode }) { return <section className="analytics-card"><h2>{title}</h2>{children}</section>; }
