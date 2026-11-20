import type { Metadata } from "next";
import "@/index.css";

export const metadata: Metadata = {
  title: "Nexcore | Consulting Operations Workspace",
  description: "Manage consultant capacity, project delivery, timesheets, approvals, and retainer operations in one workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
