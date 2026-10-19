import type { Metadata } from "next";
import "./globals.css";
import "./tcg-theme.css";
import "./marketing.css";
import "./geek-workspace.css";
import "./collection-gallery.css";
import "./commission-studio.css";
import "./geekprice-index.css";

export const metadata: Metadata = {
  title: "GeekPrice — Inteligência para lojas geek",
  description: "Monitore preços, proteja margens e encontre oportunidades de venda.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
