"use client";

import { useEffect, useState } from "react";

export type GalleryCard = {
  driveFileId: string;
  fileName: string;
  mimeType: string;
  caption: string | null;
  hasThumb: boolean;
};

function fileUrl(id: string, download = false) {
  const path = `/api/file/${encodeURIComponent(id)}`;
  return download ? `${path}?download=true` : path;
}

function isVideo(mimeType: string) {
  return mimeType.startsWith("video/");
}

export type GallerySection = {
  id: string;
  title: string;
  items: GalleryCard[];
};

export function GalleryView({
  sections,
  showSync,
}: {
  sections: GallerySection[];
  showSync: boolean;
}) {
  const [active, setActive] = useState<GalleryCard | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const itemCount = sections.reduce((sum, section) => sum + section.items.length, 0);

  useEffect(() => {
    if (!active) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setActive(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  async function syncGallery() {
    setSyncing(true);
    setSyncMessage("");
    let added = 0;
    let created = 0;
    let failed = 0;
    let total = 0;

    try {
      for (;;) {
        const response = await fetch("/api/sync", { method: "POST" });
        const body = (await response.json().catch(() => null)) as {
          newItems?: number;
          thumbsCreated?: number;
          thumbsFailed?: number;
          remaining?: number;
          error?: string;
        } | null;
        if (!response.ok) {
          setSyncMessage(body?.error ?? "Sync failed");
          return;
        }

        const batchCreated = body?.thumbsCreated ?? 0;
        const batchFailed = body?.thumbsFailed ?? 0;
        const remaining = body?.remaining ?? 0;
        added += body?.newItems ?? 0;
        created += batchCreated;
        failed += batchFailed;

        const done = created + failed;
        if (total === 0) total = done + remaining;

        if (remaining > 0) {
          if (batchCreated === 0 && batchFailed === 0) {
            setSyncMessage("Sync failed");
            return;
          }
          setSyncMessage(`Creating thumbnails… ${done} of ${total} done`);
          continue;
        }

        const newLabel = added === 1 ? "1 new item" : `${added} new items`;
        const createdLabel =
          created === 1 ? "1 thumbnail created" : `${created} thumbnails created`;
        const failedLabel = failed === 1 ? "1 failed" : `${failed} failed`;
        setSyncMessage(`${newLabel}, ${createdLabel}, ${failedLabel}`);
        window.setTimeout(() => window.location.reload(), 1200);
        return;
      }
    } catch {
      setSyncMessage("Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 py-8 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Private</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight text-stone-900">
            Gallery
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            {itemCount === 1 ? "1 item" : `${itemCount} items`}
          </p>
        </div>
        {showSync ? (
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <button
              type="button"
              onClick={syncGallery}
              disabled={syncing}
              className="rounded-full bg-stone-800 px-4 py-2 text-sm font-medium text-stone-50 transition hover:bg-stone-700 disabled:opacity-60"
            >
              {syncing ? "Syncing…" : "Sync Gallery"}
            </button>
            {syncMessage ? (
              <p className="text-sm text-stone-600">{syncMessage}</p>
            ) : null}
          </div>
        ) : null}
      </header>

      {itemCount === 0 ? (
        <p className="mt-16 text-center text-stone-600">
          Nothing here yet. Sync the gallery to pull photos and videos from Drive.
        </p>
      ) : (
        <div className="mt-10 space-y-3">
          {sections.map((section) => (
            <FolderSection
              key={section.id}
              section={section}
              onOpen={setActive}
            />
          ))}
        </div>
      )}

      {active ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/70 p-4"
          role="presentation"
          onClick={() => setActive(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={active.caption || active.fileName}
            className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-3xl bg-stone-50 p-4 shadow-xl sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-medium text-stone-900">
                  {active.caption || active.fileName}
                </h2>
                {active.caption ? (
                  <p className="mt-1 text-sm text-stone-500">{active.fileName}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setActive(null)}
                className="rounded-full px-3 py-1 text-sm text-stone-600 hover:bg-stone-200"
              >
                Close
              </button>
            </div>
            {isVideo(active.mimeType) ? (
              <video
                key={active.driveFileId}
                controls
                playsInline
                preload="metadata"
                className="max-h-[70vh] w-full rounded-2xl bg-black"
                src={fileUrl(active.driveFileId)}
              />
            ) : (
              // Full-size media is always proxied. The Drive URL stays on the server.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={fileUrl(active.driveFileId)}
                alt={active.caption || active.fileName}
                className="max-h-[70vh] w-full rounded-2xl object-contain"
              />
            )}
            <a
              href={fileUrl(active.driveFileId, true)}
              className="mt-4 inline-flex rounded-full bg-stone-800 px-4 py-2 text-sm font-medium text-stone-50 hover:bg-stone-700"
            >
              Download
            </a>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function FolderSection({
  section,
  onOpen,
}: {
  section: GallerySection;
  onOpen: (item: GalleryCard) => void;
}) {
  const [open, setOpen] = useState(false);
  const countLabel =
    section.items.length === 1 ? "1 item" : `${section.items.length} items`;

  return (
    <section className="rounded-2xl bg-white/70 ring-1 ring-stone-200">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
        >
          <span>
            <span className="block text-lg font-medium tracking-tight text-stone-900">
              {section.title}
            </span>
            <span className="mt-0.5 block text-sm text-stone-500">{countLabel}</span>
          </span>
          <span className="text-sm text-stone-500" aria-hidden="true">
            {open ? "Hide" : "Show"}
          </span>
        </button>
      </h2>
      {open ? (
        <ul className="grid grid-cols-4 gap-2 px-4 pb-4 sm:grid-cols-6 sm:gap-3 lg:grid-cols-8">
          {section.items.map((item) => (
            <li key={item.driveFileId}>
              <button
                type="button"
                onClick={() => onOpen(item)}
                className="group w-full text-left"
              >
                <Thumbnail item={item} />
                {item.caption ? (
                  <p className="mt-1 line-clamp-2 text-xs text-stone-600">{item.caption}</p>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Thumbnail({ item }: { item: GalleryCard }) {
  const video = isVideo(item.mimeType);
  const source = item.hasThumb
    ? `/api/thumb/${encodeURIComponent(item.driveFileId)}`
    : "";

  return (
    <span className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-stone-200">
      {source ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={source}
          alt={item.caption || item.fileName}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="max-h-full max-w-full object-contain"
        />
      ) : (
        <span className="flex h-full items-center justify-center text-sm text-stone-500">
          {video ? "Video" : "Photo"}
        </span>
      )}
      {video ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-950/55 text-white">
            <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4 fill-current" aria-hidden="true">
              <path d="M8 5.5v13l11-6.5-11-6.5z" />
            </svg>
          </span>
        </span>
      ) : null}
    </span>
  );
}
