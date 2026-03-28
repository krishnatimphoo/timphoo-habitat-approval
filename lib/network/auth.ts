import { apiRequest } from "@/lib/network/api-client";
import {
  getOrCreateDeviceId,
  saveAuthSession,
  type StoredAuthSession
} from "@/lib/network/token-store";

type ApiErrorShape = {
  code?: string;
  message?: string;
};

type ApiResponse<TData> = {
  success?: boolean;
  data?: TData;
  error?: ApiErrorShape;
  message?: string;
};

export type OtpSendResponseData = Record<string, string>;

export type VerifyOtpPayload = {
  phone: string;
  otp: string;
  deviceId?: string;
  userType?: string;
};

export type AuthSessionData = {
  accessToken: string;
  refreshToken?: string;
  userId?: string;
  isNewUser?: boolean;
  userType?: string;
  habitatId?: string;
  deviceId?: string;
};

export type UserProfile = {
  userId?: string;
  habitatId?: string;
  phone?: string;
  email?: string;
  displayName?: string;
  dob?: string;
  dateOfBirth?: string;
  gender?: string;
  userType?: string;
  status?: string;
  phoneVerified?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

function normalizePhone(phone: string) {
  const trimmed = phone.trim();
  const digitsOnly = trimmed.replace(/\D/g, "");
  return trimmed.startsWith("+") ? trimmed : `+91${digitsOnly}`;
}

function toStoredSession(session: AuthSessionData): StoredAuthSession {
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    userId: session.userId,
    userType: session.userType,
    deviceId: session.deviceId
  };
}

export async function sendOtp(phone: string) {
  return apiRequest<ApiResponse<OtpSendResponseData>>("/api/auth/otp/send", {
    method: "POST",
    body: {
      phone: normalizePhone(phone)
    }
  });
}

export async function verifyOtp(payload: VerifyOtpPayload) {
  const deviceId = payload.deviceId ?? getOrCreateDeviceId();
  const response = await apiRequest<ApiResponse<AuthSessionData>>("/api/auth/otp/verify", {
    method: "POST",
    body: {
      phone: normalizePhone(payload.phone),
      otp: payload.otp.trim(),
      deviceId,
      userType: payload.userType ?? "PARENT"
    }
  });

  if (response.data?.accessToken) {
    saveAuthSession(
      toStoredSession({
        ...response.data,
        deviceId: response.data.deviceId ?? deviceId
      })
    );
  }

  return response;
}

export async function getCurrentUser(accessToken?: string) {
  return apiRequest<ApiResponse<UserProfile>>("/api/users/me", {
    method: "GET",
    headers: accessToken
      ? {
          authorization: `Bearer ${accessToken}`
        }
      : undefined
  });
}
