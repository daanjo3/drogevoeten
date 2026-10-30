mergeInto(LibraryManager.library, {
  // Dispatch a Unity -> page event on the canvas; unity-embed.js turns it into unity.on(name, handler) callbacks
  WebBridge_Emit: function (namePtr, detailPtr) {
    var name = UTF8ToString(namePtr);
    var detail = UTF8ToString(detailPtr);
    Module.canvas.dispatchEvent(new CustomEvent("unity:" + name, { detail: detail }));
  },

  // 1 while the browser shows the Unity canvas (or an element containing it) fullscreen
  WebBridge_IsFullscreen: function () {
    var element = document.fullscreenElement || document.webkitFullscreenElement;
    return element && element.contains(Module.canvas) ? 1 : 0;
  },

  // Leave fullscreen and take keyboard focus off the canvas, so the page gets its input back
  WebBridge_ExitFullscreen: function () {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(function () {});
    } else if (document.webkitFullscreenElement) {
      document.webkitExitFullscreen();
    }
    Module.canvas.blur();
  },
});
