/* eslint-disable @next/next/no-img-element */
export function Avatar({ src, name, size = 48, className = "" }: { src?: string | null; name: string; size?: number; className?: string }) {
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return src ? (
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-full object-cover ring-1 ring-line ${className}`}
    />
  ) : (
    <div
      style={{ width: size, height: size, fontSize: size / 2.8 }}
      className={`flex shrink-0 items-center justify-center rounded-full bg-card font-serif text-gold ring-1 ring-line ${className}`}
    >
      {initials}
    </div>
  );
}
