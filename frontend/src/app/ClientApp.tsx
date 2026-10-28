"use client";

import { COOKIE_NAME, UNAUTHED_ERR_MSG } from "@shared/const";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import superjson from "superjson";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";
import App from "@/App";
import { useState } from "react";

export default function ClientApp() {
  const [queryClient] = useState(() => {
    return new QueryClient({
      defaultOptions: {
        queries: {
          retry: (failureCount, error) => {
            if (error instanceof TRPCClientError && (error.data?.code === "UNAUTHORIZED" || error.data?.code === "FORBIDDEN")) {
              return false;
            }
            return failureCount < 2;
          },
        },
      },
    });
  });
  const [trpcClient] = useState(() => trpc.createClient({ links: [httpBatchLink({ url: "/api/trpc", transformer: superjson, headers() { try { const raw = sessionStorage.getItem("manus-cookie"); const prefix = `${COOKIE_NAME}=`; const pair = raw?.split(";").find((value) => value.trim().startsWith(prefix)); const token = pair?.trim().slice(prefix.length); return token ? { Authorization: `Bearer ${token}` } : {}; } catch { return {}; } }, fetch(input, init) { return globalThis.fetch(input, { ...(init ?? {}), credentials: "include" }); } })] }));
  return <trpc.Provider client={trpcClient} queryClient={queryClient}><QueryClientProvider client={queryClient}><App /></QueryClientProvider></trpc.Provider>;
}
