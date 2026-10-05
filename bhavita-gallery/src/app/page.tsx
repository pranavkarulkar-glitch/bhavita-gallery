import { headers } from "next/headers";
import { listDriveFiles } from "@/lib/drive";
import { createAdminClient } from "@/lib/supabase";
import { GalleryView, type GallerySection } from "./gallery-view";

export const dynamic = "force-dynamic";

type GalleryRow = {
  drive_file_id: string;
  file_name: string;
  mime_type: string;
  caption: string | null;
  display_order: number | null;
  created_at: string;
  thumb_path: string | null;
};

function toCard(item: GalleryRow) {
  return {
    driveFileId: item.drive_file_id,
    fileName: item.file_name,
    mimeType: item.mime_type,
    caption: item.caption,
    hasThumb: Boolean(item.thumb_path),
  };
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
    .select(
      "drive_file_id, file_name, mime_type, caption, display_order, created_at, thumb_path",
    )
    .eq("hidden", false)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as GalleryRow[];
  let sections: GallerySection[] = [
    {
      id: "root",
      title: "Gallery",
      items: rows.map((item) => toCard(item)),
    },
  ];

  try {
    const library = await listDriveFiles();
    const driveById = new Map(library.files.map((file) => [file.id, file]));
    const grouped = new Map<string, GallerySection>();

    for (const item of rows) {
      const driveFile = driveById.get(item.drive_file_id);
      if (!driveFile) continue;

      const sectionId = driveFile.folderPath || "root";
      const section = grouped.get(sectionId) ?? {
        id: sectionId,
        title: driveFile.folderPath || library.rootName,
        items: [],
      };
      section.items.push(toCard(item));
      grouped.set(sectionId, section);
    }

    sections = [...grouped.values()].sort((left, right) => {
      if (left.id === "root") return -1;
      if (right.id === "root") return 1;
      return left.title.localeCompare(right.title);
    });
  } catch (driveError) {
    console.warn(
      driveError instanceof Error ? driveError.message : "Failed to load Drive folders",
    );
  }

  if (sections.length === 1 && sections[0].items.length === 0) {
    sections = [];
  }

  return <GalleryView sections={sections} showSync={admin === "true"} />;
}
