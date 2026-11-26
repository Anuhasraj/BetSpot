import React from 'react';
import { WORLD_COUNTRIES } from '../domain/worldCountries';

interface CountryFlagProps {
  country?: string;
  size?: 'xs' | 'sm' | 'md';
  circular?: boolean;
}

const COUNTRY_BY_NAME = new Map(WORLD_COUNTRIES.map((c) => [c.name, c]));

export const CountryFlag: React.FC<CountryFlagProps> = ({
  country,
  size = 'xs',
  circular = false,
}) => {
  if (!country) return null;
  const entry = COUNTRY_BY_NAME.get(country);
  const iso = entry?.iso ?? 'OTHER';

  const dimClass = circular
    ? size === 'md'
      ? 'h-4 w-4 rounded-full border-[1.5px]'
      : size === 'sm'
      ? 'h-3 w-3 rounded-full border'
      : 'h-2.5 w-2.5 rounded-full border'
    : size === 'md' || size === 'sm'
    ? 'h-3.5 w-5 rounded-[2px] border'
    : 'h-2.5 w-3.5 rounded-[2px] border';

  const renderSvg = () => {
    switch (iso) {
      case 'LK':
        return (
          <svg viewBox="0 0 24 16" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
            <rect width="24" height="16" fill="#FFBE29" />
            <rect x="1" y="1.5" width="3.5" height="13" fill="#00534E" />
            <rect x="4.5" y="1.5" width="3.5" height="13" fill="#EB7400" />
            <rect x="9" y="1.5" width="13.5" height="13" fill="#8D153A" />
            <circle cx="15.7" cy="8" r="3" fill="#FFBE29" />
          </svg>
        );
      case 'US':
        return (
          <svg viewBox="0 0 24 16" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
            <rect width="24" height="16" fill="#FFFFFF" />
            <rect y="0" width="24" height="2.3" fill="#B22234" />
            <rect y="4.6" width="24" height="2.3" fill="#B22234" />
            <rect y="9.2" width="24" height="2.3" fill="#B22234" />
            <rect y="13.7" width="24" height="2.3" fill="#B22234" />
            <rect width="10.5" height="9.2" fill="#3C3B6E" />
          </svg>
        );
      case 'GB':
        return (
          <svg viewBox="0 0 24 16" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
            <rect width="24" height="16" fill="#012169" />
            <path d="M0 0L24 16M24 0L0 16" stroke="#FFFFFF" strokeWidth="3" />
            <path d="M0 0L24 16M24 0L0 16" stroke="#C8102E" strokeWidth="1.4" />
            <path d="M12 0V16M0 8H24" stroke="#FFFFFF" strokeWidth="4.5" />
            <path d="M12 0V16M0 8H24" stroke="#C8102E" strokeWidth="2.5" />
          </svg>
        );
      case 'CA':
        return (
          <svg viewBox="0 0 24 16" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
            <rect width="24" height="16" fill="#FFFFFF" />
            <rect width="6" height="16" fill="#FF0000" />
            <rect x="18" width="6" height="16" fill="#FF0000" />
            <polygon points="12,3 13.8,7 16,6.5 14.2,9.5 15.2,11 12.6,10.5 12.6,13 11.4,13 11.4,10.5 8.8,11 9.8,9.5 8,6.5 10.2,7" fill="#FF0000" />
          </svg>
        );
      case 'AU':
      case 'NZ':
        return (
          <svg viewBox="0 0 24 16" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
            <rect width="24" height="16" fill="#00008B" />
            <rect width="11" height="8" fill="#012169" />
            <path d="M5.5 0V8M0 4H11" stroke="#FFFFFF" strokeWidth="2" />
            <path d="M5.5 0V8M0 4H11" stroke="#C8102E" strokeWidth="1" />
            <circle cx="17.5" cy="5" r="1.2" fill={iso === 'NZ' ? '#EF4444' : '#FFFFFF'} />
            <circle cx="19.5" cy="10.5" r="1.2" fill={iso === 'NZ' ? '#EF4444' : '#FFFFFF'} />
            <circle cx="15" cy="11.5" r="1" fill="#FFFFFF" />
          </svg>
        );
      case 'SG':
        return (
          <svg viewBox="0 0 24 16" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
            <rect width="24" height="8" fill="#EF3340" />
            <rect y="8" width="24" height="8" fill="#FFFFFF" />
            <circle cx="5.5" cy="4" r="2.3" fill="#FFFFFF" />
            <circle cx="6.4" cy="4" r="1.9" fill="#EF3340" />
          </svg>
        );
      case 'AE':
        return (
          <svg viewBox="0 0 24 16" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
            <rect y="0" width="24" height="5.4" fill="#00732F" />
            <rect y="5.3" width="24" height="5.4" fill="#FFFFFF" />
            <rect y="10.6" width="24" height="5.4" fill="#000000" />
            <rect width="6.5" height="16" fill="#FF0000" />
          </svg>
        );
      case 'IN':
        return (
          <svg viewBox="0 0 24 16" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
            <rect y="0" width="24" height="5.4" fill="#FF9933" />
            <rect y="5.3" width="24" height="5.4" fill="#FFFFFF" />
            <rect y="10.6" width="24" height="5.4" fill="#138808" />
            <circle cx="12" cy="8" r="2" fill="none" stroke="#000080" strokeWidth="0.9" />
          </svg>
        );
      case 'MY':
        return (
          <svg viewBox="0 0 24 16" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
            <rect width="24" height="16" fill="#FFFFFF" />
            <rect y="0" width="24" height="2.6" fill="#CC0001" />
            <rect y="5.2" width="24" height="2.6" fill="#CC0001" />
            <rect y="10.4" width="24" height="2.6" fill="#CC0001" />
            <rect width="12" height="9" fill="#010066" />
            <circle cx="5.5" cy="4.5" r="2.3" fill="#FFCC00" />
            <circle cx="6.5" cy="4.5" r="1.8" fill="#010066" />
          </svg>
        );
      case 'CH':
        return (
          <svg viewBox="0 0 24 16" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
            <rect width="24" height="16" fill="#D52B1E" />
            <rect x="10.2" y="3" width="3.6" height="10" fill="#FFFFFF" />
            <rect x="7" y="6.2" width="10" height="3.6" fill="#FFFFFF" />
          </svg>
        );
      case 'KR':
        return (
          <svg viewBox="0 0 24 16" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
            <rect width="24" height="16" fill="#FFFFFF" />
            <circle cx="12" cy="8" r="4" fill="#CD2E3A" />
            <path d="M8 8A4 4 0 0 0 16 8Z" fill="#0047A0" />
          </svg>
        );
      case 'PH':
        return (
          <svg viewBox="0 0 24 16" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
            <rect y="0" width="24" height="8" fill="#0038A8" />
            <rect y="8" width="24" height="8" fill="#CE1126" />
            <polygon points="0,0 10,8 0,16" fill="#FFFFFF" />
            <circle cx="3.8" cy="8" r="1.8" fill="#FCD116" />
          </svg>
        );
      default: {
        if (!entry) {
          return (
            <svg viewBox="0 0 24 16" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
              <rect width="24" height="16" fill="#0F172A" />
              <circle cx="12" cy="8" r="5" fill="none" stroke="#38BDF8" strokeWidth="1.5" />
              <ellipse cx="12" cy="8" rx="2.5" ry="5" fill="none" stroke="#38BDF8" strokeWidth="1" />
              <line x1="7" y1="8" x2="17" y2="8" stroke="#38BDF8" strokeWidth="1" />
            </svg>
          );
        }

        const [c1, c2, c3] = entry.colors;
        switch (entry.layout) {
          case 'h3':
            return (
              <svg viewBox="0 0 24 16" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
                <rect y="0" width="24" height="5.4" fill={c1} />
                <rect y="5.3" width="24" height="5.4" fill={c2} />
                <rect y="10.6" width="24" height="5.4" fill={c3 ?? c1} />
              </svg>
            );
          case 'h2':
            return (
              <svg viewBox="0 0 24 16" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
                <rect y="0" width="24" height="8" fill={c1} />
                <rect y="8" width="24" height="8" fill={c2} />
              </svg>
            );
          case 'v3':
            return (
              <svg viewBox="0 0 24 16" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
                <rect x="0" width="8" height="16" fill={c1} />
                <rect x="8" width="8" height="16" fill={c2} />
                <rect x="16" width="8" height="16" fill={c3 ?? c1} />
              </svg>
            );
          case 'v2':
            return (
              <svg viewBox="0 0 24 16" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
                <rect x="0" width="12" height="16" fill={c1} />
                <rect x="12" width="12" height="16" fill={c2} />
              </svg>
            );
          case 'cross':
            return (
              <svg viewBox="0 0 24 16" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
                <rect width="24" height="16" fill={c1} />
                <path d="M9 0V16M0 8H24" stroke={c2} strokeWidth="3.5" />
              </svg>
            );
          case 'circle':
          default:
            return (
              <svg viewBox="0 0 24 16" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
                <rect width="24" height="16" fill={c1} />
                <circle cx="12" cy="8" r="4.2" fill={c2} />
              </svg>
            );
        }
      }
    }
  };

  return (
    <span
      title={country}
      aria-label={country}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden border-white/90 bg-slate-950 shadow-[0_1px_4px_rgba(0,0,0,0.85)] [&>svg]:h-full [&>svg]:w-full [&>svg]:object-cover ${dimClass}`}
    >
      {renderSvg()}
    </span>
  );
};
