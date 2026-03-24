interface LogoProps {
  size?: number;
  showText?: boolean;
  className?: string;
  variant?: "full" | "icon";
}

export function Logo({ size = 40, showText = true, className = "", variant = "full" }: LogoProps) {
  const iconSize = variant === "icon" ? size : size;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* SVG Icon */}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 80 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
      >
        {/* Background rounded square */}
        <rect width="80" height="80" rx="20" fill="url(#logoGrad)" />

        {/* Horizon line */}
        <line x1="12" y1="52" x2="68" y2="52" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.5" />

        {/* Rising sun arc */}
        <path
          d="M 40 52 A 18 18 0 0 1 22 52"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          strokeOpacity="0.7"
        />
        <path
          d="M 40 52 A 18 18 0 0 0 58 52"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          strokeOpacity="0.7"
        />

        {/* Central bright circle (sun) */}
        <circle cx="40" cy="38" r="9" fill="white" fillOpacity="0.95" />

        {/* Star rays around the sun */}
        <line x1="40" y1="24" x2="40" y2="20" stroke="white" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.8" />
        <line x1="51.5" y1="27.5" x2="54.2" y2="24.8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.6" />
        <line x1="28.5" y1="27.5" x2="25.8" y2="24.8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.6" />
        <line x1="55" y1="38" x2="59" y2="38" stroke="white" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.5" />
        <line x1="25" y1="38" x2="21" y2="38" stroke="white" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.5" />

        {/* Inner dot */}
        <circle cx="40" cy="38" r="4" fill="url(#logoGrad)" />

        <defs>
          <linearGradient id="logoGrad" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#1D4ED8" />
          </linearGradient>
        </defs>
      </svg>

      {/* Brand text */}
      {showText && variant !== "icon" && (
        <div className="leading-tight">
          <p
            style={{
              fontFamily: "'Tajawal', sans-serif",
              fontWeight: 900,
              fontSize: `${iconSize * 0.475}px`,
              color: "inherit",
              lineHeight: 1.1,
            }}
          >
            أفق التفوق
          </p>
          <p
            style={{
              fontFamily: "'Cairo', sans-serif",
              fontWeight: 500,
              fontSize: `${iconSize * 0.26}px`,
              opacity: 0.55,
              lineHeight: 1.3,
            }}
          >
            منصة التعليم المتميز
          </p>
        </div>
      )}
    </div>
  );
}
