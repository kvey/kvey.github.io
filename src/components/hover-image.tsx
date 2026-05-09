'use client';

import Image from 'next/image';
import { type RefObject, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export type HoverImageData = {
  src: string;
  width: number;
  height: number;
  alt: string;
};

export default function HoverImage({
  image,
  containerRef,
}: {
  image: HoverImageData;
  containerRef: RefObject<HTMLElement | null>;
}) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onEnter = (e: MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
      setVisible(true);
    };
    const onMove = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    const onLeave = () => setVisible(false);

    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [containerRef]);

  if (!mounted) return null;

  return createPortal(
    <div
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-50 hidden xl:block"
      style={{ transform: `translate3d(${pos.x + 24}px, ${pos.y + 24}px, 0)` }}
    >
      <div
        className="w-[clamp(140px,12vw,210px)] origin-top-left transition-[opacity,transform] duration-200 ease-out"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1)' : 'scale(0.85)',
        }}
      >
        <Image
          src={image.src}
          alt={image.alt}
          width={image.width}
          height={image.height}
          sizes="420px"
          className="w-full h-auto rounded-md ring-1 ring-rule/60 shadow-2xl"
        />
      </div>
    </div>,
    document.body,
  );
}
