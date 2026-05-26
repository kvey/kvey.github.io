"use client";

import { useState, type SVGProps } from 'react'
import { Linkedin, Menu, X } from 'lucide-react';

const navigation = [
  { name: 'Home', href: '/' },
  { name: 'Writing', href: '/blog' },
  { name: 'Sketches', href: '/sketches' },
  { name: 'Open Source', href: '/open-source' },
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
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-30 w-full backdrop-blur-md bg-paper/70 dark:bg-paper/60 border-b border-rule/60">
      <nav
        className="mx-auto flex max-w-6xl items-center justify-between px-6 sm:px-10 h-12"
        aria-label="Global"
      >
        <a
          href="/"
          className="nav-link font-mono text-[11px] uppercase tracking-[0.18em]"
        >
          Colton Pierson
        </a>

        {/* Desktop links + socials */}
        <div className="hidden sm:flex flex-none items-center justify-start gap-x-8">
          <ul className="flex items-center gap-x-7">
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

          <span className="h-3 w-px bg-rule" aria-hidden="true" />

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

        {/* Mobile menu toggle */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="mobile-menu"
          className="sm:hidden -mr-1.5 inline-flex items-center justify-center p-1.5 text-muted hover:text-accent transition-colors"
        >
          {open
            ? <X className="h-[18px] w-[18px]" strokeWidth={1.75} strokeLinecap="round" aria-hidden="true" />
            : <Menu className="h-[18px] w-[18px]" strokeWidth={1.75} strokeLinecap="round" aria-hidden="true" />}
        </button>
      </nav>

      {/* Mobile menu panel */}
      <div
        id="mobile-menu"
        className={`sm:hidden overflow-hidden border-t border-rule/60 transition-[max-height,opacity] duration-300 ease-out ${
          open ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <ul className="flex flex-col px-6 py-2">
          {navigation.map((item) => (
            <li key={item.name}>
              <a
                href={item.href}
                onClick={() => setOpen(false)}
                className="nav-link block py-2.5 font-mono text-[11px] uppercase tracking-[0.18em]"
              >
                {item.name}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-x-5 border-t border-rule/60 px-6 py-3">
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
                <Icon className="h-[16px] w-[16px]" strokeWidth={1.75} strokeLinecap="round" aria-hidden="true" />
              </a>
            )
          })}
        </div>
      </div>
    </header>
  )
}
