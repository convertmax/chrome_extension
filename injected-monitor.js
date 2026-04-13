(function monitorConvertmaxRequests() {
  const SOURCE = "convertmax-page-monitor";
  const state = {
    pageUrl: window.location.href,
    convertmaxPresent: false,
    scriptDetected: false,
    scriptLoaded: false,
    readyEventSeen: false,
    apiAvailable: false,
    apiKey: "",
    eventURL: "",
    sessionId: "",
    visitorId: "",
    lastEventType: ""
  };
  const TRACK_PATH_REGEX = /\/v1\/track\/?(?:[?#].*)?$/i;

  function isTrackUrl(url) {
    return typeof url === "string" && TRACK_PATH_REGEX.test(url);
  }

  function extractTrackBase(url) {
    if (!isTrackUrl(url)) return "";
    return url.replace(TRACK_PATH_REGEX, "");
  }

  function emitState(extra = {}) {
    Object.assign(state, extra);

    window.postMessage(
      {
        source: SOURCE,
        type: "state",
        state: {
          ...state,
          pageUrl: window.location.href
        }
      },
      "*"
    );
  }

  function emitRequest(request) {
    window.postMessage(
      {
        source: SOURCE,
        type: "request",
        request
      },
      "*"
    );
  }

  function normalizeBody(body) {
    if (!body) return "No payload";

    if (typeof body === "string") return body;

    if (body instanceof URLSearchParams) return body.toString();

    if (body instanceof FormData) {
      const entries = {};
      body.forEach((value, key) => {
        if (entries[key]) {
          entries[key] = [].concat(entries[key], value);
          return;
        }

        entries[key] = value;
      });
      return JSON.stringify(entries);
    }

    return "[non-text body]";
  }

  function scanScriptPresence() {
    const scripts = Array.from(document.scripts || []);
    const hasConvertmaxScript = scripts.some((script) =>
      typeof script.src === "string" &&
      (
        script.src.includes("convertmax.io") ||
        script.src.includes("/cm_v2.js") ||
        script.src.includes("/cm.js")
      )
    );
    const hasConvertmaxFunction = typeof window.Convertmax === "function";
    const inlineConvertmaxScript = scripts.find((script) =>
      typeof script.textContent === "string" &&
      (
        script.textContent.includes("convertmax.io") ||
        script.textContent.includes("Convertmax") ||
        script.textContent.includes("__convertmax_q")
      )
    );

    if (inlineConvertmaxScript && !state.eventURL) {
      const eventUrlMatch =
        inlineConvertmaxScript.textContent.match(/eventURL\s*:\s*['"]([^'"]+)['"]/) ||
        inlineConvertmaxScript.textContent.match(/host\s*:\s*['"]([^'"]+)['"]/);

      if (eventUrlMatch) {
        state.eventURL = eventUrlMatch[1].trim();
      }
    }

    emitState({
      scriptDetected: hasConvertmaxScript,
      convertmaxPresent: hasConvertmaxFunction,
      apiAvailable: hasConvertmaxFunction
    });
  }

  function captureConfig(config) {
    if (!config || typeof config !== "object") return;

    emitState({
      apiKey: config.apiKey || config.writeKey || state.apiKey,
      eventURL: config.eventURL || config.host || state.eventURL,
      convertmaxPresent: true
    });
  }

  function captureConfigFromInstance(instance) {
    if (!instance || typeof instance !== "function") return;

    const configObject = instance.config;
    if (configObject && typeof configObject === "object") {
      captureConfig(configObject);
    }
  }

  function captureClientState(instance) {
    if (!instance || typeof instance !== "function") return;

    const client = instance.client;
    if (!client || typeof client !== "object") return;

    emitState({
      sessionId: client.session_id || state.sessionId,
      visitorId: client.visitor || state.visitorId,
      apiKey: client.apiKey || state.apiKey,
      eventURL: client.eventURL || state.eventURL,
      scriptLoaded: Boolean(instance.loaded) || state.scriptLoaded,
      readyEventSeen: Boolean(instance.ready) || state.readyEventSeen,
      apiAvailable: true,
      convertmaxPresent: true
    });

    if (client.config && typeof client.config === "object") {
      captureConfig(client.config);
    }
  }

  function extractApiKeyFromHeaders(headers) {
    if (!headers || typeof headers !== "object") return "";

    const directToken =
      headers["x-access-token"] ||
      headers["X-Access-Token"] ||
      "";

    if (directToken) return directToken;

    const authorization =
      headers.authorization ||
      headers.Authorization ||
      "";

    if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
      return authorization.slice("Bearer ".length);
    }

    return "";
  }

  function updateStateFromRequest(url, headers, payload) {
    const parsed = typeof payload === "string" ? (() => {
      try {
        return JSON.parse(payload);
      } catch (error) {
        return null;
      }
    })() : null;

    emitState({
      eventURL: extractTrackBase(url) || state.eventURL,
      apiKey: extractApiKeyFromHeaders(headers) || state.apiKey,
      sessionId: parsed?.session_id || parsed?.sessionId || state.sessionId,
      visitorId:
        parsed?.visitor ||
        parsed?.anonymousId ||
        parsed?.visitorId ||
        state.visitorId,
      apiAvailable: true,
      convertmaxPresent: true
    });
  }

  function headersToObject(headers) {
    if (!headers) return {};

    if (headers instanceof Headers) {
      const entries = {};
      headers.forEach((value, key) => {
        entries[key] = value;
      });
      return entries;
    }

    if (Array.isArray(headers)) {
      return headers.reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {});
    }

    if (typeof headers === "object") {
      return { ...headers };
    }

    return {};
  }

  function captureTrack(eventName, payload) {
    const eventType =
      payload?.event ||
      payload?.event_type ||
      payload?.type ||
      payload?.name ||
      eventName ||
      "";

    emitState({
      lastEventType: eventType,
      convertmaxPresent: true,
      apiAvailable: true
    });
  }

  function inspectQueuedCalls() {
    const queuedCalls = Array.isArray(window.__convertmax_q) ? window.__convertmax_q : [];

    queuedCalls.forEach((entry) => {
      if (!Array.isArray(entry) || entry.length === 0) return;

      const [action, payload] = entry;

      if (action === "config" && payload) {
        captureConfig(payload);
      }

      if (action === "track" && payload) {
        emitState({
          convertmaxPresent: true,
          apiAvailable: true
        });
      }
    });
  }

  function wrapConvertmax() {
    const current = window.Convertmax;
    if (typeof current !== "function" || current.__convertmaxDebuggerWrapped) return;

    captureConfigFromInstance(current);
    captureClientState(current);
    emitState({
      scriptLoaded: Boolean(current.loaded) || state.scriptLoaded,
      readyEventSeen: Boolean(current.ready) || state.readyEventSeen
    });

    function wrappedConvertmax() {
      const [action, config] = arguments;

      if (action === "config" && config) {
        captureConfig(config);
      }

      return current.apply(this, arguments);
    }

    Object.assign(wrappedConvertmax, current);
    wrappedConvertmax.__convertmaxDebuggerWrapped = true;

    if (typeof current.config === "function") {
      wrappedConvertmax.config = function wrappedConfig(config) {
        captureConfig(config);
        return current.config.apply(this, arguments);
      };
    } else if (current.config && typeof current.config === "object") {
      wrappedConvertmax.config = current.config;
    }

    if (typeof current.track === "function") {
      wrappedConvertmax.track = function wrappedTrack(eventName, payload) {
        captureTrack(eventName, payload);
        return current.track.apply(this, arguments);
      };
    }

    window.Convertmax = wrappedConvertmax;
    emitState({
      convertmaxPresent: true,
      apiAvailable: true
    });
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = async function patchedFetch(input, init = {}) {
      const url = typeof input === "string" ? input : input?.url;
      const method =
        init.method ||
        (typeof input === "object" && input && "method" in input ? input.method : "GET");
      const requestId = `fetch:${Date.now()}:${Math.random().toString(16).slice(2)}`;

      if (isTrackUrl(url)) {
        const payload = normalizeBody(init.body);
        const headers = headersToObject(
          init.headers ||
          (typeof input === "object" && input ? input.headers : undefined)
        );
        let highlightedEventType = "";

        try {
          const parsed = JSON.parse(payload);
          highlightedEventType =
            parsed.event ||
            parsed.event_type ||
            parsed.data?.event_type ||
            parsed.type ||
            parsed.name ||
            "";
        } catch (error) {
          highlightedEventType = "";
        }

        updateStateFromRequest(url, headers, payload);

        emitRequest({
          requestId,
          url,
          method,
          type: "fetch",
          timestamp: new Date().toISOString(),
          status: "pending",
          category: "event",
          initiator: window.location.href,
          payload,
          eventType: highlightedEventType,
          headers
        });
      }

      try {
        const response = await originalFetch.apply(this, arguments);

        if (isTrackUrl(url)) {
          emitRequest({
            requestId,
            url,
            method,
            type: "fetch",
            timestamp: new Date().toISOString(),
            status: response.status,
            statusLine: `${response.status} ${response.statusText}`.trim(),
            category: "event",
            initiator: window.location.href,
            payload: normalizeBody(init.body),
            timeCompleted: new Date().toISOString()
          });
        }

        return response;
      } catch (error) {
        if (isTrackUrl(url)) {
          emitRequest({
            requestId,
            url,
            method,
            type: "fetch",
            timestamp: new Date().toISOString(),
            status: "error",
            error: error?.message || "Fetch failed",
            category: "event",
            initiator: window.location.href,
            payload: normalizeBody(init.body),
            timeCompleted: new Date().toISOString()
          });
        }

        throw error;
      }
    };
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function patchedOpen(method, url) {
    this.__convertmaxMonitor = {
      method: method || "GET",
      url,
      headers: {}
    };

    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function patchedSetRequestHeader(name, value) {
    if (this.__convertmaxMonitor) {
      this.__convertmaxMonitor.headers[name] = value;
    }

    return originalSetRequestHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function patchedSend(body) {
    const requestMeta = this.__convertmaxMonitor;

    if (requestMeta && isTrackUrl(requestMeta.url)) {
      const requestId = `xhr:${Date.now()}:${Math.random().toString(16).slice(2)}`;
      const payload = normalizeBody(body);
      const headers = requestMeta.headers || {};
      let highlightedEventType = "";

      try {
        const parsed = JSON.parse(payload);
        highlightedEventType =
          parsed.event ||
          parsed.event_type ||
          parsed.data?.event_type ||
          parsed.type ||
          parsed.name ||
          "";
      } catch (error) {
        highlightedEventType = "";
      }

      updateStateFromRequest(requestMeta.url, headers, payload);

      emitRequest({
        requestId,
        url: requestMeta.url,
        method: requestMeta.method,
        type: "xmlhttprequest",
        timestamp: new Date().toISOString(),
        status: "pending",
        category: "event",
        initiator: window.location.href,
        payload,
        eventType: highlightedEventType,
        headers
      });

      this.addEventListener(
        "loadend",
        () => {
          emitRequest({
            requestId,
            url: requestMeta.url,
            method: requestMeta.method,
            type: "xmlhttprequest",
            timestamp: new Date().toISOString(),
            status: this.status || "completed",
            statusLine: `${this.status} ${this.statusText}`.trim(),
            category: "event",
            initiator: window.location.href,
            payload,
            eventType: highlightedEventType,
            timeCompleted: new Date().toISOString()
          });
        },
        { once: true }
      );
    }

    return originalSend.apply(this, arguments);
  };

  window.addEventListener("convertmaxLoaded", () => {
    emitState({
      scriptLoaded: true,
      convertmaxPresent: true
    });
    wrapConvertmax();
  });

  window.addEventListener("convertmaxReady", () => {
    emitState({
      readyEventSeen: true,
      convertmaxPresent: true
    });
    wrapConvertmax();
  });

  const observer = new MutationObserver(() => {
    scanScriptPresence();
    inspectQueuedCalls();
    captureClientState(window.Convertmax);
    captureConfigFromInstance(window.Convertmax);
    wrapConvertmax();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  let attempts = 0;
  const poller = window.setInterval(() => {
    attempts += 1;
    scanScriptPresence();
    inspectQueuedCalls();
    captureClientState(window.Convertmax);
    captureConfigFromInstance(window.Convertmax);
    wrapConvertmax();

    if (attempts >= 40) {
      window.clearInterval(poller);
      observer.disconnect();
    }
  }, 500);

  scanScriptPresence();
  inspectQueuedCalls();
  captureClientState(window.Convertmax);
  captureConfigFromInstance(window.Convertmax);
  wrapConvertmax();
})();
