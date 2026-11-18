/** `↑ 13` in --up or `↓ 7` in --down, with a spoken label. */
export default function Delta({ value, versus }: { value: number; versus: string }) {
  if (value === 0) {
    return <span className="text-display-m text-muted">±0</span>;
  }
  const up = value > 0;
  return (
    <span
      className={`text-display-m font-medium ${up ? "text-up" : "text-down"}`}
      role="img"
      aria-label={`${up ? "up" : "down"} ${Math.abs(value)} from ${versus}`}
    >
      {up ? "↑" : "↓"} {Math.abs(value)}
    </span>
  );
}
