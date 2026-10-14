import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GeekPrice — Inteligência para lojas geek",
  description: "Monitore preços, proteja margens e encontre oportunidades de venda.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
