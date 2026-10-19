import type { Metadata, Viewport } from 'next';
import { Barlow, Barlow_Condensed, JetBrains_Mono } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { shadcn } from '@clerk/ui/themes';
import { idID } from '@clerk/localizations';
import { ThemeProvider } from '@/components/theme-provider';
import { APP_NAME } from '@/lib/brand';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const barlow = Barlow({ variable: '--font-barlow', subsets: ['latin'], weight: ['400', '500', '600', '700'] });
const barlowCondensed = Barlow_Condensed({ variable: '--font-barlow-condensed', subsets: ['latin'], weight: ['600', '700'] });
const jetbrains = JetBrains_Mono({ variable: '--font-jetbrains', subsets: ['latin'], weight: ['400', '600'] });

export const metadata: Metadata = {
  title: APP_NAME,
  description: 'Order, stok, absensi, invoice dan catatan usaha service AC dalam satu dashboard.',
};
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#172020' },
  ],
};

/* Teks login Clerk dalam bahasa Indonesia; "username" ditampilkan sebagai Nomor HP karena akun karyawan memakai nomor HP. */
const localization = {
  ...idID,
  formFieldLabel__username: 'Nomor HP',
  formFieldInputPlaceholder__username: '08xxxxxxxxxx',
  formFieldLabel__password: 'Password / PIN',
  signIn: {
    ...idID.signIn,
    start: { ...idID.signIn?.start, title: `Masuk ke ${APP_NAME}`, subtitle: 'Masukkan nomor HP dan PIN dari admin' },
    password: { ...idID.signIn?.password, title: 'Masukkan Password / PIN', subtitle: 'untuk masuk ke ' + APP_NAME },
  },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="id" suppressHydrationWarning className={`${barlow.variable} ${barlowCondensed.variable} ${jetbrains.variable} antialiased`}>
      <body className="min-h-dvh">
        <ClerkProvider appearance={{ theme: shadcn }} localization={localization}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            {children}
            <Toaster position="bottom-center" />
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
