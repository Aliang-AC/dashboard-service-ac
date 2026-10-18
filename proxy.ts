import { clerkMiddleware } from '@clerk/nextjs/server';

/* Proxy hanya menyiapkan sesi Clerk. Pengecekan login & hak akses dilakukan langsung
   di halaman (app/page.tsx) dan di setiap aksi server (lib/access.ts → requireMe). */
export default clerkMiddleware();

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/:path*',
  ],
};
