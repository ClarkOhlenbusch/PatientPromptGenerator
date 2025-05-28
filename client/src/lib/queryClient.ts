import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    // Clone the response so we can read it multiple times
    const clonedRes = res.clone();

    try {
      // Try to parse as JSON first (for API errors)
      const errorData = await res.json();
      const message = errorData.message || errorData.error || res.statusText;
      throw new Error(Array.isArray(message) ? message.join(', ') : message);
    } catch (jsonError) {
      // If JSON parsing fails, use the cloned response to read as text
      try {
        const text = await clonedRes.text() || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      } catch (textError) {
        // If both fail, just use status text
        throw new Error(`${res.status}: ${res.statusText}`);
      }
    }
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: { formData?: FormData }
): Promise<Response> {
  // Handle FormData separately from JSON
  const isFormData = options?.formData instanceof FormData;

  const res = await fetch(url, {
    method,
    // Don't set Content-Type for FormData as the browser will set it with the boundary
    headers: data && !isFormData ? { "Content-Type": "application/json" } : {},
    // For FormData, pass the FormData object directly without JSON.stringify
    body: isFormData ? options.formData : data ? JSON.stringify(data) : undefined,
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
    const res = await fetch(queryKey[0] as string, {
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
