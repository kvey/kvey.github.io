"use client";

import { ReactNode } from 'react';
import { useBackground } from './background-provider';

export default function BackgroundWrapper({ children }: { children: ReactNode }) {
  const { contentHidden } = useBackground();

  return (
    <div className={`transition-[filter] duration-300 ${contentHidden ? '' : 'blur-[2px]'}`}>
      {children}
    </div>
  );
}
