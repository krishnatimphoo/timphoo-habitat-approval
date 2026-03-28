import {
  getAccessTokenState,
  getOrCreateDeviceId,
  getStoredAuthSession,
  saveAuthSession
} from "@/lib/network/token-store";

type PrimitiveBody = BodyInit | null | undefined;
type JsonValue = Record<string, unknown> | Array<unknown>;
type ApiRequestInit = Omit<RequestInit, "body"> & {
  body?: JsonValue | PrimitiveBody;
  skipAuthRetry?: boolean;
};

type AuthSessionPayload = {
  accessToken: string;
  refreshToken?: string;
  userId?: string;
  userType?: string;
  deviceId?: string;
};

const AUTH_REFRESH_PATH = "/api/auth/refresh";
let refreshRequestInFlight: Promise<string | null> | null = null;

export class ApiClientError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.payload = payload;
  }
}

function shouldAttachAccessToken(path: string) {
  return !path.startsWith("/api/auth/");
}

function toRequestBody(body: JsonValue | PrimitiveBody) {
  if (
    body == null ||
    typeof body === "string" ||
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof URLSearchParams ||
    body instanceof ArrayBuffer
  ) {
    return body;
  }

  return JSON.stringify(body);
}

function extractErrorMessage(payload: unknown, fallbackMessage: string) {
  if (typeof payload !== "object" || payload === null) {
    return fallbackMessage;
  }

  const message =
    ("error" in payload &&
      typeof payload.error === "object" &&
      payload.error !== null &&
      "message" in payload.error &&
      typeof payload.error.message === "string" &&
      payload.error.message) ||
    ("message" in payload && typeof payload.message === "string" && payload.message);

  return message || fallbackMessage;
}

function toObject(value: unknown) {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function extractAuthSession(payload: unknown): AuthSessionPayload | null {
  const outer = toObject(payload);
  if (!outer) {
    return null;
  }

  const nestedData = "data" in outer ? toObject(outer.data) : null;
  const source = nestedData ?? outer;
  const rawAccessToken = source.accessToken ?? source.access_token;

  if (typeof rawAccessToken !== "string" || !rawAccessToken.trim()) {
    return null;
  }

  const rawRefreshToken = source.refreshToken ?? source.refresh_token;
  const rawUserId = source.userId ?? source.user_id;
  const rawUserType = source.userType ?? source.user_type;
  const rawDeviceId = source.deviceId ?? source.device_id;

  return {
    accessToken: rawAccessToken,
    refreshToken: typeof rawRefreshToken === "string" ? rawRefreshToken : undefined,
    userId: typeof rawUserId === "string" ? rawUserId : undefined,
    userType: typeof rawUserType === "string" ? rawUserType : undefined,
    deviceId: typeof rawDeviceId === "string" ? rawDeviceId : undefined
  };
}

async function parseResponseBody(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function refreshAccessToken() {
  if (refreshRequestInFlight) {
    return refreshRequestInFlight;
  }

  refreshRequestInFlight = (async () => {
    const session = getStoredAuthSession();
    const refreshToken = session?.refreshToken;
    const deviceId = session?.deviceId || getOrCreateDeviceId();

    if (!refreshToken) {
      return null;
    }

    try {
      const response = await fetch(AUTH_REFRESH_PATH, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-refresh-token": refreshToken,
          "x-device-id": deviceId
        },
        cache: "no-store"
      });

      const payload = await parseResponseBody(response);
      if (!response.ok) {
        return null;
      }

      const refreshedSession = extractAuthSession(payload);
      if (!refreshedSession?.accessToken) {
        return null;
      }

      saveAuthSession({
        accessToken: refreshedSession.accessToken,
        refreshToken: refreshedSession.refreshToken ?? refreshToken,
        userId: refreshedSession.userId ?? session?.userId,
        userType: refreshedSession.userType ?? session?.userType,
        deviceId: refreshedSession.deviceId ?? deviceId
      });

      return refreshedSession.accessToken;
    } catch {
      return null;
    }
  })().finally(() => {
    refreshRequestInFlight = null;
  });

  return refreshRequestInFlight;
}

export async function apiRequest<TResponse>(
  path: string,
  init: ApiRequestInit = {}
) {
  const { skipAuthRetry = false, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);
  const body = toRequestBody(requestInit.body);

  if (body && !(body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  if (shouldAttachAccessToken(path) && !headers.has("authorization")) {
    const { token: accessToken, expired } = getAccessTokenState();
    if (accessToken && !expired) {
      headers.set("authorization", `Bearer ${accessToken}`);
    } else if (expired) {
      const refreshedAccessToken = await refreshAccessToken();
      if (refreshedAccessToken) {
        headers.set("authorization", `Bearer ${refreshedAccessToken}`);
      }
    }
  }

  const response = await fetch(path, {
    ...requestInit,
    headers,
    body,
    cache: "no-store"
  });

  const payload = await parseResponseBody(response);

  if (response.status === 401 && shouldAttachAccessToken(path) && !skipAuthRetry) {
    const refreshedAccessToken = await refreshAccessToken();
    if (refreshedAccessToken) {
      const retryHeaders = new Headers(requestInit.headers);
      if (body && !(body instanceof FormData) && !retryHeaders.has("content-type")) {
        retryHeaders.set("content-type", "application/json");
      }
      retryHeaders.set("authorization", `Bearer ${refreshedAccessToken}`);

      const retryResponse = await fetch(path, {
        ...requestInit,
        headers: retryHeaders,
        body,
        cache: "no-store"
      });

      const retryPayload = await parseResponseBody(retryResponse);
      if (!retryResponse.ok) {
        throw new ApiClientError(
          extractErrorMessage(retryPayload, `Request failed with status ${retryResponse.status}.`),
          retryResponse.status,
          retryPayload
        );
      }

      return retryPayload as TResponse;
    }
  }

  if (!response.ok) {
    throw new ApiClientError(
      extractErrorMessage(payload, `Request failed with status ${response.status}.`),
      response.status,
      payload
    );
  }

  return payload as TResponse;
}
