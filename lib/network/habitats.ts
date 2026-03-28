import { apiRequest } from "@/lib/network/api-client";

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

export type Habitat = {
  habitatId?: string;
  type?: string;
  name?: string;
  addressLine?: string;
  city?: string;
  state?: string;
  pincode?: string;
  status?: string;
  verificationStatus?: string;
  primaryContactName?: string;
  primaryContactPhone?: string;
  onboardingStatus?: string;
  description?: string;
  approvedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

function normalizeHabitatList(data: Habitat[] | Habitat | undefined) {
  if (Array.isArray(data)) {
    return data;
  }

  return data ? [data] : [];
}

export async function getMyHabitat(accessToken?: string) {
  const response = await apiRequest<ApiResponse<Habitat[] | Habitat>>("/api/habitats/mine", {
    method: "GET",
    headers: accessToken
      ? {
          authorization: `Bearer ${accessToken}`
        }
      : undefined
  });

  return {
    ...response,
    data: normalizeHabitatList(response.data)
  };
}

export async function updateHabitat(habitatId: string, payload: Record<string, unknown>) {
  return apiRequest<ApiResponse<Habitat>>(`/api/habitats/${habitatId}`, {
    method: "PATCH",
    body: payload
  });
}

export async function approveHabitat(habitatId: string) {
  return apiRequest<ApiResponse<Habitat>>(`/api/habitats/${habitatId}/approve`, {
    method: "POST"
  });
}
