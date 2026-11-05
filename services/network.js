"use strict";
const https = require("node:https");
const { ProxyAgent } = require("undici");
const http = require("node:http");
const { createGlobalProxyAgent } = require("global-agent");

// discord.js REST uses Undici; its gateway uses ws/https.request. Both need
// their supported agent APIs because Node 22 does not infer HTTPS_PROXY here.
// Agents retain Node's normal CA store and NODE_EXTRA_CA_CERTS verification.
function createTransport(proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy) {
  const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
  let gatewayState;
  return {
    dispatcher,
    configureRest(rest) { if (dispatcher) rest.setAgent(dispatcher); return rest; },
    activateGateway() {
      if (!proxyUrl || gatewayState) return;
      if (new URL(proxyUrl).protocol !== "http:") throw new Error("Proxy bramy Discord wymaga adresu proxy HTTP (CONNECT).");
      const previous = { httpAgent: http.globalAgent, httpsAgent: https.globalAgent, httpGet: http.get, httpRequest: http.request, httpsGet: https.get, httpsRequest: https.request };
      // Documented global-agent bootstrap supplies an agent even when ws passes
      // createConnection, a case that bypasses Node's globalAgent default.
      const controller = createGlobalProxyAgent({ environmentVariableNamespace: "SW_GATEWAY_", forceGlobalAgent: true });
      controller.HTTP_PROXY = null;
      controller.HTTPS_PROXY = proxyUrl;
      controller.NO_PROXY = process.env.NO_PROXY || process.env.no_proxy || null;
      gatewayState = { previous, httpAgent: http.globalAgent, httpsAgent: https.globalAgent };

    },
    // Keep the host's global fetch and authentication headers intact.
    fetch(url, options = {}) { return globalThis.fetch(url, dispatcher ? { ...options, dispatcher } : options); },
    async close() {
      if (gatewayState) {
        gatewayState.httpAgent.destroy?.(); gatewayState.httpsAgent.destroy?.();
        const previous = gatewayState.previous;
        http.globalAgent = previous.httpAgent; https.globalAgent = previous.httpsAgent;
        http.get = previous.httpGet; http.request = previous.httpRequest;
        https.get = previous.httpsGet; https.request = previous.httpsRequest;
        gatewayState = undefined;
      }
      await dispatcher?.close();
    }
  };
}
let transport;
function getTransport() { return transport ||= createTransport(); }
function configureClient(client) { const value = getTransport(); value.configureRest(client.rest); value.activateGateway(); }
function configureRest(rest) { return getTransport().configureRest(rest); }
function fetchExternal(url, options) { return getTransport().fetch(url, options); }
async function close() { const value = transport; transport = undefined; if (value) await value.close(); }
module.exports = { createTransport, configureClient, configureRest, fetchExternal, close };
