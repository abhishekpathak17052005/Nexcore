import type { Metadata } from "next";
import "@/index.css";

export const metadata: Metadata = {
  title: "Nexcore | Consultant Utilization & Billing Dashboard",
  description: "Nexcore enterprise consultant capacity, time tracking, utilization, and billing operations.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
