import type { Metadata, Viewport } from 'next'
import { Inter, Poppins } from 'next/font/google'

import { ThemeScript } from '@/components/theme/theme-script'
import { ToastProvider } from '@/components/ui/toast'

import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { default: 'Karaks Storage', template: '%s — Karaks Storage' },
  description:
    'Stockage cloud, Media API et diffusion sécurisée : téléversez, organisez et diffusez vos médias par une API documentée.',
  icons: { icon: '/icon.svg' },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0a1020' },
    { media: '(prefers-color-scheme: light)', color: '#f4f6fa' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" data-theme="dark" suppressHydrationWarning className={`${inter.variable} ${poppins.variable}`}>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-screen">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
