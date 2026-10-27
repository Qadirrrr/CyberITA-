const TONES = ['#22d3ee', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#38bdf8'];

export default function DonutChart({ segments = [], total, label = 'total', size = 148, thickness = 14 }) {
  const sum = segments.reduce((acc, segment) => acc + Number(segment.value || 0), 0);
  const safeTotal = Number(total ?? sum) || 0;
  const center = size / 2;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${safeTotal}`}>
        <circle cx={center} cy={center} r={radius} fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth={thickness} />
        {safeTotal > 0 &&
          segments.map((segment, index) => {
            const value = Number(segment.value || 0);
            if (value <= 0) return null;
            const length = (value / safeTotal) * circumference;
            const dashOffset = -offset;
            offset += length;
            return (
              <circle
                key={segment.label || index}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={segment.color || TONES[index % TONES.length]}
                strokeWidth={thickness}
                strokeDasharray={`${length} ${circumference}`}
                strokeDashoffset={dashOffset}
                transform={`rotate(-90 ${center} ${center})`}
                className="transition-all duration-500"
              >
                <title>{`${segment.label}: ${value}`}</title>
              </circle>
            );
          })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-display text-2xl font-semibold text-white tabular-nums">{safeTotal}</span>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      </div>
    </div>
  );
}
