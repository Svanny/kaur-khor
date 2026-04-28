import type { ReactNode } from 'react';
import LiquidGlass from 'liquid-glass-react';
import { cn } from '@/lib/utils';

export const liquidGridCardBaseClassName =
  'liquid-grid-card-frame group relative flex aspect-square w-full max-w-[22rem] min-h-0 flex-col overflow-hidden rounded-2xl border shadow-[0_16px_36px_rgba(48,31,20,0.08)] transition duration-200 before:pointer-events-none before:absolute before:inset-0 before:bg-white/18 before:backdrop-blur-xl before:content-[\'\'] after:pointer-events-none after:absolute after:inset-[1px] after:rounded-[calc(1rem-1px)] after:bg-[linear-gradient(135deg,rgba(255,255,255,0.58),rgba(255,255,255,0.16)_42%,rgba(255,255,255,0.36))] after:mix-blend-screen after:content-[\'\'] hover:-translate-y-1 hover:border-foreground/30 hover:shadow-[0_22px_48px_rgba(48,31,20,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 md:w-[var(--hub-tile-size)] md:rounded-[2rem] md:after:rounded-[calc(2rem-1px)] md:shadow-[0_22px_50px_rgba(48,31,20,0.10)] md:hover:shadow-[0_28px_60px_rgba(48,31,20,0.16)]';

export function LiquidGridCardLayer() {
  return (
    <LiquidGlass
      aberrationIntensity={1.2}
      blurAmount={0.025}
      className="liquid-grid-card-glass pointer-events-none absolute h-full w-full opacity-5"
      cornerRadius={32}
      displacementScale={34}
      elasticity={0.08}
      padding="0"
      saturation={150}
      style={{ position: 'absolute', top: '50%', left: '50%' }}
    >
      <span className="block size-full" />
    </LiquidGlass>
  );
}

export function LiquidGridCard({
  children,
  className,
  contentClassName,
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div className={cn(liquidGridCardBaseClassName, className)}>
      <LiquidGridCardLayer />
      <div className={cn('relative z-10 flex h-full flex-col', contentClassName)}>
        {children}
      </div>
    </div>
  );
}
