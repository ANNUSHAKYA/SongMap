import type { Metadata } from 'next'
import { ThemeProvider } from '@/components/ThemeContext'
import './globals.css'

export const metadata: Metadata = {
  title: 'SongMap — Beat DNA Explorer',
  description: 'Analyse any song\'s beats and instruments, then explore 50 beat-matched recommendations — all saved to your database.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
