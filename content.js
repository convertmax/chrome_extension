(function injectConvertmaxMonitor() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("injected-monitor.js");
  script.dataset.source = "convertmax-extension";
  (document.head || document.documentElement).appendChild(script);
  script.onload = () => script.remove();
})();

window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  const payload = event.data;
  if (!payload || payload.source !== "convertmax-page-monitor") return;

  if (payload.type === "request" && payload.request) {
    chrome.runtime.sendMessage({
      action: "captureRequest",
      request: payload.request
    });
    return;
  }

  if (payload.type === "state" && payload.state) {
    chrome.runtime.sendMessage({
      action: "updateDebuggerState",
      state: payload.state
    });
  }
});
