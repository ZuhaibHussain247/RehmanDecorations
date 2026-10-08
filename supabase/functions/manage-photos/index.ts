const OWNER = "RehmanDecorations";
const REPOSITORY = "RehmanDecorations.github.io";
const BRANCH = "main";
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "avif"]);
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};
const CATEGORY_ORDER = [
  "Wedding",
  "Engagement",
  "Mehndi",
  "Room",
  "Birthday",
  "Car",
];
const GITHUB_API = "https://api.github.com";

type TreeEntry = {
  path: string;
  mode: string;
  type: string;
  sha: string;
  size?: number;
};

type Photo = {
  path: string;
  category: string;
  size?: number;
};

function response(
  request: Request,
  body: Record<string, unknown>,
  status = 200,
): Response {
  const origin = request.headers.get("Origin");
  const allowedOrigin = Deno.env.get("ADMIN_ALLOWED_ORIGIN");
  const headers = new Headers({
    "Content-Type": "application/json",
    "Vary": "Origin",
  });

  if (origin && origin === allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set(
      "Access-Control-Allow-Headers",
      "authorization, apikey, content-type, x-client-info",
    );
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Max-Age", "86400");
  }

  return new Response(JSON.stringify(body), { status, headers });
}

function requiredSecret(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Server configuration is missing ${name}.`);
  return value;
}

async function github(
  path: string,
  init: RequestInit = {},
): Promise<Record<string, any>> {
  const token = requiredSecret("GITHUB_TOKEN");
  const result = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  const resultBody = await result.json().catch(() => ({}));
  if (!result.ok) {
    const message =
      typeof resultBody.message === "string"
        ? resultBody.message
        : `GitHub API returned ${result.status}.`;
    throw new Error(`GitHub: ${message}`);
  }
  return resultBody;
}

async function authenticate(request: Request): Promise<string> {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    throw new Error("Please sign in to manage photos.");
  }

  const projectUrl = requiredSecret("SUPABASE_URL");
  const publishableKey = requiredSecret("SUPABASE_ANON_KEY");
  const userResponse = await fetch(`${projectUrl}/auth/v1/user`, {
    headers: {
      apikey: publishableKey,
      Authorization: authorization,
    },
  });

  if (!userResponse.ok) {
    throw new Error("Your sign-in has expired. Please sign in again.");
  }

  const user = await userResponse.json();
  const adminEmail = requiredSecret("ADMIN_EMAIL").trim().toLowerCase();
  if (
    !user.email ||
    user.email.toLowerCase() !== adminEmail ||
    user.email_confirmed_at == null
  ) {
    throw new Error("This account is not authorized to manage website photos.");
  }
  return user.email;
}

async function currentTree(): Promise<{
  commitSha: string;
  treeSha: string;
  entries: TreeEntry[];
}> {
  const ref = await github(
    `/repos/${OWNER}/${REPOSITORY}/git/ref/heads/${BRANCH}`,
  );
  const commit = await github(
    `/repos/${OWNER}/${REPOSITORY}/git/commits/${ref.object.sha}`,
  );
  const tree = await github(
    `/repos/${OWNER}/${REPOSITORY}/git/trees/${commit.tree.sha}?recursive=1`,
  );

  if (tree.truncated) {
    throw new Error("The repository image list is too large to manage safely.");
  }

  return {
    commitSha: ref.object.sha,
    treeSha: commit.tree.sha,
    entries: tree.tree as TreeEntry[],
  };
}

function decodeBase64Utf8(value: string): string {
  const bytes = Uint8Array.from(atob(value.replace(/\s/g, "")), (char) =>
    char.charCodeAt(0)
  );
  return new TextDecoder().decode(bytes);
}

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function readSiteConfig(): Promise<Record<string, any>> {
  const result = await github(
    `/repos/${OWNER}/${REPOSITORY}/contents/site-images.json?ref=${BRANCH}`,
  );
  if (result.encoding !== "base64" || typeof result.content !== "string") {
    throw new Error("Could not read site-images.json from the repository.");
  }
  return JSON.parse(decodeBase64Utf8(result.content));
}

function extension(path: string): string | null {
  const match = path.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match && IMAGE_EXTENSIONS.has(match[1]) ? match[1] : null;
}

function galleryCategory(
  path: string,
  config: Record<string, any>,
): string | null {
  for (const [key, settings] of Object.entries(config.gallery || {})) {
    const folder = (settings as Record<string, any>).folder;
    if (
      typeof folder === "string" &&
      path.startsWith(`images/${folder}/`) &&
      extension(path)
    ) {
      return CATEGORY_ORDER.find(
        (category) => category.toLowerCase() === key.toLowerCase(),
      ) || key;
    }
  }
  return null;
}

function photoList(entries: TreeEntry[], config: Record<string, any>): Photo[] {
  return entries
    .filter((entry) => entry.type === "blob" && extension(entry.path))
    .map((entry) => {
      const category =
        galleryCategory(entry.path, config) ??
        (/^images\/logo\./i.test(entry.path)
          ? "logo"
          : /^images\/Shahid\./i.test(entry.path)
          ? "hero"
          : "Other");
      return { path: entry.path, category, size: entry.size };
    })
    .filter((photo) => photo.category !== "Other")
    .sort((a, b) => a.path.localeCompare(b.path));
}

function categoryPaths(
  entries: TreeEntry[],
  config: Record<string, any>,
  category: string,
  excludedPath?: string,
): string[] {
  return entries
    .filter(
      (entry) =>
        entry.path !== excludedPath &&
        entry.type === "blob" &&
        galleryCategory(entry.path, config) === category,
    )
    .map((entry) => entry.path)
    .sort((a, b) => {
      const settings = config.gallery[category.toLowerCase()];
      const expression = new RegExp(
        `^images/${settings.folder}/${settings.prefix}-(\\d+)\\.`,
        "i",
      );
      const left = Number(a.match(expression)?.[1] || 0);
      const right = Number(b.match(expression)?.[1] || 0);
      return left - right || a.localeCompare(b);
    });
}

function nextImagePath(
  entries: TreeEntry[],
  category: string,
  config: Record<string, any>,
  fileExtension: string,
): string {
  const settings = config.gallery[category.toLowerCase()];
  const expression = new RegExp(
    `^images/${settings.folder}/${settings.prefix}-(\\d+)\\.`,
    "i",
  );
  const highest = entries.reduce((maximum, entry) => {
    if (galleryCategory(entry.path, config) !== category) return maximum;
    return Math.max(maximum, Number(entry.path.match(expression)?.[1] || 0));
  }, 0);
  return `images/${settings.folder}/${settings.prefix}-${highest + 1}.${fileExtension}`;
}

async function createBlob(content: string): Promise<string> {
  const blob = await github(
    `/repos/${OWNER}/${REPOSITORY}/git/blobs`,
    {
      method: "POST",
      body: JSON.stringify({ content, encoding: "base64" }),
    },
  );
  return blob.sha;
}

async function commitChanges(
  current: { commitSha: string; treeSha: string },
  changes: Array<{ path: string; sha: string | null; mode?: string }>,
  message: string,
): Promise<void> {
  const tree = await github(
    `/repos/${OWNER}/${REPOSITORY}/git/trees`,
    {
      method: "POST",
      body: JSON.stringify({
        base_tree: current.treeSha,
        tree: changes.map((change) => ({
          path: change.path,
          mode: change.mode || "100644",
          type: "blob",
          sha: change.sha,
        })),
      }),
    },
  );
  const commit = await github(
    `/repos/${OWNER}/${REPOSITORY}/git/commits`,
    {
      method: "POST",
      body: JSON.stringify({
        message,
        tree: tree.sha,
        parents: [current.commitSha],
      }),
    },
  );
  await github(
    `/repos/${OWNER}/${REPOSITORY}/git/refs/heads/${BRANCH}`,
    {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false }),
    },
  );
}

function updateGalleryConfig(
  config: Record<string, any>,
  category: string,
  images: string[],
): void {
  const key = category.toLowerCase();
  const settings = config.gallery[key];
  settings.images = images;
  settings.count = images.length;
}

function fallbackReference(
  config: Record<string, any>,
  key: string,
  paths: string[],
): void {
  const current = config.home[key];
  if (!paths.includes(current)) config.home[key] = paths[0] || null;
}

async function runAction(
  body: Record<string, any>,
): Promise<Record<string, unknown>> {
  const current = await currentTree();
  const config = await readSiteConfig();
  const entries = current.entries;

  if (body.action === "list") {
    return { photos: photoList(entries, config) };
  }

  if (body.action === "upload") {
    const mimeType = body.contentType;
    const fileExtension = MIME_EXTENSIONS[mimeType];
    if (!fileExtension || !IMAGE_EXTENSIONS.has(fileExtension)) {
      throw new Error("Use a JPEG, PNG, WebP, or AVIF image.");
    }
    if (
      typeof body.content !== "string" ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        body.content,
      ) ||
      body.content.length === 0
    ) {
      throw new Error("The selected image data is invalid.");
    }
    const padding =
      body.content.endsWith("==") ? 2 : body.content.endsWith("=") ? 1 : 0;
    const byteLength = body.content.length / 4 * 3 - padding;
    if (byteLength > 8 * 1024 * 1024) {
      throw new Error("Choose an image smaller than 8 MB.");
    }

    const category = body.category;
    let path: string;
    const changes: Array<{ path: string; sha: string | null }> = [];

    if (category === "logo" || category === "hero") {
      const prefix = category === "logo" ? "images/logo." : "images/Shahid.";
      path = `${prefix}${fileExtension}`;
      for (const entry of entries) {
        if (
          entry.path.toLowerCase().startsWith(prefix.toLowerCase()) &&
          entry.path !== path
        ) {
          changes.push({ path: entry.path, sha: null });
        }
      }
    } else if (CATEGORY_ORDER.includes(category)) {
      path = nextImagePath(entries, category, config, fileExtension);
    } else {
      throw new Error("Choose a supported photo category.");
    }

    const imageSha = await createBlob(body.content);
    changes.push({ path, sha: imageSha });

    if (category === "logo") {
      config.brand = { ...(config.brand || {}), logo: path };
    } else if (category === "hero") {
      config.home.hero = path;
      config.about.main = path;
    } else {
      const images = categoryPaths(entries, config, category);
      updateGalleryConfig(config, category, [...images, path]);
    }

    const configSha = await createBlob(
      encodeBase64Utf8(`${JSON.stringify(config, null, 2)}\n`),
    );
    changes.push({ path: "site-images.json", sha: configSha });

    await commitChanges(
      current,
      changes,
      `Add ${category} photo ${path.split("/").pop()}`,
    );

    const updatedTree = await currentTree();
    const updatedConfig = await readSiteConfig();
    return {
      path,
      photos: photoList(updatedTree.entries, updatedConfig),
    };
  }

  if (body.action === "delete") {
    const path = body.path;
    if (
      typeof path !== "string" ||
      !/^images\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+\.(jpe?g|png|webp|avif)$/i.test(
        path,
      ) &&
        !/^images\/(?:logo|Shahid)\.(jpe?g|png|webp|avif)$/i.test(path)
    ) {
      throw new Error("That image path cannot be removed.");
    }
    if (!entries.some((entry) => entry.path === path && entry.type === "blob")) {
      throw new Error("That image no longer exists; refresh the photo list.");
    }

    const category = galleryCategory(path, config);
    const changes: Array<{ path: string; sha: string | null }> = [
      { path, sha: null },
    ];

    if (category) {
      const images = categoryPaths(entries, config, category, path);
      updateGalleryConfig(config, category, images);
      if (category.toLowerCase() === "wedding") {
        if (config.about.main === path) config.about.main = images[0] || null;
      }
      if (category.toLowerCase() === "wedding") {
        fallbackReference(config, "stage", images);
      } else if (category.toLowerCase() === "room") {
        fallbackReference(config, "room", images);
      } else if (category.toLowerCase() === "car") {
        fallbackReference(config, "car", images);
      }
    } else if (/^images\/logo\./i.test(path)) {
      config.brand = { ...(config.brand || {}), logo: null };
    } else if (/^images\/Shahid\./i.test(path)) {
      config.home.hero = null;
      config.about.main = null;
    }

    const configSha = await createBlob(
      encodeBase64Utf8(`${JSON.stringify(config, null, 2)}\n`),
    );
    changes.push({ path: "site-images.json", sha: configSha });

    await commitChanges(
      current,
      changes,
      `Remove photo ${path.split("/").pop()}`,
    );

    const updatedTree = await currentTree();
    const updatedConfig = await readSiteConfig();
    return { photos: photoList(updatedTree.entries, updatedConfig) };
  }

  throw new Error("Unknown photo management action.");
}

Deno.serve(async (request: Request) => {
  const allowedOrigin = Deno.env.get("ADMIN_ALLOWED_ORIGIN");
  const origin = request.headers.get("Origin");

  if (request.method === "OPTIONS") {
    if (!origin || origin !== allowedOrigin) {
      return response(request, { error: "Origin is not allowed." }, 403);
    }
    return response(request, {});
  }

  if (request.method !== "POST") {
    return response(request, { error: "Method not allowed." }, 405);
  }

  if (origin && origin !== allowedOrigin) {
    return response(request, { error: "Origin is not allowed." }, 403);
  }

  try {
    await authenticate(request);
    const body = await request.json();
    const result = await runAction(body);
    return response(request, result);
  } catch (error) {
    console.error("Photo admin request failed:", error);
    const message =
      error instanceof Error ? error.message : "Photo management failed.";
    const status = /sign in|authorized|expired/i.test(message) ? 401 : 400;
    return response(request, { error: message }, status);
  }
});
