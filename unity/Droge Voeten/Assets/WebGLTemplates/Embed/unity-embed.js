// Embeds the Droge Voeten Unity player in a canvas owned by the host page.
//
//   import { mount } from "<build folder>/unity-embed.js";
//   const unity = await mount(document.querySelector("canvas"));
//   button.onclick = () => unity.setFullscreen(true);
//
// The host page sizes the canvas with CSS; Unity matches its render size (and aspect ratio) to it every frame.
// Build files are looked up next to this module, so the whole build folder can be hosted anywhere.

const buildFiles = {
#if PROGRESSIVE_ASSET_LOADING
  primaryDataUrls: {{{ JSON.stringify(PRIMARY_DATA_FILES) }}},
  secondaryDataUrls: {{{ JSON.stringify(SECONDARY_DATA_FILES) }}},
#else
  dataUrl: {{{ JSON.stringify(DATA_FILENAME) }}},
#endif
  frameworkUrl: {{{ JSON.stringify(FRAMEWORK_FILENAME) }}},
#if USE_WASM
  codeUrl: {{{ JSON.stringify(CODE_FILENAME) }}},
#endif
#if SYMBOLS_FILENAME
  symbolsUrl: {{{ JSON.stringify(SYMBOLS_FILENAME) }}},
#endif
};
const loaderFile = {{{ JSON.stringify(LOADER_FILENAME) }}};

// Unity -> page events are dispatched on the canvas as "unity:<name>" CustomEvents (see WebBridge.jslib).
const eventPrefix = "unity:";

/**
 * Load Unity into `canvas`. Resolves once the player runs and the C# WebBridge is ready to receive calls.
 *
 * Options:
 * - baseUrl: URL of the build folder (default: the folder this module is served from)
 * - fullscreenElement: element to show fullscreen (default: the canvas)
 * - devicePixelRatio: render resolution multiplier (default: window.devicePixelRatio)
 * - onProgress: called with 0..1 while loading
 */
export async function mount(canvas, { baseUrl, fullscreenElement, devicePixelRatio, onProgress } = {}) {
  const base = new URL(baseUrl ? baseUrl.replace(/\/?$/, "/") : ".", import.meta.url);
  const buildUrl = (file) => new URL("Build/" + file, base).href;

  const config = {
    arguments: [],
    streamingAssetsUrl: new URL("StreamingAssets", base).href,
    companyName: {{{ JSON.stringify(COMPANY_NAME) }}},
    productName: {{{ JSON.stringify(PRODUCT_NAME) }}},
    productVersion: {{{ JSON.stringify(PRODUCT_VERSION) }}},
    matchWebGLToCanvasSize: true,
    showBanner: (message, type) => (type === "error" ? console.error : console.warn)("[Unity]", message),
  };
  for (const [key, value] of Object.entries(buildFiles)) {
    config[key] = Array.isArray(value) ? value.map(buildUrl) : buildUrl(value);
  }
  if (devicePixelRatio) {
    config.devicePixelRatio = devicePixelRatio;
  }
  if (fullscreenElement) {
    if (!fullscreenElement.id) {
      fullscreenElement.id = "unity-fullscreen-" + Math.random().toString(36).slice(2);
    }
    config.fullscreenElementID = fullscreenElement.id;
  }

  // Unity only reads the keyboard while its canvas has focus (WebBridge turns off global capture)
  if (!canvas.hasAttribute("tabindex")) {
    canvas.tabIndex = -1;
  }
  canvas.addEventListener("pointerdown", () => canvas.focus());

  const ready = new Promise((resolve) => canvas.addEventListener(eventPrefix + "ready", resolve, { once: true }));
  await loadScript(buildUrl(loaderFile));
  const instance = await createUnityInstance(canvas, config, onProgress);
  await ready;

  return {
    instance,

    // Call from inside a user event handler (click, key press): browsers refuse fullscreen otherwise.
    setFullscreen(on = true) {
      instance.SetFullscreen(on ? 1 : 0);
    },

    // Call a public method on the C# WebBridge. `value` may be a string, a number or omitted.
    send(method, value) {
      if (value === undefined) {
        instance.SendMessage("WebBridge", method);
      } else {
        instance.SendMessage("WebBridge", method, value);
      }
    },

    // Listen for an event sent with WebBridge.Emit in C#. Returns a function that removes the listener.
    on(name, handler) {
      const listener = (event) => handler(event.detail);
      canvas.addEventListener(eventPrefix + name, listener);
      return () => canvas.removeEventListener(eventPrefix + name, listener);
    },

    quit() {
      return instance.Quit();
    },
  };
}

const loadedScripts = new Map();

function loadScript(src) {
  if (!loadedScripts.has(src)) {
    loadedScripts.set(src, new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Could not load " + src));
      document.head.appendChild(script);
    }));
  }
  return loadedScripts.get(src);
}
