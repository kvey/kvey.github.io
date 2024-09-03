import './globals.css'
import type { Metadata } from 'next'
import type { AppProps } from 'next/app'
import Nav from '@/components/nav';
import {berkeleyMono} from "@/components/font";
import { Analytics } from "@vercel/analytics/react"

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
    <html lang="en">
      <body className={berkeleyMono.className}>
      <Analytics/>
      {children}
      </body>
    </html>
  )
}
