import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";

import { makeQueryClient } from "./queryClient";

/** Server state (TanStack Query) and shared UI context for the whole app. */
export function Providers({
  children,
  client,
}: {
  children: ReactNode;
  client?: QueryClient;
}) {
  const [queryClient] = useState(() => client ?? makeQueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}
