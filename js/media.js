const MEDIA_FILE = "site-images.json";


function currentLanguage() {
  return (
    localStorage.getItem(
      "rehmanLanguage"
    ) || "en"
  );
}


function addCacheBuster(path) {
  const separator =
    path.includes("?")
      ? "&"
      : "?";

  return `${path}${separator}v=${Date.now()}`;
}


function translation(key) {
  const lang =
    currentLanguage();

  if (
    typeof translations !== "undefined" &&
    translations[lang] &&
    translations[lang][key]
  ) {
    return translations[lang][key];
  }

  if (
    typeof translations !== "undefined" &&
    translations.en &&
    translations.en[key]
  ) {
    return translations.en[key];
  }

  return key;
}


function setManagedImage(
  element,
  imagePath,
  altText
) {
  if (!element || !imagePath) {
    return;
  }


  const finalPath =
    addCacheBuster(imagePath);


  if (
    element.tagName.toLowerCase() ===
    "img"
  ) {
    element.hidden =
      false;

    element.src =
      finalPath;

    element.alt =
      altText;

    return;
  }


  element.style.backgroundImage =
    `url("${finalPath}")`;

  element.style.backgroundSize =
    "cover";

  element.style.backgroundPosition =
    "center";

  element.style.backgroundRepeat =
    "no-repeat";

  element.textContent =
    "";

  element.setAttribute(
    "role",
    "img"
  );

  element.setAttribute(
    "aria-label",
    altText
  );
}


function clearManagedImage(element) {
  if (!element) {
    return;
  }

  if (element.tagName.toLowerCase() === "img") {
    element.removeAttribute("src");
    element.hidden = true;
    return;
  }

  element.style.backgroundImage = "none";
  element.textContent = "";
  element.hidden = true;
}


function loadBrandImages(data) {
  const logo =
    document.querySelector(
      '[data-managed-image="brand.logo"]'
    );

  if (logo && data.brand && data.brand.logo) {
    setManagedImage(
      logo,
      data.brand.logo,
      "Rehman Decoration"
    );
  } else {
    clearManagedImage(logo);
  }
}


function randomGalleryImage(data, category, fallbackPath) {
  const settings =
    data.gallery &&
    data.gallery[category];

  const count =
    Number(settings && settings.count);

  if (Array.isArray(settings && settings.images)) {
    if (!settings.images.length) {
      return null;
    }

    return settings.images[
      Math.floor(Math.random() * settings.images.length)
    ];
  }

  if (
    !settings ||
    !settings.folder ||
    !settings.prefix ||
    !Number.isInteger(count) ||
    count < 1
  ) {
    return fallbackPath;
  }

  const imageNumber =
    Math.floor(Math.random() * count) + 1;

  return `images/${settings.folder}/${settings.prefix}-${imageNumber}.jpeg`;
}


function loadHomeImages(data) {
  if (!data.home) {
    clearManagedImage(
      document.querySelector(
        '[data-managed-image="home.hero"]'
      )
    );

    return;
  }


  const hero =
    document.querySelector(
      '[data-managed-image="home.hero"]'
    );

  const stage =
    document.querySelector(
      '[data-managed-image="home.stage"]'
    );

  const room =
    document.querySelector(
      '[data-managed-image="home.room"]'
    );

  const car =
    document.querySelector(
      '[data-managed-image="home.car"]'
    );


  if (hero && data.home.hero) {
    setManagedImage(
      hero,
      data.home.hero,
      "Rehman Decoration"
    );
  } else {
    clearManagedImage(hero);
  }


  if (stage) {
    const imagePath =
      randomGalleryImage(
        data,
        "wedding",
        data.home.stage
      );

    if (imagePath) {
      setManagedImage(
        stage,
        imagePath,
        translation(
          "weddingPhoto"
        )
      );
    } else {
      clearManagedImage(stage);
    }
  }


  if (room) {
    const imagePath =
      randomGalleryImage(
        data,
        "room",
        data.home.room
      );

    if (imagePath) {
      setManagedImage(
        room,
        imagePath,
        translation(
          "roomPhotoHome"
        )
      );
    } else {
      clearManagedImage(room);
    }
  }


  if (car) {
    const imagePath =
      randomGalleryImage(
        data,
        "car",
        data.home.car
      );

    if (imagePath) {
      setManagedImage(
        car,
        imagePath,
        translation(
          "carPhotoHome"
        )
      );
    } else {
      clearManagedImage(car);
    }
  }
}


function loadAboutImage(data) {
  const aboutImage =
    document.querySelector(
      '[data-managed-image="about.main"]'
    );


  if (aboutImage && data.about && data.about.main) {
    setManagedImage(
      aboutImage,
      data.about.main,
      translation(
        "aboutPhoto"
      )
    );
  } else {
    clearManagedImage(aboutImage);
  }
}


function createGalleryPhoto(
  photoPath,
  titleKey,
  photoKey,
  category
) {
  const article =
    document.createElement(
      "article"
    );

  article.className =
    "galleryitem";

  article.dataset.category =
    category;


  const photo =
    document.createElement(
      "div"
    );

  photo.className =
    "photo tall";


  setManagedImage(
    photo,
    photoPath,
    translation(
      photoKey
    )
  );


  const title =
    document.createElement(
      "h3"
    );

  title.dataset.i18n =
    titleKey;

  title.textContent =
    translation(
      titleKey
    );


  article.appendChild(
    photo
  );

  article.appendChild(
    title
  );


  return article;
}


function loadGallery(data) {
  const galleryGrid =
    document.getElementById(
      "galleryGrid"
    );


  if (!galleryGrid) {
    return;
  }


  galleryGrid.innerHTML =
    "";


  if (!data.gallery) {
    return;
  }


  Object.entries(
    data.gallery
  ).forEach(
    ([category, settings]) => {

      const photoPaths =
        Array.isArray(settings.images)
          ? settings.images
          : Array.from(
              {
                length:
                  Number(settings.count) || 0
              },
              (_, index) =>
                `images/${settings.folder}/${settings.prefix}-${index + 1}.jpeg`
            );


      photoPaths.forEach(
        (photoPath) => {
          const article =
            createGalleryPhoto(
              photoPath,
              settings.titleKey,
              settings.photoKey,
              category
            );


          galleryGrid.appendChild(
            article
          );
        }
      );
    }
  );


  if (
    typeof language ===
    "function"
  ) {
    language(
      currentLanguage()
    );
  }
}


async function loadManagedMedia() {
  try {

    const response =
      await fetch(
        `${MEDIA_FILE}?v=${Date.now()}`,
        {
          cache:
            "no-store"
        }
      );


    if (!response.ok) {
      throw new Error(
        "Could not load site-images.json."
      );
    }


    const data =
      await response.json();


    loadBrandImages(
      data
    );

    loadHomeImages(
      data
    );

    loadAboutImage(
      data
    );

    loadGallery(
      data
    );

  } catch (error) {

    console.error(
      "Media loading error:",
      error
    );
  }
}


document.addEventListener(
  "DOMContentLoaded",
  () => {
    loadManagedMedia();
  }
);