import React, { useId } from 'react';

interface BetSpotBrandProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const BetSpotBrand: React.FC<BetSpotBrandProps> = ({ size = 'md', className = '' }) => {
  const uid = useId();
  const topGradId = `bs-top-${uid}`;
  const leftGradId = `bs-left-${uid}`;
  const rightGradId = `bs-right-${uid}`;

  const dimensions =
    size === 'sm'
      ? { box: 'h-7 w-7 rounded-md', svg: 'h-5 w-5', text: 'text-sm' }
      : size === 'lg'
        ? { box: 'h-11 w-11 rounded-xl', svg: 'h-8 w-8', text: 'text-2xl' }
        : { box: 'h-9 w-9 rounded-lg', svg: 'h-6 w-6', text: 'text-xl' };

  return (
    <span className={`inline-flex items-center gap-2.5 select-none whitespace-nowrap ${className}`}>
      <span
        className={`relative inline-flex items-center justify-center shrink-0 border border-amber-400/50 bg-gradient-to-br from-[#4D1D10] via-[#2B0E08] to-[#140503] shadow-[0_2px_12px_rgba(245,158,11,0.32)] ${dimensions.box}`}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`${dimensions.svg} drop-shadow-[0_2px_4px_rgba(0,0,0,0.65)]`}
        >
          <defs>
            <linearGradient id={topGradId} x1="8" y1="4" x2="28" y2="17" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FEF3C7" />
              <stop offset="55%" stopColor="#FCD34D" />
              <stop offset="100%" stopColor="#F59E0B" />
            </linearGradient>
            <linearGradient id={leftGradId} x1="5" y1="11" x2="18" y2="32" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#B45309" />
            </linearGradient>
            <linearGradient id={rightGradId} x1="18" y1="17" x2="31" y2="31" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#B45309" />
              <stop offset="100%" stopColor="#78350F" />
            </linearGradient>
          </defs>

          {/* Subtle ambient base shadow under the 3D die */}
          <ellipse cx="18" cy="32.2" rx="10" ry="2" fill="#000000" fillOpacity="0.45" />

          {/* 3D Isometric Cube Faces */}
          {/* Top Face */}
          <path
            d="M18 3.6L30.2 10.6C30.8 10.95 30.8 11.45 30.2 11.8L18 18.8L5.8 11.8C5.2 11.45 5.2 10.95 5.8 10.6L18 3.6Z"
            fill={`url(#${topGradId})`}
          />
          {/* Left Face */}
          <path
            d="M5.4 11.4L18 18.7V32.4L6.3 25.7C5.7 25.35 5.4 24.8 5.4 24.1V11.4Z"
            fill={`url(#${leftGradId})`}
          />
          {/* Right Face */}
          <path
            d="M30.6 11.4V24.1C30.6 24.8 30.3 25.35 29.7 25.7L18 32.4V18.7L30.6 11.4Z"
            fill={`url(#${rightGradId})`}
          />

          {/* Outer 3D cube contour */}
          <path
            d="M18 3.6L29.8 10.4C30.35 10.72 30.6 11.2 30.6 11.85V24.1C30.6 24.75 30.35 25.25 29.8 25.58L18 32.4L6.2 25.58C5.65 25.25 5.4 24.75 5.4 24.1V11.85C5.4 11.2 5.65 10.72 6.2 10.4L18 3.6Z"
            stroke="#FDE68A"
            strokeOpacity="0.8"
            strokeWidth="1.15"
            strokeLinejoin="round"
          />

          {/* Crisp specular inner edge ridges */}
          <path
            d="M6.2 11.6L18 18.5L29.8 11.6M18 18.5V31.6"
            stroke="#FEF3C7"
            strokeOpacity="0.65"
            strokeWidth="1.05"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Top Face Pips (3) */}
          <ellipse cx="18" cy="7.5" rx="1.7" ry="1.02" fill="#240905" />
          <ellipse cx="13.5" cy="11.2" rx="1.7" ry="1.02" fill="#240905" />
          <ellipse cx="22.5" cy="11.2" rx="1.7" ry="1.02" fill="#240905" />

          {/* Left Face Pips (5 with crimson center) */}
          <ellipse cx="8.9" cy="16.5" rx="1.15" ry="1.5" transform="rotate(-24 8.9 16.5)" fill="#1F0905" />
          <ellipse cx="14.5" cy="19.7" rx="1.15" ry="1.5" transform="rotate(-24 14.5 19.7)" fill="#1F0905" />
          <ellipse cx="11.7" cy="21.9" rx="1.3" ry="1.65" transform="rotate(-24 11.7 21.9)" fill="#B91C1C" />
          <ellipse cx="8.9" cy="23.9" rx="1.15" ry="1.5" transform="rotate(-24 8.9 23.9)" fill="#1F0905" />
          <ellipse cx="14.5" cy="27.1" rx="1.15" ry="1.5" transform="rotate(-24 14.5 27.1)" fill="#1F0905" />

          {/* Right Face Pips (2) */}
          <ellipse cx="22.2" cy="20.4" rx="1.15" ry="1.5" transform="rotate(24 22.2 20.4)" fill="#FEF3C7" fillOpacity="0.9" />
          <ellipse cx="26.4" cy="24.9" rx="1.15" ry="1.5" transform="rotate(24 26.4 24.9)" fill="#FEF3C7" fillOpacity="0.9" />
        </svg>
      </span>
      <span className={`font-display font-bold tracking-tight leading-none ${dimensions.text}`}>
        <span className="text-amber-50">Bet</span>
        <span className="text-amber-400">Spot</span>
      </span>
    </span>
  );
};
