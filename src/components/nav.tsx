"use client";

import { type SVGProps } from 'react'
import { Linkedin } from 'lucide-react';

const navigation = [
  { name: 'Home', href: '/' },
  { name: 'Writing', href: '/blog' },
  { name: 'Sketches', href: '/sketches' },
]

function XComIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  )
}

const socialLinks = [
  { name: 'X.com', href: 'https://x.com/kveykva', icon: XComIcon },
  { name: 'LinkedIn', href: 'https://www.linkedin.com/in/colton-pierson-00aab248/', icon: Linkedin },
]

export default function Nav() {
  return (
    <header className="sticky top-0 z-30 w-full backdrop-blur-md bg-paper/70 dark:bg-paper/60 border-b border-rule/60">
      <nav
        className="mx-auto flex max-w-6xl items-center justify-between px-6 sm:px-10 h-12"
        aria-label="Global"
      >
        <a
          href="/"
          className="nav-link hidden font-mono text-[11px] uppercase tracking-[0.18em] sm:block"
        >
          Colton Pierson
        </a>

        <div className="flex flex-1 items-center justify-between gap-x-6 sm:flex-none sm:justify-start sm:gap-x-8">
          <ul className="flex items-center gap-x-5 sm:gap-x-7">
            {navigation.map((item) => (
              <li key={item.name}>
                <a
                  href={item.href}
                  className="nav-link font-mono text-[11px] uppercase tracking-[0.18em]"
                >
                  {item.name}
                </a>
              </li>
            ))}
          </ul>

          <span className="hidden sm:block h-3 w-px bg-rule" aria-hidden="true" />

          <div className="flex items-center gap-x-3.5">
            {socialLinks.map((item) => {
              const Icon = item.icon
              return (
                <a
                  key={item.name}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={item.name}
                  className="text-muted hover:text-accent transition-colors"
                >
                  <Icon className="h-[14px] w-[14px]" strokeWidth={1.75} strokeLinecap="round" aria-hidden="true" />
                </a>
              )
            })}
          </div>
        </div>
      </nav>
    </header>
  )
}
