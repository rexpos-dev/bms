import { motion, useReducedMotion } from 'framer-motion';
interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

interface SimpleBarChartProps {
  data: ChartDataPoint[];
  height?: number;
}

const CHART_COLORS = [
  '#6366f1',
  '#22d3ee',
  '#4ade80',
  '#f59e0b',
  '#f87171',
  '#a78bfa',
  '#34d399',
  '#fb923c',
];

export function SimpleBarChart({ data, height = 300 }: SimpleBarChartProps) {
  const reduce = useReducedMotion();
  if (data.length === 0)
    return (
      <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem', fontSize: '0.9rem' }}>
        No data available
      </div>
    );

  const maxValue = Math.max(...data.map((d) => d.value));
  const paddingLeft = 48;
  const paddingRight = 24;
  const paddingTop = 24;
  const paddingBottom = 48;
  const svgWidth = Math.max(420, data.length * 72);
  const chartH = height - paddingTop - paddingBottom;
  const chartW = svgWidth - paddingLeft - paddingRight;
  const barWidth = Math.min(48, chartW / data.length - 12);
  const barGap = chartW / data.length;

  const gridLines = 4;
  const gradientId = (i: number) => `barGrad${i}`;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${svgWidth} ${height}`}
      style={{ maxHeight: height, overflow: 'visible' }}
    >
      <defs>
        {data.map((d, i) => {
          const color = d.color ?? CHART_COLORS[i % CHART_COLORS.length];
          return (
            <linearGradient key={i} id={gradientId(i)} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="1" />
              <stop offset="100%" stopColor={color} stopOpacity="0.35" />
            </linearGradient>
          );
        })}
      </defs>

      {/* Grid lines */}
      {Array.from({ length: gridLines + 1 }, (_, gi) => {
        const y = paddingTop + (chartH / gridLines) * gi;
        const val = Math.round((maxValue / gridLines) * (gridLines - gi));
        return (
          <g key={gi}>
            <line
              x1={paddingLeft}
              y1={y}
              x2={svgWidth - paddingRight}
              y2={y}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray={gi === gridLines ? '0' : '4 4'}
            />
            <text
              x={paddingLeft - 8}
              y={y + 4}
              textAnchor="end"
              fontSize="10"
              fill="var(--text-muted)"
              fontFamily="inherit"
            >
              {gi < gridLines ? val : '0'}
            </text>
          </g>
        );
      })}

      {/* Bars */}
      {data.map((d, i) => {
        const barH = maxValue === 0 ? 0 : (d.value / maxValue) * chartH;
        const x = paddingLeft + i * barGap + (barGap - barWidth) / 2;
        const y = paddingTop + chartH - barH;

        return (
          <g key={i}>
            <motion.rect
              x={x}
              width={barWidth}
              fill={`url(#${gradientId(i)})`}
              rx={5}
              ry={5}
              initial={reduce ? false : { y: paddingTop + chartH, height: 0 }}
              animate={{ y, height: barH }}
              transition={{ duration: 0.6, delay: i * 0.06, ease: [0.22, 0.61, 0.36, 1] }}
            />
            {/* value label above bar */}
            {d.value > 0 && (
              <text
                x={x + barWidth / 2}
                y={y - 7}
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fill="var(--text)"
                fontFamily="inherit"
              >
                {d.value}
              </text>
            )}
            {/* x-axis label */}
            <text
              x={x + barWidth / 2}
              y={paddingTop + chartH + 20}
              textAnchor="middle"
              fontSize="11"
              fill="var(--text-muted)"
              fontFamily="inherit"
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Donut / Pie chart ── */
interface SimplePieChartProps {
  data: ChartDataPoint[];
  size?: number;
}

export function SimplePieChart({ data, size = 220 }: SimplePieChartProps) {
  const reduce = useReducedMotion();
  if (data.length === 0)
    return (
      <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem', fontSize: '0.9rem' }}>
        No data available
      </div>
    );

  const total = data.reduce((sum, d) => sum + d.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 10;
  const innerR = outerR * 0.55;

  let currentAngle = -Math.PI / 2;

  const slices = data.map((d, i) => {
    // Cap just below a full turn: a 360° arc has identical start/end points
    // and renders as an empty path (e.g. a single status holding 100%).
    const sliceAngle = Math.min((d.value / total) * Math.PI * 2, Math.PI * 2 - 0.001);
    const startAngle = currentAngle;
    const endAngle = currentAngle + sliceAngle;
    currentAngle = endAngle;

    const x1 = cx + outerR * Math.cos(startAngle);
    const y1 = cy + outerR * Math.sin(startAngle);
    const x2 = cx + outerR * Math.cos(endAngle);
    const y2 = cy + outerR * Math.sin(endAngle);
    const ix1 = cx + innerR * Math.cos(endAngle);
    const iy1 = cy + innerR * Math.sin(endAngle);
    const ix2 = cx + innerR * Math.cos(startAngle);
    const iy2 = cy + innerR * Math.sin(startAngle);

    const largeArc = sliceAngle > Math.PI ? 1 : 0;

    const path = [
      `M ${x1} ${y1}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${ix1} ${iy1}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2}`,
      'Z',
    ].join(' ');

    return {
      path,
      color: d.color ?? CHART_COLORS[i % CHART_COLORS.length],
      label: d.label,
      value: d.value,
      pct: Math.round((d.value / total) * 100),
    };
  });

  return (
    <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', maxWidth: size, height: 'auto', flexShrink: 1 }}>
        <defs>
          {slices.map((_s, i) => (
            <filter key={i} id={`glow${i}`}>
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}
        </defs>

        {slices.map((s, i) => (
          <motion.path
            key={i}
            d={s.path}
            fill={s.color}
            stroke="var(--surface)"
            strokeWidth={2}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 0.9 }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.09, ease: 'easeOut' }}
          />
        ))}

        {/* Center label */}
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          fontSize="20"
          fontWeight="800"
          fill="var(--text)"
          fontFamily="inherit"
        >
          {total}
        </text>
        <text
          x={cx}
          y={cy + 10}
          textAnchor="middle"
          fontSize="10"
          fill="var(--text-muted)"
          fontFamily="inherit"
          textDecoration="none"
          letterSpacing="0.06em"
          style={{ textTransform: 'uppercase' }}
        >
          TOTAL
        </text>
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {slices.map((s, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              fontSize: '0.85rem',
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: s.color,
                flexShrink: 0,
                boxShadow: `0 0 6px ${s.color}88`,
              }}
            />
            <span style={{ color: 'var(--text-muted)', minWidth: 0 }}>
              {s.label}
            </span>
            <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--text)', paddingLeft: '0.75rem' }}>
              {s.value}
              <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.78rem', marginLeft: '0.25rem' }}>
                ({s.pct}%)
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
