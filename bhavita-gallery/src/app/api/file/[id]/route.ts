import { Readable } from "node:stream";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE, isValidSessionToken } from "@/lib/auth";
import { getDriveFileMetadata, getDriveFileStream } from "@/lib/drive";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function headerValue(headers: unknown, name: string) {
  if (!headers || typeof headers !== "object") return undefined;

  const withGet = headers as { get?: (header: string) => unknown };
  if (typeof withGet.get === "function") {
    const value = withGet.get(name);
    if (typeof value === "string" && value) return value;
    if (typeof value === "number") return String(value);
  }

  const record = headers as Record<string, unknown>;
  const value = record[name];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function safeFilename(name: string) {
  const cleaned = name.replace(/[\r\n"]/g, "").trim() || "download";
  return cleaned;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  if (!isValidSessionToken(token, process.env.GALLERY_PASSWORD)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("gallery_items")
    .select("file_name, mime_type, hidden")
    .eq("drive_file_id", id)
    .maybeSingle();

  if (error || !data || data.hidden) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let mimeType = data.mime_type as string;
  let fileName = data.file_name as string;

  try {
    if (!mimeType || !fileName) {
      const metadata = await getDriveFileMetadata(id);
      mimeType = metadata.mimeType ?? "application/octet-stream";
      fileName = metadata.name ?? fileName ?? "download";
    }

    const range = request.headers.get("range") ?? undefined;
    const file = await getDriveFileStream(id, range);
    const download = new URL(request.url).searchParams.get("download") === "true";
    const filename = safeFilename(fileName);
    const headers = new Headers();
    headers.set("Content-Type", mimeType || "application/octet-stream");
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "private");
    headers.set(
      "Content-Disposition",
      `${download ? "attachment" : "inline"}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );

    const contentLength = headerValue(file.headers, "content-length");
    const contentRange = headerValue(file.headers, "content-range");
    if (contentLength) headers.set("Content-Length", contentLength);
    if (contentRange) headers.set("Content-Range", contentRange);

    request.signal.addEventListener("abort", () => {
      file.stream.destroy();
    });

    const webStream = Readable.toWeb(file.stream) as ReadableStream;
    return new Response(webStream, {
      status: file.status,
      headers,
    });
  } catch (streamError) {
    console.error("Failed to stream Drive file", streamError);
    return NextResponse.json({ error: "Could not load file" }, { status: 502 });
  }
}
