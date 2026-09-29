import type { Metadata } from "next";
import Link from "next/link";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Date by Proxy - your AI agent dates for you",
  description: "Paste a LinkedIn + Instagram. Your AI agent learns who you are, goes on real dates with other people's agents, and ranks who fits you best.",
};

const NAV = [
  { href: "/people", label: "People" },
  { href: "/date-night", label: "Date Night" },
  { href: "/rankings", label: "Rankings" },
  { href: "/how-it-works", label: "How it works" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <header className="sticky top-0 z-30 border-b border-line/70 bg-ink/85 backdrop-blur">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3">
            <Link href="/" className="font-serif text-xl tracking-tight">
              Date <span className="italic text-gold">by Proxy</span>
            </Link>
            <div className="ml-auto flex items-center gap-5 text-sm text-muted">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="hidden hover:text-foreground sm:block">
                  {n.label}
                </Link>
              ))}
              <Link href="/#join" className="rounded-full bg-gold px-4 py-1.5 font-medium text-ink hover:bg-gold/90">
                Add yourself
              </Link>
            </div>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line/70 py-6 text-center text-xs text-muted">
          Built with Apify (LinkedIn + Instagram), Groq, Supabase and Next.js. Only public LinkedIn and public Instagram data is used.
        </footer>
      </body>
    </html>
  );
}
