import { NextResponse } from "next/server";
import { listDriveFiles } from "@/lib/drive";
import { createAdminClient } from "@/lib/supabase";

type ExistingItem = {
  drive_file_id: string;
  file_name: string;
  mime_type: string;
};

export async function POST() {
  try {
    const files = await listDriveFiles();
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("gallery_items")
      .select("drive_file_id, file_name, mime_type");

    if (error) {
      throw error;
    }

    const existing = new Map<string, ExistingItem>(
      (data ?? []).map((row) => [row.drive_file_id as string, row as ExistingItem]),
    );

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

    const newItems = fresh.length;

    return NextResponse.json({ newItems });
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
