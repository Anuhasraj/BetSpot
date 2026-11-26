import React from 'react';
import { DiceFace } from '../domain/types';
import { getDaduketaPipLayout } from '../three/daduketaTextures';

export interface DaduketaDieFaceProps {
  face: DiceFace;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<DaduketaDieFaceProps['size']>, string> = {
  sm: 'h-6 w-6',
  md: 'h-7 w-7 sm:h-8 sm:w-8',
  lg: 'h-10 w-10',
};

/**
 * Renders a 2D SVG representation of a Daduketa die face (3, 6, 9, 12, 15, 18)
 * using the canonical pip layout from `daduketaTextures`.
 */
export const DaduketaDieFace: React.FC<DaduketaDieFaceProps> = ({
  face,
  size = 'md',
  className = '',
}) => {
  const { points, radius } = getDaduketaPipLayout(face);

  return (
    <span
      title={`Rolled ${face}`}
      aria-label={`Rolled ${face}`}
      className={`inline-flex items-center justify-center rounded-md border border-amber-400/65 bg-[#121216] p-0.5 shadow-inner shrink-0 ${SIZE_CLASSES[size]} ${className}`}
    >
      <svg viewBox="0 0 512 512" className="h-full w-full">
        <rect
          x="16"
          y="16"
          width="480"
          height="480"
          rx="64"
          fill="#141419"
          stroke="#3F3F46"
          strokeWidth="16"
        />
        {points.map(([px, py], idx) => (
          <circle
            key={idx}
            cx={px}
            cy={py}
            r={Math.max(24, radius * 1.18)}
            fill="#F8FAFC"
          />
        ))}
      </svg>
    </span>
  );
};
