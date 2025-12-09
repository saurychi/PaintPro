import "./globals.css";
import localFont from "next/font/local";

const paintProFont = localFont({
  src: "../public/fonts/Nunito-VariableFont_wght.ttf",
  variable: "--font-paintpro"
});

export const metadata = {
  title: "PaintPro",
  description: "Field Service and BI System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${paintProFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
