import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * Default PingPoint backend API URL for production
 */
const DEFAULT_PINGPOINT_API_URL = "https://pingpoint.suverse.io";

/**
 * Gets the base URL for the Express API server
 * @returns {string} The API base URL
 */
export function getApiUrl(): string {
  // First check for explicit API URL override
  const apiUrlOverride = process.env.EXPO_PUBLIC_API_URL;
  if (apiUrlOverride) {
    console.log("[API] Using API URL from EXPO_PUBLIC_API_URL:", apiUrlOverride);
    return apiUrlOverride;
  }

  // Check for development domain
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) {
    let apiUrl: string;
    if (domain.includes(":")) {
      apiUrl = `https://${domain}`;
    } else {
      apiUrl = `https://${domain}:5000`;
    }
    console.log("[API] Using domain-based API URL:", apiUrl);
    return apiUrl;
  }

  // Fallback to default PingPoint backend
  console.log("[API] Using default PingPoint API URL:", DEFAULT_PINGPOINT_API_URL);
  return DEFAULT_PINGPOINT_API_URL;
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
