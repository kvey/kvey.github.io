'use client';

import { useRef } from 'react';
import HoverImage, { type HoverImageData } from './hover-image';

export type Work = {
  company: string;
  href: string;
  role: string;
  period: string;
  headline: string;
  body: string;
  hoverImage?: HoverImageData;
};

export default function WorkRow({ entry }: { entry: Work }) {
  const ref = useRef<HTMLLIElement>(null);

  return (
    <li
      ref={ref}
      className="relative grid grid-cols-1 sm:grid-cols-[1fr_2.2fr] gap-y-3 sm:gap-x-10 py-10 sm:py-12"
    >
      <div>
        <a
          href={entry.href}
          target="_blank"
          rel="noopener noreferrer"
          className="heading-link font-serif text-3xl sm:text-4xl leading-none"
        >
          {entry.company}
        </a>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted mt-3">
          {entry.role}
        </p>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted mt-1">
          {entry.period}
        </p>
      </div>

      <div className="sm:pt-1">
        <p className="font-mono text-sm sm:text-base leading-relaxed text-ink">
          {entry.headline}
        </p>
        <p className="font-mono text-sm leading-relaxed text-muted mt-4 max-w-xl">
          {entry.body}
        </p>
      </div>

      {entry.hoverImage && <HoverImage image={entry.hoverImage} containerRef={ref} />}
    </li>
  );
}
