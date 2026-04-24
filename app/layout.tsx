import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner"
import "./globals.css";

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
      <body>
        {children}
        <Toaster
          position="bottom-right"
          closeButton
          toastOptions={{
            className: "pointer-events-auto z-[99999]",
          }}
        />
      </body>
    </html>
  );
}
