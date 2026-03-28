const ACCESS_TOKEN_KEY = "talentgate.auth.accessToken";
const REFRESH_TOKEN_KEY = "talentgate.auth.refreshToken";
const USER_ID_KEY = "talentgate.auth.userId";
const USER_TYPE_KEY = "talentgate.auth.userType";
const DEVICE_ID_KEY = "talentgate.auth.deviceId";
export const AUTH_CHANGED_EVENT = "talentgate.auth.changed";

export type StoredAuthSession = {
  accessToken: string;
  refreshToken?: string | null;
  userId?: string | null;
  userType?: string | null;
  deviceId?: string | null;
};

function canUseStorage() {
  try {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

function emitAuthChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  return atob(padded);
}

function parseJwtPayload(token: string) {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const payloadText = decodeBase64Url(parts[1]);
    return JSON.parse(payloadText) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readJwtExpiryMs(token: string) {
  const payload = parseJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") {
    return null;
  }

  return payload.exp * 1000;
}

export function getAccessTokenState(skewMs = 30_000) {
  const token = getAccessToken();
  if (!token) {
    return { token: null, expired: false };
  }

  const expiryMs = readJwtExpiryMs(token);
  if (expiryMs != null && Date.now() >= expiryMs - skewMs) {
    return { token, expired: true };
  }

  return { token, expired: false };
}

export function saveAuthSession(session: StoredAuthSession) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken);

  if (session.refreshToken) {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
  } else {
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  if (session.userId) {
    window.localStorage.setItem(USER_ID_KEY, session.userId);
  } else {
    window.localStorage.removeItem(USER_ID_KEY);
  }

  if (session.userType) {
    window.localStorage.setItem(USER_TYPE_KEY, session.userType);
  } else {
    window.localStorage.removeItem(USER_TYPE_KEY);
  }

  if (session.deviceId) {
    window.localStorage.setItem(DEVICE_ID_KEY, session.deviceId);
  } else {
    window.localStorage.removeItem(DEVICE_ID_KEY);
  }

  emitAuthChanged();
}

export function clearAuthSession() {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(USER_ID_KEY);
  window.localStorage.removeItem(USER_TYPE_KEY);
  window.localStorage.removeItem(DEVICE_ID_KEY);
  emitAuthChanged();
}

export function getAccessToken() {
  if (!canUseStorage()) {
    return null;
  }

  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getStoredAuthSession(): StoredAuthSession | null {
  if (!canUseStorage()) {
    return null;
  }

  const accessToken = getAccessToken();
  if (!accessToken) {
    return null;
  }

  return {
    accessToken,
    refreshToken: window.localStorage.getItem(REFRESH_TOKEN_KEY),
    userId: window.localStorage.getItem(USER_ID_KEY),
    userType: window.localStorage.getItem(USER_TYPE_KEY),
    deviceId: window.localStorage.getItem(DEVICE_ID_KEY)
  };
}

function createDeviceId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `device-${Math.random().toString(36).slice(2, 12)}-${Date.now().toString(36)}`;
}

export function getOrCreateDeviceId() {
  if (!canUseStorage()) {
    return "web-client";
  }

  const existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }

  const created = createDeviceId();
  window.localStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}
