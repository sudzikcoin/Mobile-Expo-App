import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * Gets the base URL for the Express API server (e.g., "http://localhost:5000")
 * @returns {string} The API base URL
 */
export function getApiUrl(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;

  if (!domain) {
    console.warn("[API] EXPO_PUBLIC_DOMAIN not set, using localhost:5000");
    return "http://localhost:5000";
  }

  // EXPO_PUBLIC_DOMAIN is set as "domain:5000" - keep the port for external access
  // On Replit, external port 5000 routes to the backend server
  let apiUrl: string;
  
  if (domain.includes(":")) {
    // Port is included (e.g., "domain:5000")
    apiUrl = `https://${domain}`;
  } else {
    // No port, add default backend port
    apiUrl = `https://${domain}:5000`;
  }
  
  console.log("[API] Using API URL:", apiUrl);
  
  return apiUrl;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
