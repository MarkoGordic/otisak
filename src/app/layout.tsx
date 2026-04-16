import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import { LangProvider } from '@/components/LangProvider';

export const metadata: Metadata = {
  title: 'OTISAK - Automated Test & Assessment System',
  description: 'Automated Test and Integrated Scoring Assessment Kernel',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('otisak-theme')||'dark';document.documentElement.setAttribute('data-theme',t)})()`,
          }}
        />
      </head>
      <body>
        <ThemeProvider><LangProvider>{children}</LangProvider></ThemeProvider>
      </body>
    </html>
  );
}
