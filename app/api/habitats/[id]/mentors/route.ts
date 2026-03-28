import { NextRequest } from "next/server";
import { proxyJsonRequest } from "@/lib/network/server-proxy";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return proxyJsonRequest(request, {
    path: `/api/habitats/${params.id}/mentors`,
    forwardAuthorization: true
  });
}
