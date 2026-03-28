import { NextRequest, NextResponse } from "next/server";
import { getTimphooApiBaseUrl } from "@/lib/network/config";

type ProxyRequestOptions = {
  path: string;
  forwardAuthorization?: boolean;
  forwardHeaders?: string[];
};

function buildTargetUrl(path: string) {
  const baseUrl = getTimphooApiBaseUrl();
  return new URL(path.replace(/^\//, ""), `${baseUrl.replace(/\/+$/, "")}/`);
}

function copyContentType(source: Headers, target: Headers) {
  const contentType = source.get("content-type");
  if (contentType) {
    target.set("content-type", contentType);
  }
}

function copySelectedHeaders(source: Headers, target: Headers, headerNames: string[] = []) {
  for (const headerName of headerNames) {
    const value = source.get(headerName);
    if (value) {
      target.set(headerName, value);
    }
  }
}

export async function proxyJsonRequest(request: NextRequest, options: ProxyRequestOptions) {
  const headers = new Headers({
    accept: "application/json"
  });

  copyContentType(request.headers, headers);

  if (options.forwardAuthorization) {
    const authorization = request.headers.get("authorization");
    if (authorization) {
      headers.set("authorization", authorization);
    }
  }

  copySelectedHeaders(request.headers, headers, options.forwardHeaders);

  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();

  try {
    const response = await fetch(buildTargetUrl(options.path), {
      method: request.method,
      headers,
      body,
      cache: "no-store"
    });

    const responseBody = await response.text();

    return new NextResponse(responseBody, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : "Unable to reach Timphoo API."
        }
      },
      { status: 502 }
    );
  }
}
