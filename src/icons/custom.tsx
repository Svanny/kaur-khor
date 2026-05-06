import { forwardRef } from 'react';
import type { IconProps } from './types';

export const NotebookTextDashedIcon = forwardRef<SVGSVGElement, IconProps>(
  function NotebookTextDashedIcon({ className, ...props }, ref) {
    return (
      <svg
        ref={ref}
        className={className}
        fill="none"
        height="24"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="24"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        <path d="M8 2v4" />
        <path d="M12 2v4" />
        <path d="M16 2v4" />
        <path d="M16 4h2a2 2 0 0 1 2 2v2" />
        <path d="M20 12v2" />
        <path d="M20 18v2a2 2 0 0 1-2 2h-1" />
        <path d="M13 22h-2" />
        <path d="M7 22H6a2 2 0 0 1-2-2v-2" />
        <path d="M4 14v-2" />
        <path d="M4 8V6a2 2 0 0 1 2-2h2" />
        <path d="M8 10h6" />
        <path d="M8 14h8" />
        <path d="M8 18h5" />
      </svg>
    );
  },
);

export function NewServiceIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className ?? 'size-4 shrink-0'}
      fill="none"
      height="24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <mask id="new-service-icon-plus-cutout">
          <rect fill="white" height="24" width="24" />
          <circle cx="19" cy="17" fill="black" r="5" />
        </mask>
      </defs>

      <g mask="url(#new-service-icon-plus-cutout)">
        <path d="M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5" />
        <path d="M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244" />
        <path d="M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05" />
      </g>

      <path d="M19 14v6" />
      <path d="M16 17h6" />
    </svg>
  );
}

export const DatabaseDownloadIcon = forwardRef<SVGSVGElement, IconProps>(
  function DatabaseDownloadIcon({ className, ...props }, ref) {
    return (
      <svg
        ref={ref}
        className={className}
        fill="none"
        height="24"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="24"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 12a9 3 0 0 0 5 2.69" />
        <path d="M21 9.3V5" />
        <path d="M3 5v14a9 3 0 0 0 6.47 2.88" />
        <path d="M17 12v8" />
        <path d="m14.5 17.5 2.5 2.5 2.5-2.5" />
      </svg>
    );
  },
);

export const DatabaseUploadIcon = forwardRef<SVGSVGElement, IconProps>(
  function DatabaseUploadIcon({ className, ...props }, ref) {
    return (
      <svg
        ref={ref}
        className={className}
        fill="none"
        height="24"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="24"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 12a9 3 0 0 0 5 2.69" />
        <path d="M21 9.3V5" />
        <path d="M3 5v14a9 3 0 0 0 6.47 2.88" />
        <path d="M17 20v-8" />
        <path d="m14.5 14.5 2.5-2.5 2.5 2.5" />
      </svg>
    );
  },
);

export const ExplosionIcon = forwardRef<SVGSVGElement, IconProps>(
  function ExplosionIcon({ className, ...props }, ref) {
    return (
      <svg
        ref={ref}
        className={className}
        fill="none"
        height="24"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="24"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        <path d="M12 1.5 14.53 5.9 19.42 4.58 18.1 9.47 22.5 12 18.1 14.53 19.42 19.42 14.53 18.1 12 22.5 9.47 18.1 4.58 19.42 5.9 14.53 1.5 12 5.9 9.47 4.58 4.58 9.47 5.9 12 1.5Z" />
        <path d="M12 9.4 13.03 10.98 14.6 12 13.03 13.03 12 14.6 10.98 13.03 9.4 12 10.98 10.98 12 9.4Z" />
      </svg>
    );
  },
);

export const ChartLineTypeIcon = forwardRef<SVGSVGElement, IconProps>(
  function ChartLineTypeIcon({ className, ...props }, ref) {
    return (
      <svg
        ref={ref}
        className={className}
        fill="none"
        height="24"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="24"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        <path d="M3 16 8 10l4 3 9-10" />
      </svg>
    );
  },
);

export const ChartAreaTypeIcon = forwardRef<SVGSVGElement, IconProps>(
  function ChartAreaTypeIcon({ className, ...props }, ref) {
    return (
      <svg
        ref={ref}
        className={className}
        fill="none"
        height="24"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="24"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        <path d="M3 17 8 11l4 3 8-9" />
        <path d="M3 17h18" />
        <path d="M3 17 8 11l4 3 8-9v12H3Z" fill="currentColor" fillOpacity="0.18" stroke="none" />
      </svg>
    );
  },
);

export const ChartStepLineTypeIcon = forwardRef<SVGSVGElement, IconProps>(
  function ChartStepLineTypeIcon({ className, ...props }, ref) {
    return (
      <svg
        ref={ref}
        className={className}
        fill="none"
        height="24"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="24"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        <path d="M4 18h5V8h6v6h5" />
      </svg>
    );
  },
);

export const ChartHistogramTypeIcon = forwardRef<SVGSVGElement, IconProps>(
  function ChartHistogramTypeIcon({ className, ...props }, ref) {
    return (
      <svg
        ref={ref}
        className={className}
        fill="none"
        height="24"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="24"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        <path d="M4 19V9" />
        <path d="M10 19V5" />
        <path d="M16 19v-7" />
        <path d="M20 19v-4" />
      </svg>
    );
  },
);

export const ChartBarsTypeIcon = forwardRef<SVGSVGElement, IconProps>(
  function ChartBarsTypeIcon({ className, ...props }, ref) {
    return (
      <svg
        ref={ref}
        className={className}
        fill="none"
        height="24"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="24"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        <path d="M5 5v14" />
        <path d="M3 9h4" />
        <path d="M5 13h3" />
        <path d="M12 4v16" />
        <path d="M10 8h4" />
        <path d="M12 14h3" />
        <path d="M19 6v12" />
        <path d="M17 10h4" />
        <path d="M19 13h3" />
      </svg>
    );
  },
);

export const ChartCandlesTypeIcon = forwardRef<SVGSVGElement, IconProps>(
  function ChartCandlesTypeIcon({ className, ...props }, ref) {
    return (
      <svg
        ref={ref}
        className={className}
        fill="none"
        height="24"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="24"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        <path d="M7 4v16" />
        <rect x="5" y="7" width="4" height="8" rx="0.5" />
        <path d="M16 4v16" />
        <rect x="13.5" y="5" width="5" height="11" rx="0.5" />
      </svg>
    );
  },
);
