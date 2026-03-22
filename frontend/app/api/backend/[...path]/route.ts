import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BACKEND_BASE =
  process.env.BACKEND_INTERNAL_BASE?.trim() ||
  process.env.NEXT_PUBLIC_API_BASE?.trim() ||
  "http://127.0.0.1:8000";

function buildBackendUrl(request: NextRequest, path: string[]) {
  const pathname = path.join("/");
  const search = request.nextUrl.search || "";
  return `${BACKEND_BASE.replace(/\/+$/, "")}/${pathname}${search}`;
}

async function proxy(request: NextRequest, path: string[]) {
  const url = buildBackendUrl(request, path);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: "no-store",
    redirect: "follow",
  };

  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = await request.arrayBuffer();
  }

  try {
    const response = await fetch(url, init);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");
    responseHeaders.set("x-lighttable-proxy", "nextjs");

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        detail: `Backend proxy failed for ${url}: ${reason}`,
      },
      { status: 502 }
    );
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  return proxy(request, path);
}
