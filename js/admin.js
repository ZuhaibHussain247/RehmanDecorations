import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://uyctrdiarleevrwrawph.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_Lk8C2OZc_PH6-aqaDzC9pg_lZbneRza";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_COMPRESSED_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1920;

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const loginPanel = document.getElementById("loginPanel");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("loginForm");
const uploadForm = document.getElementById("uploadForm");
const loginStatus = document.getElementById("loginStatus");
const uploadStatus = document.getElementById("uploadStatus");
const galleryStatus = document.getElementById("galleryStatus");
const photoGrid = document.getElementById("photoGrid");
const categoryFilter = document.getElementById("categoryFilter");
let displayedUserId;
let authenticated = false;
let currentPhotos = [];

function setStatus(element, message, kind = "") {
  element.textContent = message;
  element.dataset.error = kind === "error" ? "true" : "false";
  element.dataset.success = kind === "success" ? "true" : "false";
}

function setSignedIn(session) {
  const hasSession = Boolean(session);
  const userId = session ? session.user.id : null;
  if (userId === displayedUserId) return;
  displayedUserId = userId;
  authenticated = Boolean(session);

  loginPanel.classList.toggle("hidden", hasSession);
  dashboard.classList.toggle("hidden", !hasSession);

  if (session) {
    document.getElementById("signedInAs").textContent =
      `Signed in as ${session.user.email}`;
    loadPhotos();
  } else {
    renderPhotos(currentPhotos, false);
  }
}

async function invokeAdmin(action, values = {}) {
  let result;
  try {
    result = await supabase.functions.invoke("manage-photos", {
      body: { action, ...values },
    });
  } catch (error) {
    throw new Error(
      `Could not reach the photo-management function. ${error.message} ` +
        "Check that manage-photos is deployed in Supabase and that " +
        "ADMIN_ALLOWED_ORIGIN matches this website's address."
    );
  }

  const { data, error } = result;
  if (error) {
    let message = error.message;
    try {
      const response = error.context;
      const details = response && await response.json();
      if (details && details.code === "NOT_FOUND") {
        message =
          "The manage-photos Edge Function is not deployed in Supabase yet. " +
          "Deploy it with the Supabase CLI before uploading photos.";
      } else if (details && (details.error || details.message)) {
        message = details.error || details.message;
      }
    } catch {
      if (
        error.name === "FunctionsFetchError" ||
        error.name === "FunctionsRelayError"
      ) {
        message =
          "Could not reach the photo-management function. Check that " +
          "manage-photos is deployed in Supabase and that " +
          "ADMIN_ALLOWED_ORIGIN matches this website's address.";
      }
    }
    throw new Error(message);
  }

  if (data && data.error) {
    throw new Error(data.error);
  }

  return data;
}

function photoCategory(photo) {
  if (photo.category === "logo" || photo.category === "hero") {
    return "Site";
  }
  return photo.category;
}

function renderPhotos(photos, allowChanges = authenticated) {
  currentPhotos = photos;
  const selectedCategory = categoryFilter.value;
  const visiblePhotos = photos.filter(
    (photo) =>
      selectedCategory === "all" ||
      photoCategory(photo) === selectedCategory
  );

  document.getElementById("photoCount").textContent =
    `${photos.length} image${photos.length === 1 ? "" : "s"} in the repository`;
  photoGrid.replaceChildren();

  if (!visiblePhotos.length) {
    const message = document.createElement("p");
    message.className = "admin-help";
    message.textContent = "No images in this category.";
    photoGrid.appendChild(message);
    return;
  }

  for (const photo of visiblePhotos) {
    const card = document.createElement("article");
    card.className = "photo-card";

    const image = document.createElement("img");
    image.src = publicPhotoUrl(photo.path);
    image.alt = photo.path.split("/").pop();
    image.loading = "lazy";
    image.addEventListener(
      "error",
      () => {
        image.alt = `${image.alt} (preview unavailable)`;
      },
      { once: true }
    );

    const body = document.createElement("div");
    body.className = "photo-card-body";

    const label = document.createElement("p");
    label.textContent = photo.category;

    const path = document.createElement("p");
    path.className = "photo-path";
    path.textContent = photo.path;

    body.append(label, path);
    if (allowChanges) {
      const remove = document.createElement("button");
      remove.className = "remove-photo";
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => removePhoto(photo, remove));
      body.appendChild(remove);
    }
    card.append(image, body);
    photoGrid.appendChild(card);
  }
}

function publicPhotoUrl(path) {
  return `./${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

async function loadPublicPhotos() {
  setStatus(galleryStatus, "Loading site image previews...");
  try {
    const response = await fetch(`site-images.json?v=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Could not load site-images.json (${response.status}).`);
    }

    const config = await response.json();
    const photos = [];

    for (const [key, settings] of Object.entries(config.gallery || {})) {
      const category = settings.folder || key;
      const paths = Array.isArray(settings.images)
        ? settings.images
        : Array.from(
            { length: Number(settings.count) || 0 },
            (_, index) =>
              `images/${settings.folder}/${settings.prefix}-${index + 1}.jpeg`
          );

      for (const path of paths) {
        if (typeof path === "string" && path.startsWith("images/")) {
          photos.push({ path, category });
        }
      }
    }

    if (config.brand && typeof config.brand.logo === "string") {
      photos.push({ path: config.brand.logo, category: "logo" });
    }
    if (config.home && typeof config.home.hero === "string") {
      photos.push({ path: config.home.hero, category: "hero" });
    }

    photos.sort((left, right) => left.path.localeCompare(right.path));
    renderPhotos(photos, false);
    setStatus(
      galleryStatus,
      "Public previews are shown below. Sign in to add or remove images."
    );
  } catch (error) {
    setStatus(galleryStatus, error.message, "error");
  }
}

async function loadPhotos() {
  setStatus(galleryStatus, "Loading images...");
  try {
    const result = await invokeAdmin("list");
    renderPhotos(result.photos, true);
    setStatus(galleryStatus, "");
  } catch (error) {
    setStatus(galleryStatus, error.message, "error");
  }
}

async function removePhoto(photo, button) {
  if (!window.confirm(`Remove ${photo.path} from the website and repository?`)) {
    return;
  }

  button.disabled = true;
  setStatus(galleryStatus, `Removing ${photo.path}...`);
  try {
    const result = await invokeAdmin("delete", { path: photo.path });
    renderPhotos(result.photos);
    setStatus(
      galleryStatus,
      "Image removed. GitHub Pages will publish the change automatically.",
      "success"
    );
  } catch (error) {
    button.disabled = false;
    setStatus(galleryStatus, error.message, "error");
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const buffer = reader.result;
      const bytes = new Uint8Array(buffer);
      let binary = "";
      const chunkSize = 0x8000;

      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(
          ...bytes.subarray(offset, offset + chunkSize)
        );
      }

      resolve(btoa(binary));
    };
    reader.onerror = () => reject(new Error("Could not read the selected image."));
    reader.readAsArrayBuffer(file);
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("The selected image could not be resized."));
        }
      },
      type,
      quality
    );
  });
}

async function resizeImage(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      "This browser cannot read that image format. Choose a JPEG or PNG."
    );
  }

  try {
    const scale = Math.min(
      1,
      MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height)
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("This browser could not prepare the selected image.");
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    let hasTransparency = false;
    if (file.type === "image/png") {
      const pixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      ).data;
      for (let alpha = 3; alpha < pixels.length; alpha += 4) {
        if (pixels[alpha] < 255) {
          hasTransparency = true;
          break;
        }
      }
    }

    if (hasTransparency) {
      let blob = await canvasToBlob(canvas, "image/png");
      while (
        blob.size > MAX_COMPRESSED_IMAGE_BYTES &&
        Math.max(canvas.width, canvas.height) > 640
      ) {
        const ratio = 0.75;
        const resized = document.createElement("canvas");
        resized.width = Math.max(1, Math.round(canvas.width * ratio));
        resized.height = Math.max(1, Math.round(canvas.height * ratio));
        const resizedContext = resized.getContext("2d");
        if (!resizedContext) {
          throw new Error("This browser could not resize the selected PNG.");
        }
        resizedContext.drawImage(
          canvas,
          0,
          0,
          resized.width,
          resized.height
        );
        canvas.width = resized.width;
        canvas.height = resized.height;
        context.drawImage(resized, 0, 0);
        blob = await canvasToBlob(canvas, "image/png");
      }

      if (blob.size > MAX_COMPRESSED_IMAGE_BYTES) {
        throw new Error(
          "This transparent PNG is still too large after resizing. " +
            "Choose a smaller image."
        );
      }
      return { blob, extension: "png" };
    }

    let width = canvas.width;
    let height = canvas.height;
    let quality = 0.82;
    let blob = await canvasToBlob(canvas, "image/jpeg", quality);
    while (blob.size > MAX_COMPRESSED_IMAGE_BYTES) {
      if (quality > 0.52) {
        quality = Math.max(0.52, quality - 0.1);
      } else if (Math.max(width, height) > 640) {
        width = Math.max(1, Math.round(width * 0.8));
        height = Math.max(1, Math.round(height * 0.8));
        canvas.width = width;
        canvas.height = height;
        context.drawImage(bitmap, 0, 0, width, height);
        quality = 0.82;
      } else {
        break;
      }

      blob = await canvasToBlob(canvas, "image/jpeg", quality);
    }

    if (blob.size > MAX_COMPRESSED_IMAGE_BYTES) {
      throw new Error(
        "This image is still too large after resizing. Choose a smaller image."
      );
    }
    return { blob, extension: "jpeg" };
  } finally {
    bitmap.close();
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.getElementById("loginButton");
  button.disabled = true;
  setStatus(loginStatus, "Signing in...");

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: document.getElementById("email").value.trim(),
      password: document.getElementById("password").value,
    });

    if (error) {
      setStatus(loginStatus, error.message, "error");
    } else {
      setStatus(loginStatus, "");
    }
  } catch (error) {
    setStatus(loginStatus, error.message, "error");
  } finally {
    button.disabled = false;
  }
});

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fileInput = document.getElementById("photoFile");
  const file = fileInput.files[0];
  const button = document.getElementById("uploadButton");

  if (!file) return;
  if (file.size > MAX_IMAGE_BYTES) {
    setStatus(uploadStatus, "Choose an image smaller than 8 MB.", "error");
    return;
  }

  button.disabled = true;
  setStatus(uploadStatus, "Resizing image...");
  try {
    const resized = await resizeImage(file);
    const content = await fileToBase64(resized.blob);
    setStatus(uploadStatus, "Uploading and committing image...");
    const result = await invokeAdmin("upload", {
      category: document.getElementById("photoCategory").value,
      fileName: `${file.name.replace(/\.[^.]+$/, "")}.${resized.extension}`,
      contentType: resized.blob.type,
      content,
    });
    fileInput.value = "";
    categoryFilter.value = "all";
    renderPhotos(result.photos);
    setStatus(
      uploadStatus,
      `Added ${result.path} (${Math.round(resized.blob.size / 1024)} KB, ` +
        `from ${Math.round(file.size / 1024)} KB). GitHub Pages will ` +
        "publish the change automatically.",
      "success"
    );
  } catch (error) {
    setStatus(uploadStatus, error.message, "error");
  } finally {
    button.disabled = false;
  }
});

document.getElementById("logoutButton").addEventListener("click", async () => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) setStatus(galleryStatus, error.message, "error");
  } catch (error) {
    setStatus(galleryStatus, error.message, "error");
  }
});

document.getElementById("refreshButton").addEventListener("click", () => {
  if (authenticated) {
    loadPhotos();
  } else {
    loadPublicPhotos();
  }
});
categoryFilter.addEventListener("change", () => {
  renderPhotos(currentPhotos, authenticated);
});

supabase.auth.onAuthStateChange((_event, session) => {
  queueMicrotask(() => setSignedIn(session));
});

try {
  await loadPublicPhotos();
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    setStatus(loginStatus, error.message, "error");
  } else {
    setSignedIn(data.session);
  }
} catch (error) {
  setStatus(loginStatus, error.message, "error");
}
