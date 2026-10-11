// Sevendipity mark ("connected seven"): two people joined through a gold connector, drawn as a 7.

type Props = {
  size?: number;
  /** Line and dot color. Use the night text color on the dark big screen. */
  ink?: string;
  wordmark?: boolean;
  className?: string;
};

export function LogoMark({ size = 28, ink = "#15171C" }: Pick<Props, "size" | "ink">) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <path d="M22 28 H78 L44 84" fill="none" stroke={ink} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="22" cy="28" r="14" fill={ink} />
      <circle cx="78" cy="28" r="14" fill="#F0B23E" />
      <circle cx="44" cy="84" r="14" fill={ink} />
    </svg>
  );
}

export function Logo({ size = 28, ink = "#15171C", wordmark = true, className = "" }: Props) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} ink={ink} />
      {wordmark && (
        <span className="font-display text-xl font-bold tracking-tight" style={{ color: ink }}>
          Sevendipity
        </span>
      )}
    </span>
  );
}
