mergeInto(LibraryManager.library, {
  // Dispatch a Unity -> page event on the canvas; unity-embed.js turns it into unity.on(name, handler) callbacks
  WebBridge_Emit: function (namePtr, detailPtr) {
    var name = UTF8ToString(namePtr);
    var detail = UTF8ToString(detailPtr);
    Module.canvas.dispatchEvent(new CustomEvent("unity:" + name, { detail: detail }));
  },
});
