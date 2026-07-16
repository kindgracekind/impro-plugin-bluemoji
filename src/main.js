import { Plugin, StyleSnippet, VirtualEl } from "@impro.social/impro-plugin";

const FACET_TYPE = "blue.moji.richtext.facet";
const COLLECTION = "blue.moji.collection.item";

// (did, rkey) → Promise<record | null>. Records are immutable, so caching for
// the worker's lifetime is safe.
const verificationCache = new Map();

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
    promise = plugin.app.data
      .getRecord(did, COLLECTION, rkey)
      .catch((error) => {
        // Transient failures: don't cache, let the next render retry.
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
  const alt =
    typeof value.alt === "string" && value.alt.length > 0 ? value.alt : alias;
  return {
    type: "inline",
    node: buildEmojiNode({ did, cid, alt }),
  };
}

// Minimal RFC 3492 (Punycode) encoder — the Bluemoji spec derives each record's
// rkey from its `:shortcode:` alias this way. Pure-ASCII inputs pass through.
function punycodeEncode(input) {
  const BASE = 36;
  const TMIN = 1;
  const TMAX = 26;
  const SKEW = 38;
  const DAMP = 700;
  const INITIAL_BIAS = 72;
  const INITIAL_N = 128;

  function adapt(delta, numPoints, firstTime) {
    let d = firstTime ? Math.floor(delta / DAMP) : delta >> 1;
    d += Math.floor(d / numPoints);
    let k = 0;
    while (d > ((BASE - TMIN) * TMAX) >> 1) {
      d = Math.floor(d / (BASE - TMIN));
      k += BASE;
    }
    return k + Math.floor(((BASE - TMIN + 1) * d) / (d + SKEW));
  }

  function digitToChar(digit) {
    return String.fromCharCode(digit < 26 ? digit + 97 : digit - 26 + 48);
  }

  const codePoints = [];
  for (const ch of input) codePoints.push(ch.codePointAt(0));
  const basic = codePoints.filter((cp) => cp < 0x80);
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
    if (m - n > Math.floor((0x7fffffff - delta) / (handled + 1))) return null;
    delta += (m - n) * (handled + 1);
    n = m;
    for (const cp of codePoints) {
      if (cp < n) {
        delta++;
        if (delta > 0x7fffffff) return null;
      } else if (cp === n) {
        let q = delta;
        for (let k = BASE; ; k += BASE) {
          const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
          if (q < t) break;
          output += digitToChar(t + ((q - t) % (BASE - t)));
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

export default class BluemojiPlugin extends Plugin {
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
      async (tokens) =>
        Promise.all(tokens.map((token) => transformToken(this, token))),
      { handlesFacetTypes: ["blue.moji.richtext.facet"] },
    );
  }

  onunload() {
    this.stylesnippet?.remove();
  }
}
