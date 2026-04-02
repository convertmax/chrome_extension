const MAX_REQUESTS = 200;
const requests = new Map();
const STORAGE_KEY = "convertmaxRequests";
const DEBUGGER_STATE_KEY = "convertmaxDebuggerState";
const TRACK_URL_PATTERNS = [
  "https://event.convertmax.io/v1/track/",
  "https://event.convertmax.io/v1/track/*"
];

function decodeRequestBody(requestBody) {
  if (!requestBody) return "No payload";

  if (requestBody.raw && requestBody.raw.length > 0) {
    try {
      const decoder = new TextDecoder("utf-8");
      const decodedChunks = requestBody.raw
        .filter((chunk) => chunk && chunk.bytes)
        .map((chunk) => decoder.decode(new Uint8Array(chunk.bytes)));

      return decodedChunks.join("") || "No payload";
    } catch (error) {
      console.error("Error decoding raw payload:", error);
      return "Unable to decode payload";
    }
  }

  if (requestBody.formData) {
    return JSON.stringify(requestBody.formData);
  }

  return "Unable to decode payload";
}

function getRequestCategory(url) {
  if (url.includes("event.convertmax.io")) return "event";
  if (url.includes("cdn.convertmax.io")) return "cdn";
  if (url.includes("convertmax.io")) return "convertmax";
  return "other";
}

function getRequestKey(details) {
  return `${details.requestId}:${details.url}`;
}

function getStoredRequestKey(request) {
  return `${request.requestId}:${request.url}`;
}

function upsertRequest(details, update) {
  const key = getRequestKey(details);
  const existing = requests.get(key) || {
    requestId: details.requestId,
    url: details.url,
    method: details.method || "GET",
    type: details.type,
    timestamp: new Date().toISOString(),
    status: "pending",
    category: getRequestCategory(details.url),
    initiator: details.initiator || details.documentUrl || "unknown"
  };

  requests.set(key, { ...existing, ...update });

  if (requests.size > MAX_REQUESTS) {
    const oldestKey = requests.keys().next().value;
    requests.delete(oldestKey);
  }

  persistRequests();
}

function upsertForwardedRequest(request) {
  const key = getStoredRequestKey(request);
  const existing = requests.get(key) || {};

  requests.set(key, {
    ...existing,
    ...request
  });

  if (requests.size > MAX_REQUESTS) {
    const oldestKey = requests.keys().next().value;
    requests.delete(oldestKey);
  }

  persistRequests();
}

function persistRequests() {
  chrome.storage.local.set({
    [STORAGE_KEY]: Array.from(requests.values())
  });
}

function loadRequestsFromStorage() {
  return chrome.storage.local.get(STORAGE_KEY).then((result) => {
    const storedRequests = result[STORAGE_KEY] || [];
    requests.clear();

    storedRequests.forEach((request) => {
      const key = `${request.requestId}:${request.url}`;
      requests.set(key, request);
    });

    return storedRequests;
  });
}

function loadDebuggerState() {
  return chrome.storage.local.get(DEBUGGER_STATE_KEY).then((result) => {
    return result[DEBUGGER_STATE_KEY] || {};
  });
}

function mergeDebuggerState(update) {
  return loadDebuggerState().then((existingState) => {
    const nextState = {
      ...existingState,
      ...update,
      lastUpdated: new Date().toISOString()
    };

    return chrome.storage.local
      .set({ [DEBUGGER_STATE_KEY]: nextState })
      .then(() => nextState);
  });
}

loadRequestsFromStorage().catch((error) => {
  console.error("Failed to restore stored Convertmax requests:", error);
});

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    upsertRequest(details, {
      method: details.method || "GET",
      payload: decodeRequestBody(details.requestBody)
    });

    return { cancel: false };
  },
  {
    urls: TRACK_URL_PATTERNS,
    types: ["xmlhttprequest", "ping", "script"]
  },
  ["requestBody"]
);

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    upsertRequest(details, {
      headers: details.requestHeaders || []
    });

    return { requestHeaders: details.requestHeaders };
  },
  {
    urls: TRACK_URL_PATTERNS,
    types: ["xmlhttprequest", "ping", "script"]
  },
  ["requestHeaders"]
);

chrome.webRequest.onCompleted.addListener(
  (details) => {
    upsertRequest(details, {
      status: details.statusCode,
      statusLine: details.statusLine || "",
      responseHeaders: details.responseHeaders || [],
      timeCompleted: new Date().toISOString()
    });
  },
  {
    urls: TRACK_URL_PATTERNS,
    types: ["xmlhttprequest", "ping", "script"]
  },
  ["responseHeaders"]
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    upsertRequest(details, {
      status: "error",
      error: details.error,
      timeCompleted: new Date().toISOString()
    });
  },
  {
    urls: TRACK_URL_PATTERNS,
    types: ["xmlhttprequest", "ping", "script"]
  }
);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getRequests") {
    loadRequestsFromStorage()
      .then((storedRequests) => {
        sendResponse({ requests: storedRequests });
      })
      .catch((error) => {
        console.error("Failed to load Convertmax requests:", error);
        sendResponse({ requests: [] });
      });
    return true;
  }

  if (request.action === "clearRequests") {
    requests.clear();
    chrome.storage.local
      .set({
        [STORAGE_KEY]: [],
        [DEBUGGER_STATE_KEY]: {}
      })
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error("Failed to clear Convertmax requests:", error);
        sendResponse({ success: false });
      });
    return true;
  }

  if (request.action === "captureRequest" && request.request) {
    upsertForwardedRequest(request.request);
    sendResponse({ success: true });
    return true;
  }

  if (request.action === "updateDebuggerState" && request.state) {
    mergeDebuggerState(request.state)
      .then((state) => {
        sendResponse({ success: true, state });
      })
      .catch((error) => {
        console.error("Failed to update Convertmax debugger state:", error);
        sendResponse({ success: false });
      });
    return true;
  }

  if (request.action === "getDebuggerState") {
    loadDebuggerState()
      .then((state) => {
        sendResponse({ state });
      })
      .catch((error) => {
        console.error("Failed to load Convertmax debugger state:", error);
        sendResponse({ state: {} });
      });
    return true;
  }

  return false;
});
