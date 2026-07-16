var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.js
var main_exports = {};
__export(main_exports, {
  default: () => BluemojiPlugin
});
module.exports = __toCommonJS(main_exports);

// ../impro/impro-plugin/main.js
var SimpleUUID = class {
  constructor() {
    this._id = 0;
  }
  create() {
    return this._id++;
  }
};
var uuid = new SimpleUUID();
var callHandlers = /* @__PURE__ */ new Map();
var pendingHostCalls = /* @__PURE__ */ new Map();
function hostCall(method, ...args) {
  const hostCallId = uuid.create();
  return new Promise((resolve, reject) => {
    pendingHostCalls.set(hostCallId, { resolve, reject });
    self.postMessage({ type: "hostCall", method, hostCallId, args });
  });
}
var eventListeners = /* @__PURE__ */ new Map();
var registeredEvents = /* @__PURE__ */ new Set();
async function invokeListeners(listeners, event, args) {
  for (const listener of listeners) {
    try {
      await listener(...args);
    } catch (error) {
      console.error(`"${event}" listener threw:`, error);
    }
  }
}
async function dispatchEvent(event, args) {
  const listeners = eventListeners.get(event) ?? /* @__PURE__ */ new Set();
  switch (event) {
    case "post-context-menu":
    case "profile-context-menu": {
      const menu = new Menu();
      await invokeListeners(listeners, event, [menu, ...args]);
      return menu._serialize();
    }
    case "post-composer-open": {
      const composer = new Composer();
      await invokeListeners(listeners, event, [composer, ...args]);
      return composer._serialize();
    }
    default:
      console.warn(`No dispatch case for plugin event "${event}".`);
      return null;
  }
}
function addEventListener(event, listener) {
  let listeners = eventListeners.get(event);
  if (!listeners) {
    listeners = /* @__PURE__ */ new Set();
    eventListeners.set(event, listeners);
  }
  listeners.add(listener);
  if (!registeredEvents.has(event)) {
    registeredEvents.add(event);
    const handlerId = uuid.create();
    callHandlers.set(handlerId, (...args) => dispatchEvent(event, args));
    self.postMessage({
      type: "register",
      target: "eventListener",
      event,
      handlerId
    });
  }
}
var MenuItem = class {
  constructor() {
    this.title = "";
    this.icon = null;
    this._callback = () => {
    };
  }
  setTitle(title) {
    this.title = title;
    return this;
  }
  setIcon(icon) {
    this.icon = icon;
    return this;
  }
  onClick(callback) {
    this._callback = callback;
    return this;
  }
};
var Menu = class {
  constructor() {
    this.items = [];
  }
  addItem(builder) {
    const item = new MenuItem();
    builder(item);
    this.items.push(item);
    return this;
  }
  _serialize() {
    return this.items.map((item) => {
      const handlerId = uuid.create();
      callHandlers.set(handlerId, item._callback);
      return { title: item.title, icon: item.icon, handlerId };
    });
  }
};
var Composer = class {
  constructor() {
    this._ops = [];
    this._cursor = null;
  }
  setText(text) {
    this._ops.push({ op: "set", text: String(text) });
    return this;
  }
  appendText(text) {
    this._ops.push({ op: "append", text: String(text) });
    return this;
  }
  prependText(text) {
    this._ops.push({ op: "prepend", text: String(text) });
    return this;
  }
  setCursor(index) {
    this._cursor = index;
    return this;
  }
  _serialize() {
    return { ops: this._ops, cursor: this._cursor };
  }
};
var PluginData = class {
  getPost(uri) {
    return hostCall("getPost", { uri });
  }
  getProfile(did) {
    return hostCall("getProfile", { did });
  }
  getRecord(repo, collection, rkey) {
    return hostCall("getRecord", { repo, collection, rkey });
  }
};
var App = class {
  constructor() {
    this.currentUser = null;
    this.data = new PluginData();
  }
  on(event, listener) {
    addEventListener(event, listener);
  }
  refreshFeedFilters(feedURI = null) {
    return hostCall("refreshFeedFilters", feedURI);
  }
};
var StyleSnippet = class {
  constructor(cssText) {
    this._snippetId = uuid.create();
    this._removed = false;
    this.ready = new Promise((resolve, reject) => {
      queueMicrotask(() => {
        if (this._removed) return resolve();
        hostCall("applyStyleSnippet", {
          snippetId: this._snippetId,
          cssText
        }).then(resolve, reject);
      });
    });
  }
  remove() {
    if (this._removed) return;
    this._removed = true;
    hostCall("removeStyleSnippet", { snippetId: this._snippetId });
  }
};
var registered = false;
var Plugin = class {
  constructor() {
    this.app = new App();
  }
  addSidebarItem(icon, title, callback = () => {
  }) {
    const handlerId = uuid.create();
    callHandlers.set(handlerId, callback);
    self.postMessage({
      type: "register",
      target: "sidebarItem",
      icon,
      title,
      handlerId
    });
  }
  async loadData() {
    return hostCall("loadData");
  }
  async saveData(data) {
    await hostCall("saveData", { data });
  }
  addSettingTab(tab) {
    tab.plugin = this;
    const displayHandlerId = uuid.create();
    callHandlers.set(displayHandlerId, () => {
      tab.containerEl = new VirtualEl("div");
      tab.display();
      return tab.containerEl._serialize();
    });
    self.postMessage({
      type: "register",
      target: "settingTab",
      name: tab.name ?? null,
      displayHandlerId
    });
    this._settingTab = tab;
  }
  addFeedFilter(callback = () => {
  }) {
    const handlerId = uuid.create();
    callHandlers.set(handlerId, callback);
    self.postMessage({
      type: "register",
      target: "feedFilter",
      handlerId
    });
  }
  // callback(tokens, context) receives the rich-text token stream for one
  // post and returns a new token array (or the input unchanged). The host
  // batches all posts of a render into one call per plugin.
  registerRichTextTransform(callback = (tokens) => tokens) {
    const handlerId = uuid.create();
    callHandlers.set(handlerId, async (batch) => {
      const results = [];
      for (const { tokens, context } of batch) {
        try {
          const value = await callback(tokens, context);
          results.push({ value: serializeTransformTokens(value) });
        } catch (error) {
          results.push({ error: error?.message ?? String(error) });
        }
      }
      return results;
    });
    self.postMessage({
      type: "register",
      target: "richTextTransform",
      handlerId
    });
  }
  registerSlot(name, callback = () => null) {
    const handlerId = uuid.create();
    callHandlers.set(handlerId, async (context) => {
      const result = await callback(context);
      if (result == null) return null;
      if (!(result instanceof VirtualEl)) {
        const description = result?.constructor?.name ?? typeof result;
        throw new Error(
          `Slot "${name}" must return a VirtualEl (or null), got ${description}`
        );
      }
      return result._serialize();
    });
    self.postMessage({
      type: "register",
      target: "slot",
      name,
      handlerId
    });
  }
  onload() {
  }
  onunload() {
  }
  static register() {
    if (registered) return;
    registered = true;
    const instance = new this();
    hostCall("getCurrentUser").then((user) => {
      instance.app.currentUser = user;
      return instance.onload();
    }).then(
      () => self.postMessage({ type: "ready" }),
      (error) => self.postMessage({
        type: "ready",
        error: error?.message ?? String(error)
      })
    );
  }
};
function serializeTransformTokens(tokens) {
  if (!Array.isArray(tokens)) return tokens;
  return tokens.map((token) => {
    if ((token?.type === "inline" || token?.type === "block") && token.node instanceof VirtualEl) {
      return { ...token, node: token.node._serialize() };
    }
    return token;
  });
}
var openModals = /* @__PURE__ */ new Map();
var IconComponent = class {
  constructor(containerEl) {
    this.el = containerEl.createEl("plugin-icon");
  }
  setIcon(name) {
    this.el.setAttr("icon", name);
    return this;
  }
};
var ProfilesListComponent = class {
  constructor(containerEl) {
    this.el = containerEl.createEl("plugin-profiles-list");
  }
  setDids(dids) {
    const value = Array.isArray(dids) ? dids.join(",") : String(dids ?? "");
    this.el.setAttr("dids", value);
    return this;
  }
  setEmptyMessage(message) {
    this.el.setAttr("empty-message", message);
    return this;
  }
};
var PostsFeedComponent = class {
  constructor(containerEl) {
    this.el = containerEl.createEl("plugin-posts-feed");
  }
  setUris(uris) {
    const value = Array.isArray(uris) ? uris.join(",") : String(uris ?? "");
    this.el.setAttr("uris", value);
    return this;
  }
  setEmptyMessage(message) {
    this.el.setAttr("empty-message", message);
    return this;
  }
};
var VirtualEl = class _VirtualEl {
  constructor(tag) {
    this.tag = tag;
    this.attrs = {};
    this.text = null;
    this.children = [];
    this.events = {};
  }
  onClick(fn) {
    const handlerId = uuid.create();
    callHandlers.set(handlerId, fn);
    this.events.click = handlerId;
    return this;
  }
  onChange(fn) {
    const handlerId = uuid.create();
    callHandlers.set(handlerId, fn);
    this.events.change = handlerId;
    return this;
  }
  onInput(fn) {
    const handlerId = uuid.create();
    callHandlers.set(handlerId, fn);
    this.events.input = handlerId;
    return this;
  }
  setText(text) {
    this.text = text;
    this.children = [];
    return this;
  }
  empty() {
    this.text = null;
    this.children = [];
    return this;
  }
  addClass(cls) {
    this.attrs.class = this.attrs.class ? `${this.attrs.class} ${cls}` : cls;
    return this;
  }
  setAttr(name, value) {
    this.attrs[name] = value === void 0 ? "" : value;
    return this;
  }
  createEl(tag, options = {}, callback) {
    const child = new _VirtualEl(tag);
    if (options.text != null) child.text = options.text;
    if (options.cls) {
      child.attrs.class = Array.isArray(options.cls) ? options.cls.join(" ") : options.cls;
    }
    if (options.attr) Object.assign(child.attrs, options.attr);
    this.children.push(child);
    if (typeof callback === "function") callback(child);
    return child;
  }
  createDiv(options = {}, callback) {
    return this.createEl("div", options, callback);
  }
  createSpan(options = {}, callback) {
    return this.createEl("span", options, callback);
  }
  createProfilesList(callback) {
    const component = new ProfilesListComponent(this);
    if (typeof callback === "function") callback(component);
    return component;
  }
  createPostsFeed(callback) {
    const component = new PostsFeedComponent(this);
    if (typeof callback === "function") callback(component);
    return component;
  }
  createIcon(callback) {
    const component = new IconComponent(this);
    if (typeof callback === "function") callback(component);
    return component;
  }
  _serialize() {
    return {
      tag: this.tag,
      attrs: this.attrs,
      text: this.text,
      children: this.children.map((child) => child._serialize()),
      events: this.events
    };
  }
};
self.onmessage = async (event) => {
  const message = event.data;
  if (!message || typeof message !== "object") return;
  if (message.type === "call") {
    const fn = callHandlers.get(message.handlerId);
    if (!fn) {
      self.postMessage({
        type: "result",
        callId: message.callId,
        error: `unknown handler ${message.handlerId}`
      });
      return;
    }
    try {
      const value = await fn(...message.args);
      self.postMessage({ type: "result", callId: message.callId, value });
    } catch (error) {
      self.postMessage({
        type: "result",
        callId: message.callId,
        error: error.message ?? String(error)
      });
    }
    return;
  }
  if (message.type === "hostResult") {
    const pending = pendingHostCalls.get(message.hostCallId);
    if (!pending) return;
    pendingHostCalls.delete(message.hostCallId);
    if (message.error) pending.reject(new Error(message.error));
    else pending.resolve(message.value);
    return;
  }
  if (message.type === "event") {
    switch (message.event) {
      case "modalDismissed": {
        const modal = openModals.get(message.data.modalId);
        if (modal) {
          openModals.delete(message.data.modalId);
          modal.onClose();
        }
        return;
      }
    }
    return;
  }
};

// src/main.js
var FACET_TYPE = "blue.moji.richtext.facet";
var COLLECTION = "blue.moji.collection.item";
var verificationCache = /* @__PURE__ */ new Map();
function aliasToRkey(alias) {
  const stripped = alias.replace(/^:+|:+$/g, "");
  if (!stripped) return null;
  return punycodeEncode(stripped);
}
async function verifyEmoji(plugin, did, alias) {
  const rkey = aliasToRkey(alias);
  console.log("[bluemoji] verifyEmoji", { did, alias, rkey });
  if (!rkey) return null;
  const key = `${did}\0${rkey}`;
  let promise = verificationCache.get(key);
  if (!promise) {
    promise = plugin.app.data.getRecord(did, COLLECTION, rkey).catch((error) => {
      verificationCache.delete(key);
      throw error;
    });
    verificationCache.set(key, promise);
  }
  try {
    return await promise;
  } catch {
    return null;
  }
}
function extractPng128Cid(record) {
  const cid = record?.value?.formats?.png_128?.ref?.$link;
  return typeof cid === "string" ? cid : null;
}
function buildEmojiNode({ did, cid, alt }) {
  const node = new VirtualEl("plugin-blob-image");
  node.setAttr("did", did);
  node.setAttr("cid", cid);
  node.setAttr("alt", alt);
  node.setAttr("cdn-prefix", "avatar_thumbnail");
  node.addClass("bluemoji");
  return node;
}
async function transformToken(plugin, token) {
  if (token.type !== "facet") return token;
  const feature = token.facet?.features?.find((f) => f?.$type === FACET_TYPE);
  if (!feature) return token;
  const did = feature.did;
  const alias = feature.name;
  if (typeof did !== "string" || typeof alias !== "string") return token;
  const record = await verifyEmoji(plugin, did, alias);
  if (!record) return token;
  const cid = extractPng128Cid(record);
  if (!cid) return token;
  const value = record.value ?? {};
  const alt = typeof value.alt === "string" && value.alt.length > 0 ? value.alt : alias;
  return {
    type: "inline",
    node: buildEmojiNode({ did, cid, alt })
  };
}
function punycodeEncode(input) {
  const BASE = 36;
  const TMIN = 1;
  const TMAX = 26;
  const SKEW = 38;
  const DAMP = 700;
  const INITIAL_BIAS = 72;
  const INITIAL_N = 128;
  function adapt(delta2, numPoints, firstTime) {
    let d = firstTime ? Math.floor(delta2 / DAMP) : delta2 >> 1;
    d += Math.floor(d / numPoints);
    let k = 0;
    while (d > (BASE - TMIN) * TMAX >> 1) {
      d = Math.floor(d / (BASE - TMIN));
      k += BASE;
    }
    return k + Math.floor((BASE - TMIN + 1) * d / (d + SKEW));
  }
  function digitToChar(digit) {
    return String.fromCharCode(digit < 26 ? digit + 97 : digit - 26 + 48);
  }
  const codePoints = [];
  for (const ch of input) codePoints.push(ch.codePointAt(0));
  const basic = codePoints.filter((cp) => cp < 128);
  let output = basic.map((cp) => String.fromCodePoint(cp)).join("");
  const basicCount = basic.length;
  let handled = basicCount;
  if (handled < codePoints.length && basicCount > 0) output += "-";
  let n = INITIAL_N;
  let delta = 0;
  let bias = INITIAL_BIAS;
  while (handled < codePoints.length) {
    let m = Infinity;
    for (const cp of codePoints) {
      if (cp >= n && cp < m) m = cp;
    }
    if (m - n > Math.floor((2147483647 - delta) / (handled + 1))) return null;
    delta += (m - n) * (handled + 1);
    n = m;
    for (const cp of codePoints) {
      if (cp < n) {
        delta++;
        if (delta > 2147483647) return null;
      } else if (cp === n) {
        let q = delta;
        for (let k = BASE; ; k += BASE) {
          const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
          if (q < t) break;
          output += digitToChar(t + (q - t) % (BASE - t));
          q = Math.floor((q - t) / (BASE - t));
        }
        output += digitToChar(q);
        bias = adapt(delta, handled + 1, handled === basicCount);
        delta = 0;
        handled++;
      }
    }
    delta++;
    n++;
  }
  return output;
}
var BluemojiPlugin = class extends Plugin {
  async onload() {
    this.stylesnippet = new StyleSnippet(`
      plugin-blob-image.bluemoji {
        vertical-align: text-bottom;
        height: 1.25em;
      }
      plugin-blob-image.bluemoji img {
        height: 1.25em;
        width: 1.25em;
        max-height: 1.25em;
        object-fit: contain;
      }
    `);
    this.registerRichTextTransform(
      async (tokens) => Promise.all(tokens.map((token) => transformToken(this, token)))
    );
  }
  onunload() {
    this.stylesnippet?.remove();
  }
};
