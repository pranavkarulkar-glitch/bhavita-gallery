import { NextResponse } from "next/server";
import { getDriveAccessToken, listDriveFiles, type DriveFile } from "@/lib/drive";
import { createAdminClient } from "@/lib/supabase";

export const maxDuration = 60;

const THUMB_BUCKET = "gallery-thumbs";
const THUMB_BATCH = 25;

type ExistingItem = {
  drive_file_id: string;
  file_name: string;
  mime_type: string;
  thumb_path: string | null;
};

function thumbObjectPath(driveFileId: string) {
  return `thumbs/${driveFileId}.jpg`;
}

function sizedThumbnailUrl(url: string) {
  return url.replace(/=s\d+$/, "=s400");
}

async function fetchThumbnailBytes(thumbnailLink: string) {
  const sized = sizedThumbnailUrl(thumbnailLink);
  let image = await fetch(sized);
  if (image.status === 401 || image.status === 403) {
    const bearer = await getDriveAccessToken();
    if (bearer) {
      image = await fetch(sized, {
        headers: { Authorization: `Bearer ${bearer}` },
      });
    }
  }
  if (!image.ok) {
    throw new Error(`Thumbnail fetch failed (${image.status})`);
  }
  return new Uint8Array(await image.arrayBuffer());
}

export async function POST() {
  try {
    const { files } = await listDriveFiles();
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("gallery_items")
      .select("drive_file_id, file_name, mime_type, thumb_path");

    if (error) {
      throw error;
    }

    const existing = new Map<string, ExistingItem>(
      (data ?? []).map((row) => [row.drive_file_id as string, row as ExistingItem]),
    );
    const driveById = new Map<string, DriveFile>(files.map((file) => [file.id, file]));

    const fresh = files.filter((file) => !existing.has(file.id));
    if (fresh.length > 0) {
      const { error: insertError } = await supabase.from("gallery_items").insert(
        fresh.map((file) => ({
          drive_file_id: file.id,
          file_name: file.name,
          mime_type: file.mimeType,
          hidden: false,
          display_order: 0,
        })),
      );
      if (insertError) throw insertError;
    }

    for (const file of files) {
      const current = existing.get(file.id);
      if (!current) continue;
      if (current.file_name === file.name && current.mime_type === file.mimeType) {
        continue;
      }

      const { error: updateError } = await supabase
        .from("gallery_items")
        .update({
          file_name: file.name,
          mime_type: file.mimeType,
        })
        .eq("drive_file_id", file.id);
      if (updateError) throw updateError;
    }

    if (files.length > 0) {
      const seen = new Set(files.map((file) => file.id));
      const stale = [...existing.keys()].filter((id) => !seen.has(id));
      for (let index = 0; index < stale.length; index += 100) {
        const chunk = stale.slice(index, index + 100);
        const { error: storageError } = await supabase.storage
          .from(THUMB_BUCKET)
          .remove(chunk.map((id) => thumbObjectPath(id)));
        if (storageError) throw storageError;

        const { error: deleteError } = await supabase
          .from("gallery_items")
          .delete()
          .in("drive_file_id", chunk);
        if (deleteError) throw deleteError;
      }
    }

    const { data: pending, error: pendingError } = await supabase
      .from("gallery_items")
      .select("drive_file_id")
      .is("thumb_path", null)
      .eq("thumb_failed", false)
      .limit(THUMB_BATCH);

    if (pendingError) throw pendingError;

    let thumbsCreated = 0;
    let thumbsFailed = 0;

    for (const row of pending ?? []) {
      const driveFileId = row.drive_file_id as string;
      const driveFile = driveById.get(driveFileId);
      const thumbnailLink = driveFile?.thumbnailLink;
      if (!driveFile || !thumbnailLink) {
        if (!driveFile && files.length === 0) continue;
        const { error: failError } = await supabase
          .from("gallery_items")
          .update({ thumb_failed: true })
          .eq("drive_file_id", driveFileId);
        if (failError) throw failError;
        thumbsFailed += 1;
        continue;
      }

      try {
        const bytes = await fetchThumbnailBytes(thumbnailLink);
        const path = thumbObjectPath(driveFileId);
        const { error: uploadError } = await supabase.storage
          .from(THUMB_BUCKET)
          .upload(path, bytes, {
            contentType: "image/jpeg",
            upsert: true,
          });
        if (uploadError) throw uploadError;

        const { error: pathError } = await supabase
          .from("gallery_items")
          .update({ thumb_path: path, thumb_failed: false })
          .eq("drive_file_id", driveFileId);
        if (pathError) throw pathError;
        thumbsCreated += 1;
      } catch (thumbError) {
        console.error("Thumbnail copy failed", driveFileId, thumbError);
        const { error: failError } = await supabase
          .from("gallery_items")
          .update({ thumb_failed: true })
          .eq("drive_file_id", driveFileId);
        if (failError) throw failError;
        thumbsFailed += 1;
      }
    }

    const { count, error: countError } = await supabase
      .from("gallery_items")
      .select("drive_file_id", { count: "exact", head: true })
      .is("thumb_path", null)
      .eq("thumb_failed", false);

    if (countError) throw countError;

    return NextResponse.json({
      newItems: fresh.length,
      thumbsCreated,
      thumbsFailed,
      remaining: count ?? 0,
    });
  } catch (error) {
    console.error("Gallery sync failed", error);
    const message = error instanceof Error ? error.message : "";
    const safe =
      message.startsWith("Missing ") || message.startsWith("GOOGLE_")
        ? message
        : "Could not sync gallery";
    return NextResponse.json({ error: safe }, { status: 500 });
  }
}
