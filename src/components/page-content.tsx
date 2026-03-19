"use client";

import { ReactNode } from 'react';
import { useBackground } from './background-provider';

export default function PageContent({ children }: { children: ReactNode }) {
  const { contentHidden } = useBackground();

  return (
    <div className={`relative z-10 transition-opacity duration-300 ${contentHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
      {children}
    </div>
  );
}
