import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE, isValidSessionToken } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const THUMB_BUCKET = "gallery-thumbs";

export async function GET(
  _request: Request,
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
    .select("thumb_path, hidden")
    .eq("drive_file_id", id)
    .maybeSingle();

  if (error || !data || data.hidden || !data.thumb_path) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: file, error: downloadError } = await supabase.storage
    .from(THUMB_BUCKET)
    .download(data.thumb_path as string);

  if (downloadError || !file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new Response(await file.arrayBuffer(), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
