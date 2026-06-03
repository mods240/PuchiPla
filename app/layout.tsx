import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'プチプラプラプラ',
  description: '100均・プチプラショップを地図で探そう',
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}
