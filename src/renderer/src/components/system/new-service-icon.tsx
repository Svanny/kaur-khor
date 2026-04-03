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
