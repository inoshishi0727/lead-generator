const COLORS = [
  "oklch(0.55 0.13 25)",
  "oklch(0.5 0.13 290)",
  "oklch(0.5 0.13 165)",
  "oklch(0.5 0.13 60)",
  "oklch(0.5 0.13 220)",
];

function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return COLORS[h % COLORS.length];
}

function initials(name: string) {
  return name
    .split(/[\s._]+/)
    .map((p) => p[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function PersonAvatar({
  name,
  color,
  size = 22,
}: {
  name: string;
  color?: string;
  size?: number;
}) {
  return (
    <div
      className="sp-avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: color ?? colorFor(name),
      }}
    >
      {initials(name)}
    </div>
  );
}
