"use client";

import dynamic from "next/dynamic";

const ClientApp = dynamic(() => import("./ClientApp"), { ssr: false, loading: () => <div className="app-loading" aria-label="Loading dashboard" /> });

export default function ClientOnly() {
  return <ClientApp />;
}
