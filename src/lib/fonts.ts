import { Plus_Jakarta_Sans, Noto_Sans_Arabic } from "next/font/google";

export const fontLatin = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans-latin",
  display: "swap",
});

export const fontArabic = Noto_Sans_Arabic({
  subsets: ["arabic"],
  variable: "--font-sans-arabic",
  display: "swap",
});
