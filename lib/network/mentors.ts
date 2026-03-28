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

export type MentorProfileResponse = {
  userId?: string;
  phone?: string;
  displayName?: string;
  photoUrl?: string;
  bio?: string;
  skills?: string[];
  experienceYears?: number;
  verificationStatus?: string;
  approvedAt?: string;
  email?: string;
  location?: string;
  city?: string;
  addressLine?: string;
  rating?: number;
  avgRating?: number;
  reviews?: number;
  reviewCount?: number;
  source?: string;
} & Record<string, unknown>;

export async function getHabitatMentors(habitatId: string) {
  return apiRequest<ApiResponse<MentorProfileResponse[]>>(`/api/habitats/${habitatId}/mentors`, {
    method: "GET"
  });
}
