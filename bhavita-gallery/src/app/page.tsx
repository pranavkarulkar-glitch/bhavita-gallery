import { headers } from "next/headers";
import { listDriveFiles } from "@/lib/drive";
import { createAdminClient } from "@/lib/supabase";
import { GalleryView, type GalleryCard } from "./gallery-view";

export const dynamic = "force-dynamic";

type GalleryRow = {
  drive_file_id: string;
  file_name: string;
  mime_type: string;
  caption: string | null;
  display_order: number | null;
  created_at: string;
};

function largerThumbnail(url: string) {
  return url.replace(/=s\d+/, "=s800");
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ admin?: string }>;
}) {
  const { admin } = await searchParams;
  const headerList = await headers();
  const supabase = createAdminClient();

  const { error: logError } = await supabase.from("gallery_access_log").insert({
    user_agent: headerList.get("user-agent") ?? "unknown",
  });
  if (logError) {
    console.error("Failed to log gallery access", logError);
  }

  const { data, error } = await supabase
    .from("gallery_items")
    .select("drive_file_id, file_name, mime_type, caption, display_order, created_at")
    .eq("hidden", false)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  let thumbnails = new Map<string, string>();
  try {
    const driveFiles = await listDriveFiles();
    thumbnails = new Map(
      driveFiles
        .filter((file) => file.thumbnailLink)
        .map((file) => [file.id, largerThumbnail(file.thumbnailLink as string)]),
    );
  } catch (driveError) {
    console.error("Failed to load Drive thumbnails", driveError);
  }

  const items: GalleryCard[] = ((data ?? []) as GalleryRow[]).map((item) => ({
    driveFileId: item.drive_file_id,
    fileName: item.file_name,
    mimeType: item.mime_type,
    caption: item.caption,
    thumbnailLink: thumbnails.get(item.drive_file_id) ?? null,
  }));

  return <GalleryView items={items} showSync={admin === "true"} />;
}
