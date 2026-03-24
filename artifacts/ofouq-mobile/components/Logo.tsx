import React from "react";
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

interface LogoProps {
  size?: number;
  showText?: boolean;
}

export function Logo({ size = 48, showText = false }: LogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#1E40AF" />
          <Stop offset="1" stopColor="#1D4ED8" />
        </LinearGradient>
        <LinearGradient id="sunGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FCD34D" />
          <Stop offset="1" stopColor="#F59E0B" />
        </LinearGradient>
        <LinearGradient id="horizonGrad" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#3B82F6" />
          <Stop offset="0.5" stopColor="#1D4ED8" />
          <Stop offset="1" stopColor="#1E40AF" />
        </LinearGradient>
      </Defs>

      <Rect x="0" y="0" width="100" height="100" rx="22" fill="url(#skyGrad)" />

      <Circle cx="50" cy="48" r="16" fill="url(#sunGrad)" opacity="0.95" />

      <Path
        d="M10 62 Q25 50 50 48 Q75 50 90 62"
        stroke="#60A5FA"
        strokeWidth="2.5"
        fill="none"
        opacity="0.7"
      />

      <Path
        d="M18 70 Q34 56 50 48 Q66 56 82 70"
        stroke="#93C5FD"
        strokeWidth="2"
        fill="none"
        opacity="0.5"
      />

      <Path
        d="M10 78 Q30 60 50 48 Q70 60 90 78 L90 90 L10 90 Z"
        fill="#1E3A8A"
        opacity="0.5"
      />

      <Path
        d="M33 47 Q36 42 40 44"
        stroke="#FCD34D"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        opacity="0.8"
      />
      <Path
        d="M60 44 Q64 42 67 47"
        stroke="#FCD34D"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        opacity="0.8"
      />
      <Path
        d="M44 36 Q46 30 50 32 Q54 30 56 36"
        stroke="#FCD34D"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        opacity="0.8"
      />
    </Svg>
  );
}
