import logoSrc from "@/assets/logo.png";

interface LogoProps {
  /** Rendered height in px; width scales with the logo's aspect ratio. */
  size?: number;
  /** Kept for API compatibility — the wordmark already includes the brand text. */
  showText?: boolean;
  className?: string;
  variant?: "full" | "icon";
}

export function Logo({ size = 40, className = "" }: LogoProps) {
  return (
    <div className={`flex items-center ${className}`}>
      <img
        src={logoSrc}
        alt="التفوق"
        draggable={false}
        style={{ height: size, width: "auto", flexShrink: 0, objectFit: "contain" }}
      />
    </div>
  );
}
