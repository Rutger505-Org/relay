/**
 * Round avatar showing the first letter of a handle on a colour deterministically
 * derived from that handle — so each friend gets a stable, distinct colour
 * without needing uploaded images.
 */
const COLORS = [
  "bg-rose-500",
  "bg-pink-500",
  "bg-fuchsia-500",
  "bg-purple-500",
  "bg-indigo-500",
  "bg-blue-500",
  "bg-sky-500",
  "bg-teal-500",
  "bg-emerald-500",
  "bg-green-500",
  "bg-amber-500",
  "bg-orange-500",
];

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

const SIZES = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-20 w-20 text-2xl",
} as const;

export function Avatar({
  handle,
  size = "md",
  online,
}: {
  handle: string;
  size?: keyof typeof SIZES;
  online?: boolean;
}) {
  const letter = (handle[0] ?? "?").toUpperCase();
  return (
    <span className="relative inline-flex shrink-0">
      <span
        className={`inline-flex items-center justify-center rounded-full font-semibold text-white ${SIZES[size]} ${colorFor(
          handle,
        )}`}
      >
        {letter}
      </span>
      {online !== undefined && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#2b2d31] ${
            online ? "bg-emerald-500" : "bg-zinc-500"
          }`}
          title={online ? "Online" : "Offline"}
        />
      )}
    </span>
  );
}
