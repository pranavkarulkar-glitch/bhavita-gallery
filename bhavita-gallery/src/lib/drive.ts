import { google } from "googleapis";
import type { Readable } from "node:stream";

const DRIVE_SCOPE = ["https://www.googleapis.com/auth/drive.readonly"];

const FOLDER_MIME = "application/vnd.google-apps.folder";

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  createdTime?: string;
  folderPath: string;
};

export type DriveLibrary = {
  rootName: string;
  files: DriveFile[];
};

function privateKey() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!raw) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  }

  let key = raw.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  return key.replace(/\\n/g, "\n");
}

function normalizedPrivateKey() {
  const key = privateKey();
  if (!key.includes("BEGIN PRIVATE KEY") && !key.includes("BEGIN RSA PRIVATE KEY")) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY must be the PEM private key from the service account JSON, including the BEGIN PRIVATE KEY line.",
    );
  }
  return key;
}

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  if (!email) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL");
  }

  return new google.auth.JWT({
    email,
    key: normalizedPrivateKey(),
    scopes: DRIVE_SCOPE,
  });
}

function getDrive() {
  return google.drive({ version: "v3", auth: getAuth() });
}

function isMedia(mimeType: string) {
  return mimeType.startsWith("image/") || mimeType.startsWith("video/");
}

export async function listDriveFiles(): Promise<DriveLibrary> {
  const problems: string[] = [];
  try {
    normalizedPrivateKey();
  } catch (error) {
    problems.push(error instanceof Error ? error.message : "Invalid Google private key");
  }

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) {
    problems.push("Missing GOOGLE_DRIVE_FOLDER_ID");
  } else if (!/^[a-zA-Z0-9_-]{10,}$/.test(folderId)) {
    problems.push(
      "GOOGLE_DRIVE_FOLDER_ID does not look like a Drive folder id. Use the id from the folder URL.",
    );
  }

  if (problems.length > 0) {
    throw new Error(problems.join(" "));
  }

  const drive = getDrive();
  const root = await drive.files.get({
    fileId: folderId,
    fields: "name",
    supportsAllDrives: true,
  });
  const rootName = root.data.name || "Gallery";
  const files: DriveFile[] = [];
  const pending: { id: string; path: string }[] = [{ id: folderId as string, path: "" }];
  const seenFolders = new Set<string>();

  while (pending.length > 0) {
    const current = pending.shift();
    if (!current || seenFolders.has(current.id)) continue;
    seenFolders.add(current.id);

    const safeFolderId = current.id.replace(/'/g, "\\'");
    let pageToken: string | undefined;

    do {
      const response = await drive.files.list({
        q: `'${safeFolderId}' in parents and trashed = false`,
        fields:
          "nextPageToken, files(id, name, mimeType, thumbnailLink, createdTime)",
        pageSize: 100,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      for (const file of response.data.files ?? []) {
        if (!file.id || !file.name || !file.mimeType) continue;

        if (file.mimeType === FOLDER_MIME) {
          const path = current.path ? `${current.path} / ${file.name}` : file.name;
          pending.push({ id: file.id, path });
          continue;
        }

        if (!isMedia(file.mimeType)) continue;

        files.push({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          thumbnailLink: file.thumbnailLink ?? undefined,
          createdTime: file.createdTime ?? undefined,
          folderPath: current.path,
        });
      }

      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);
  }

  return { rootName, files };
}

export async function getDriveFileMetadata(fileId: string) {
  const response = await getDrive().files.get({
    fileId,
    fields: "id, name, mimeType, thumbnailLink",
    supportsAllDrives: true,
  });

  return response.data;
}

export async function getDriveFileStream(fileId: string, range?: string) {
  const response = await getDrive().files.get(
    {
      fileId,
      alt: "media",
      supportsAllDrives: true,
    },
    {
      responseType: "stream",
      headers: range ? { Range: range } : undefined,
    },
  );

  return {
    stream: response.data as Readable,
    status: response.status,
    headers: response.headers,
  };
}

export async function getDriveThumbnail(fileId: string) {
  const metadata = await getDriveFileMetadata(fileId);
  const thumbnailLink = metadata.thumbnailLink;
  if (!thumbnailLink) return null;

  const sized = thumbnailLink
    .replace(/=w\d+-h\d+(?:-[a-z0-9-]+)*/i, "=s400")
    .replace(/=s\d+(?:-[a-z0-9-]+)*/i, "=s400");
  let image = await fetch(sized);
  if (!image.ok) {
    const accessToken = await getAuth().getAccessToken();
    const bearer =
      typeof accessToken === "string" ? accessToken : accessToken?.token;
    if (bearer) {
      image = await fetch(sized, {
        headers: { Authorization: `Bearer ${bearer}` },
      });
    }
  }

  if (!image.ok) return null;

  return {
    body: image.body,
    contentType: image.headers.get("content-type") ?? "image/jpeg",
  };
}
