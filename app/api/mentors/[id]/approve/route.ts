import { NextRequest } from "next/server";
import { proxyJsonRequest } from "@/lib/network/server-proxy";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return proxyJsonRequest(request, {
    path: `/api/mentors/${params.id}/approve`,
    forwardAuthorization: true
  });
}
