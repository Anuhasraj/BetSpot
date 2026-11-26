import React, { useEffect, useState } from 'react';
import { AVATAR_FRAME_STYLES } from '../domain/constants';
import { CountryFlag } from './CountryFlag';

interface AvatarFrameProps {
  src?: string;
  username: string;
  size?: 'sm' | 'md' | 'lg';
  highlighted?: boolean;
  countdownProgress?: number;
  frameId?: string;
  country?: string;
}

export const AvatarFrame: React.FC<AvatarFrameProps> = ({
  src,
  username,
  size = 'md',
  highlighted = false,
  countdownProgress,
  frameId,
  country,
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [src]);

  const frameStyle =
    AVATAR_FRAME_STYLES.find((f) => f.id === frameId) ?? AVATAR_FRAME_STYLES[0];

  const dims =
    size === 'sm'
      ? 'h-8 w-8 rounded-lg'
      : size === 'lg'
      ? 'h-16 w-16 rounded-2xl'
      : 'h-10 w-10 rounded-xl';

  const initials = username.slice(0, 2).toUpperCase();
  const hasCountdown = typeof countdownProgress === 'number';
  const clampedProgress = hasCountdown
    ? Math.max(0, Math.min(1, countdownProgress))
    : 0;

  // Clockwise rounded-square perimeter path starting from top-center (12 o'clock)
  const r = size === 'sm' ? 9 : size === 'lg' ? 12 : 10;
  const x0 = 2;
  const y0 = 2;
  const x1 = 42;
  const y1 = 42;
  const cx = 22;
  const perimeterPath = [
    `M ${cx} ${y0}`,
    `L ${x1 - r} ${y0}`,
    `A ${r} ${r} 0 0 1 ${x1} ${y0 + r}`,
    `L ${x1} ${y1 - r}`,
    `A ${r} ${r} 0 0 1 ${x1 - r} ${y1}`,
    `L ${x0 + r} ${y1}`,
    `A ${r} ${r} 0 0 1 ${x0} ${y1 - r}`,
    `L ${x0} ${y0 + r}`,
    `A ${r} ${r} 0 0 1 ${x0 + r} ${y0}`,
    `Z`,
  ].join(' ');

  return (
    <div
      className={`relative shrink-0 p-[2.5px] ${frameStyle.outerClass} ${dims} ${
        hasCountdown
          ? 'border border-amber-400/35'
          : highlighted
          ? 'ring-2 ring-amber-300 border border-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.45)]'
          : `${frameStyle.borderClass} shadow-inner`
      }`}
    >
      {hasCountdown && (
        <svg
          viewBox="0 0 44 44"
          aria-hidden="true"
          className="pointer-events-none absolute -inset-[3px] z-10 h-[calc(100%+6px)] w-[calc(100%+6px)] overflow-visible"
        >
          <path
            d={perimeterPath}
            fill="none"
            stroke="rgba(251, 191, 36, 0.16)"
            strokeWidth="2.5"
          />
          {clampedProgress > 0 && (
            <path
              d={perimeterPath}
              fill="none"
              stroke={clampedProgress <= 0.25 ? '#fb7185' : '#fcd34d'}
              strokeWidth="3"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray="100"
              strokeDashoffset={100 - clampedProgress * 100}
              style={{
                transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s ease',
                filter:
                  clampedProgress <= 0.25
                    ? 'drop-shadow(0 0 5px rgba(251,113,133,0.9))'
                    : 'drop-shadow(0 0 5px rgba(252,211,77,0.85))',
              }}
            />
          )}
        </svg>
      )}

      <div className="h-full w-full overflow-hidden rounded-[inherit] bg-[#180805] flex items-center justify-center">
        {src && !imgFailed ? (
          <img
            src={src}
            alt={`${username} avatar`}
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="font-display text-xs font-bold text-amber-200">{initials}</span>
        )}
      </div>

      {country && (
        <div
          className={`absolute z-20 pointer-events-none leading-none ${
            size === 'lg' ? 'bottom-[1px] right-[1px]' : 'bottom-0 right-0'
          }`}
        >
          <CountryFlag
            country={country}
            size={size === 'lg' ? 'md' : size === 'md' ? 'sm' : 'xs'}
            circular
          />
        </div>
      )}
    </div>
  );
};
