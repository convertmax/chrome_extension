function safeParsePayload(payload) {
  if (!payload || payload === "No payload") return null;

  try {
    return JSON.parse(payload);
  } catch (error) {
    return null;
  }
}

function prettyPrintPayload(payload) {
  if (!payload || payload === "No payload") return "No payload";

  const parsed = safeParsePayload(payload);
  if (parsed) return JSON.stringify(parsed, null, 2);

  return payload;
}

function getEventType(request) {
  if (request.eventType) return request.eventType;

  const parsed = safeParsePayload(request.payload);
  if (!parsed) return "";

  return (
    parsed.event ||
    parsed.event_type ||
    parsed.data?.event_type ||
    parsed.type ||
    parsed.name ||
    ""
  );
}

function sanitizeEventType(eventType) {
  return (eventType || "default").replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
}

function getStatusText(value, positiveLabel) {
  return value ? positiveLabel : "Not seen yet";
}

function getStatusClass(value, warningWhenFalse = true) {
  if (value) return "status-good";
  return warningWhenFalse ? "status-warn" : "status-bad";
}

function computeHasClientActivity(state) {
  return (
    Boolean(state.apiAvailable) ||
    Boolean(state.convertmaxPresent) ||
    Boolean(state.apiKey) ||
    Boolean(state.eventURL) ||
    Boolean(state.sessionId) ||
    Boolean(state.visitorId)
  );
}

/** Matches the four status cards all showing "Not seen yet" (no Convertmax detected on the current page context). */
function isDebuggerUninitialized(state) {
  return (
    !state.scriptDetected &&
    !state.scriptLoaded &&
    !state.readyEventSeen &&
    !computeHasClientActivity(state)
  );
}

function renderDebuggerState(state) {
  const scriptDetected = document.getElementById("scriptDetected");
  const scriptLoaded = document.getElementById("scriptLoaded");
  const readySeen = document.getElementById("readySeen");
  const convertmaxPresent = document.getElementById("convertmaxPresent");
  const hasClientActivity = computeHasClientActivity(state);

  scriptDetected.textContent = getStatusText(state.scriptDetected, "Detected");
  scriptLoaded.textContent = getStatusText(state.scriptLoaded, "Loaded");
  readySeen.textContent = getStatusText(state.readyEventSeen, "Ready");
  convertmaxPresent.textContent = getStatusText(hasClientActivity, "Detected");

  scriptDetected.className = `status-value ${getStatusClass(state.scriptDetected)}`;
  scriptLoaded.className = `status-value ${getStatusClass(state.scriptLoaded)}`;
  readySeen.className = `status-value ${getStatusClass(state.readyEventSeen)}`;
  convertmaxPresent.className = `status-value ${getStatusClass(hasClientActivity)}`;

  document.getElementById("apiKeyValue").textContent = state.apiKey || "Not detected";
  document.getElementById("eventUrlValue").textContent = state.eventURL || "Not detected";
}

function renderRequests(requests, state) {
  const requestsDiv = document.getElementById("requests");

  requestsDiv.innerHTML = "";

  if (!requests || requests.length === 0) {
    requestsDiv.innerHTML = `
      <div class="empty">
        ${state.convertmaxPresent ? "Convertmax appears on the page, but no tracking requests have been captured yet." : "No Convertmax requests captured yet."}
        Browse the site and trigger events like page view, add to cart, cart, checkout, and convert. The log will keep them until you clear it.
      </div>
    `;
    return;
  }

  const sortedRequests = [...requests].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );

  sortedRequests.forEach((request) => {
    const requestElement = document.createElement("section");
    const eventType = getEventType(request) || "default";
    const eventClass = `event-${sanitizeEventType(eventType)}`;

    requestElement.className = `request ${eventClass}`;

    requestElement.innerHTML = `
      <div class="request-head">
        <div class="pill-row">
          <span class="pill event-type">${eventType}</span>
          <span class="pill">${request.method}</span>
          <span class="pill">${request.type}</span>
          <span class="pill">${request.statusLine || request.status}</span>
        </div>
      </div>
      <div class="url">${request.url}</div>
      <div class="meta">Started: ${request.timestamp}</div>
      <div class="meta meta-row">
        <span class="meta-label">Initiator:</span>
        <span class="meta-value" title="${request.initiator || ""}">${request.initiator || ""}</span>
      </div>
      <pre>${prettyPrintPayload(request.payload)}</pre>
    `;

    requestsDiv.appendChild(requestElement);
  });
}

function loadDebuggerData() {
  chrome.runtime.sendMessage({ action: "getDebuggerState" }, (stateResponse) => {
    const state = stateResponse?.state || {};

    if (isDebuggerUninitialized(state)) {
      chrome.runtime.sendMessage({ action: "clearRequests" }, () => {
        const cleared = {};
        renderDebuggerState(cleared);
        renderRequests([], cleared);
      });
      return;
    }

    renderDebuggerState(state);

    chrome.runtime.sendMessage({ action: "getRequests" }, (requestResponse) => {
      renderRequests(requestResponse?.requests || [], state);
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const infoPanel = document.getElementById("infoPanel");

  document.getElementById("toggleInfo").addEventListener("click", () => {
    infoPanel.classList.toggle("hidden");
  });

  document.getElementById("clear").addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "clearRequests" }, () => {
      loadDebuggerData();
    });
  });

  loadDebuggerData();
});
