import React, { useId } from 'react';

export type DiceTokenSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type DiceTokenTone = 'gold' | 'dark';

interface DiceTokenIconProps {
  size?: DiceTokenSize;
  tone?: DiceTokenTone;
  className?: string;
  title?: string;
}

const SIZE_CLASSES: Record<DiceTokenSize, string> = {
  xs: 'h-3.5 w-3.5',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
  xl: 'h-8 w-8',
};

/**
 * Custom BetSpot dice-shaped game token coin icon.
 * Combines a minted metallic coin rim & thickness edge with a Daduketa die face.
 */
export const DiceTokenIcon: React.FC<DiceTokenIconProps> = ({
  size = 'sm',
  tone = 'gold',
  className = '',
  title,
}) => {
  const uid = useId();
  const faceGradId = `dtoken-face-${uid}`;
  const rimGradId = `dtoken-rim-${uid}`;
  const shineGradId = `dtoken-shine-${uid}`;

  const isDark = tone === 'dark';

  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
      className={`inline-block shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] ${SIZE_CLASSES[size]} ${className}`}
    >
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={faceGradId} x1="3" y1="3" x2="27" y2="27" gradientUnits="userSpaceOnUse">
          {isDark ? (
            <>
              <stop offset="0%" stopColor="#4A1D10" />
              <stop offset="55%" stopColor="#2A0E07" />
              <stop offset="100%" stopColor="#140503" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#FEF08A" />
              <stop offset="45%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#B45309" />
            </>
          )}
        </linearGradient>

        <linearGradient id={rimGradId} x1="3" y1="3" x2="29" y2="29" gradientUnits="userSpaceOnUse">
          {isDark ? (
            <>
              <stop offset="0%" stopColor="#FDE68A" />
              <stop offset="100%" stopColor="#92400E" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#FFFBEB" />
              <stop offset="55%" stopColor="#FCD34D" />
              <stop offset="100%" stopColor="#92400E" />
            </>
          )}
        </linearGradient>

        <linearGradient id={shineGradId} x1="4" y1="4" x2="18" y2="18" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity={isDark ? '0.22' : '0.45'} />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Extruded 3D coin thickness base */}
      <rect
        x="4.5"
        y="5"
        width="24"
        height="24"
        rx="6.5"
        fill={isDark ? '#120402' : '#78350F'}
        stroke={isDark ? '#451A03' : '#451A03'}
        strokeWidth="1"
      />

      {/* Primary dice-shaped token face */}
      <rect
        x="3"
        y="3"
        width="24"
        height="24"
        rx="6.5"
        fill={`url(#${faceGradId})`}
        stroke={`url(#${rimGradId})`}
        strokeWidth="1.8"
      />

      {/* Milled inner coin medallion groove */}
      <rect
        x="5.8"
        y="5.8"
        width="18.4"
        height="18.4"
        rx="4.4"
        stroke={isDark ? '#F59E0B' : '#78350F'}
        strokeOpacity={isDark ? '0.45' : '0.45'}
        strokeWidth="1"
        strokeDasharray="2.2 1.4"
      />

      {/* Specular diagonal coin glint */}
      <path
        d="M5.5 9.5C5.5 6.8 7 5.5 9.5 5.5H20C15 10.5 10.5 15 5.5 20V9.5Z"
        fill={`url(#${shineGradId})`}
      />

      {/* 4 corner die pips */}
      <circle cx="9.8" cy="9.8" r="1.85" fill={isDark ? '#FCD34D' : '#240905'} />
      <circle cx="20.2" cy="9.8" r="1.85" fill={isDark ? '#FCD34D' : '#240905'} />
      <circle cx="9.8" cy="20.2" r="1.85" fill={isDark ? '#FCD34D' : '#240905'} />
      <circle cx="20.2" cy="20.2" r="1.85" fill={isDark ? '#FCD34D' : '#240905'} />

      {/* Center jewel pip */}
      <circle cx="15" cy="15" r="2.35" fill={isDark ? '#F59E0B' : '#B91C1C'} />
      <circle cx="14.3" cy="14.3" r="0.7" fill="#FEF3C7" fillOpacity="0.85" />
    </svg>
  );
};
