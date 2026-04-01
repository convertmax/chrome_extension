# Convertmax Chrome Extension

This extension helps validate Convertmax tracking on live websites.

It acts as a lightweight debugger for the Convertmax browser script and event requests so you can confirm that tracking is present, configured, and firing as expected across a site journey.

## What It Shows

- whether the Convertmax script tag is detected
- whether `convertmaxLoaded` has fired
- whether `convertmaxReady` has fired
- whether Convertmax client activity has been detected
- the effective event endpoint used for tracking
- the effective public API key inferred from runtime behavior
- captured Convertmax event requests in newest-first order
- event payloads for flows like `page_view`, `add_cart`, `cart`, `checkout`, and `convert`

## What It Is Useful For

- checking that the Convertmax script is present on a page
- validating that event requests are firing during real site usage
- confirming tracking behavior across multiple pages in a funnel
- reviewing payload structure during implementation or QA
- spotting missing steps in a conversion flow by watching events as they occur

## Supported Monitoring

The extension monitors Convertmax runtime activity in two ways:

- page-level instrumentation for `XMLHttpRequest` and `fetch`
- Convertmax runtime detection through the browser page context

Captured events are stored in extension storage so they remain visible as you move between pages until you clear the session.

## Load the Extension

1. Open `chrome://extensions/` in Google Chrome.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the cloned `chrome_extension` project folder.

## Typical Workflow

1. Load the extension in Chrome.
2. Visit a site with Convertmax installed.
3. Browse through the funnel you want to test.
4. Open the extension popup to review readiness signals and captured events.
5. Use `Clear` to reset the session before the next test run.

## Files

- `manifest.json`: extension manifest
- `background.js`: persistent request storage and debugger state handling
- `content.js`: bridge between the page and extension runtime
- `injected-monitor.js`: page-level Convertmax detection and request capture
- `popup.html`: debugger UI
- `popup.js`: popup rendering and event display logic
