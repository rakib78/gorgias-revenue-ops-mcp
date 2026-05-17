/**
 * Gorgias REST API client
 * Auth: Basic {email}:{api_token} (base64)
 * Base: https://{domain}.gorgias.com/api
 */

export interface GorgiasConfig {
  domain: string;   // e.g. "mystore" for mystore.gorgias.com
  email: string;
  apiToken: string;
}

export class GorgiasClient {
  private baseUrl: string;
  private authHeader: string;
  private maxRetries = 3;

  constructor(config: GorgiasConfig) {
    this.baseUrl = `https://${config.domain}.gorgias.com/api`;
    const creds = `${config.email}:${config.apiToken}`;
    this.authHeader = `Basic ${Buffer.from(creds).toString("base64")}`;
  }

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      const res = await fetch(url, {
        ...options,
        headers: {
          Authorization: this.authHeader,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...options.headers,
        },
      });

      // Rate limited
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("Retry-After") ?? "10", 10);
        if (attempt < this.maxRetries) {
          await sleep(retryAfter * 1000);
          attempt++;
          continue;
        }
        throw new GorgiasApiError(
          `Rate limited. Retry after ${retryAfter}s. Gorgias rate limit: 40 req/10s on most plans.`,
          429
        );
      }

      // Transient 5xx
      if (res.status >= 500 && attempt < this.maxRetries) {
        await sleep(exponentialDelay(attempt));
        attempt++;
        continue;
      }

      if (!res.ok) {
        let body: Record<string, unknown> = {};
        try { body = await res.json() as Record<string, unknown>; } catch { /* ignore */ }
        throw new GorgiasApiError(formatError(body, res.status), res.status);
      }

      if (res.status === 204) return {} as T;
      return await res.json() as T;
    }

    throw new GorgiasApiError("Max retries exceeded", 503);
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "GET" });
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: "POST", body: JSON.stringify(body) });
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: "PUT", body: JSON.stringify(body) });
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
  }
}

export class GorgiasApiError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "GorgiasApiError";
  }
}

function formatError(body: Record<string, unknown>, status: number): string {
  const msg = (body.error as string) ?? (body.message as string) ?? "";
  if (status === 401 || status === 403) {
    return `Auth error (${status}): ${msg || "Invalid credentials"}. Check GORGIAS_DOMAIN, GORGIAS_EMAIL, and GORGIAS_API_TOKEN. Ensure the token has the required scopes.`;
  }
  if (status === 404) return `Not found (404): ${msg || "Resource does not exist"}`;
  return `Gorgias API error ${status}: ${msg}`.trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function exponentialDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 30000);
}

export function clientFromEnv(): GorgiasClient {
  const domain = process.env.GORGIAS_DOMAIN;
  const email = process.env.GORGIAS_EMAIL;
  const apiToken = process.env.GORGIAS_API_TOKEN;

  if (!domain || !email || !apiToken) {
    throw new Error(
      "Missing required environment variables: GORGIAS_DOMAIN, GORGIAS_EMAIL, GORGIAS_API_TOKEN"
    );
  }
  return new GorgiasClient({ domain, email, apiToken });
}
