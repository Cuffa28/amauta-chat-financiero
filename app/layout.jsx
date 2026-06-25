import "./globals.css";
import { Fira_Sans } from "next/font/google";

const fira = Fira_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "700", "800"],
  variable: "--font-fira",
});

export const metadata = {
  title: "Amauta | Chat Financiero",
  description: "Series históricas de mercado desde Reuters para el equipo de Amauta Inversiones.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={fira.variable}>
      <body>{children}</body>
    </html>
  );
}
