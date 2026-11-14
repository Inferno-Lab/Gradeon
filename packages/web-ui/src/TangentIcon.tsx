// The Tangent app icon (design/logo/tangent-app-icon.svg): the fingerprint G on its ink tile, for places that show Tangent itself.
const LINES = ['M51.42 17.89A24 24 0 1 0 56 32H35', 'M41.27 17.16A17.5 17.5 0 1 0 47.16 40.75', 'M33.91 21.17A11 11 0 1 0 38.31 41.01', 'M30.46 27.77A4.5 4.5 0 1 0 32.78 36.43'];

export function TangentIcon({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label="Tangent" style={{ display: 'block', flex: 'none' }}>
      <rect width="64" height="64" rx="14" fill="#0B3B36" />
      <g transform="translate(9.6 9.6) scale(.7)" fill="none" strokeWidth="5.2" strokeLinecap="round" strokeLinejoin="round">
        {LINES.map((d, i) => <path key={d} d={d} stroke={i === 2 ? '#5FE0C6' : '#EFF8F6'} />)}
      </g>
    </svg>
  );
}
