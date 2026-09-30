import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE, isValidSessionToken } from "@/lib/auth";
import { getDriveThumbnail } from "@/lib/drive";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

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
    .select("hidden")
    .eq("drive_file_id", id)
    .maybeSingle();

  if (error || !data || data.hidden) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const thumbnail = await getDriveThumbnail(id);
    if (!thumbnail?.body) {
      return NextResponse.json({ error: "No thumbnail" }, { status: 404 });
    }

    return new Response(thumbnail.body, {
      headers: {
        "Content-Type": thumbnail.contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (thumbnailError) {
    console.error("Failed to load thumbnail", thumbnailError);
    return NextResponse.json({ error: "Could not load thumbnail" }, { status: 502 });
  }
}
