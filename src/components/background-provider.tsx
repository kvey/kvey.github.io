"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type BackgroundType = 'none' | 'flocking' | 'simplex-noise' | 'fluid' | 'solids' | 'prism';

interface BackgroundContextType {
  background: BackgroundType;
  setBackground: (bg: BackgroundType) => void;
  contentHidden: boolean;
  setContentHidden: (hidden: boolean) => void;
}

const BackgroundContext = createContext<BackgroundContextType>({
  background: 'none',
  setBackground: () => {},
  contentHidden: false,
  setContentHidden: () => {},
});

export function useBackground() {
  return useContext(BackgroundContext);
}

export function BackgroundProvider({ children }: { children: ReactNode }) {
  const [background, setBackgroundState] = useState<BackgroundType>('none');
  const [contentHidden, setContentHidden] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('background') as BackgroundType | null;
    if (saved) setBackgroundState(saved);
  }, []);

  const setBackground = (bg: BackgroundType) => {
    setBackgroundState(bg);
    localStorage.setItem('background', bg);
  };

  return (
    <BackgroundContext.Provider value={{ background, setBackground, contentHidden, setContentHidden }}>
      {children}
    </BackgroundContext.Provider>
  );
}
