import './globals.css'
import type { Metadata } from 'next'
import {berkeleyMono} from "@/components/font";
import { Analytics } from "@vercel/analytics/react"
import { BackgroundProvider } from '@/components/background-provider';
import FlockingBackground from '@/components/flocking-background';
import SimplexNoiseBackground from '@/components/simplex-noise-background';
import BackgroundSelector from '@/components/background-selector';
import PageContent from '@/components/page-content';
import FluidBackground from '@/components/fluid-background';
import SolidsBackground from '@/components/solids-background';
import PrismBackground from '@/components/prism-background';
import BackgroundWrapper from '@/components/background-wrapper';
import { ThemeProvider } from '@/components/theme-provider';
export const metadata: Metadata = {
  title: 'Colton Pierson',
  description: 'Colton Pierson - founder @ ThousandBirds',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={berkeleyMono.className}>
      <Analytics/>
      <ThemeProvider>
      <BackgroundProvider>
        <BackgroundWrapper>
          <FlockingBackground />
          <SimplexNoiseBackground />
          <FluidBackground />
          <SolidsBackground />
          <PrismBackground />
        </BackgroundWrapper>
        <BackgroundSelector />
        <PageContent>{children}</PageContent>
      </BackgroundProvider>
      </ThemeProvider>
      </body>
    </html>
  )
}
