/* Apex 26 — canvas painter, PNG encoder and Web Share/download delivery. */
"use strict";

const ShareCard = (function () {
  let fontsReady = null;

  function paintQr(ctx, op) {
    if (typeof NetQr === "undefined" || !NetQr.encode) return;
    const qr = NetQr.encode(op.text);
    if (!qr) return;
    const quiet = NetQr.QUIET || 4, total = qr.size + quiet * 2;
    const scale = Math.max(1, Math.floor(Math.min(op.width, op.height) / total));
    const size = total * scale, ox = op.x + (op.width - size) / 2, oy = op.y + (op.height - size) / 2;
    ctx.fillStyle = op.background || "#fff"; ctx.fillRect(ox, oy, size, size);
    ctx.fillStyle = op.color || "#000";
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) {
        if (qr.modules[y * qr.size + x]) ctx.fillRect(ox + (x + quiet) * scale, oy + (y + quiet) * scale, scale, scale);
      }
    }
  }
  function paint(ctx, ops) {
    if (!ctx) throw new Error("Image composition is unavailable");
    ctx.save();
    for (const op of ops || []) {
      if (op.op === "rect") {
        ctx.fillStyle = op.color; ctx.fillRect(op.x, op.y, op.width, op.height);
      } else if (op.op === "text") {
        ctx.fillStyle = op.color; ctx.font = (op.weight || "600") + " " + op.size + "px 'Barlow Condensed', system-ui, sans-serif";
        ctx.textAlign = op.align || "left"; ctx.textBaseline = "middle";
        ctx.fillText(op.text, op.x, op.y, op.maxWidth);
      } else if (op.op === "line") {
        ctx.beginPath(); ctx.strokeStyle = op.color; ctx.lineWidth = op.lineWidth || 1;
        ctx.moveTo(op.x, op.y); ctx.lineTo(op.x2, op.y2); ctx.stroke();
      } else if (op.op === "qr") paintQr(ctx, op);
    }
    ctx.restore();
    return ctx;
  }

  function ensureFonts(doc) {
    if (fontsReady) return fontsReady;
    const fonts = doc && doc.fonts;
    if (!fonts || typeof fonts.load !== "function") return Promise.resolve(false);
    fontsReady = Promise.race([
      Promise.all([
        fonts.load("700 48px 'Barlow Condensed'"),
        fonts.load("600 24px 'Titillium Web'"),
      ]).then(() => true, () => false),
      new Promise((resolve) => setTimeout(() => resolve(false), 1500)),
    ]);
    return fontsReady;
  }
  function blobOf(canvas) {
    if (canvas && typeof canvas.convertToBlob === "function") return canvas.convertToBlob({ type: "image/png" });
    return new Promise((resolve, reject) => {
      if (!canvas || typeof canvas.toBlob !== "function") { reject(new Error("PNG encoding is unavailable")); return; }
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The share card could not be encoded")), "image/png");
    });
  }
  async function render(model, specName, opts) {
    opts = opts || {};
    const doc = opts.document || (typeof document !== "undefined" ? document : null);
    await ensureFonts(doc);
    const spec = ShareCardLayout.SPECS[specName || "portrait"];
    if (!spec) throw new Error("Unknown share-card size");
    let canvas;
    if (typeof OffscreenCanvas === "function") canvas = new OffscreenCanvas(spec.width, spec.height);
    else {
      if (!doc || typeof doc.createElement !== "function") throw new Error("Canvas is unavailable");
      canvas = doc.createElement("canvas"); canvas.width = spec.width; canvas.height = spec.height;
    }
    try {
      const ctx = canvas.getContext("2d");
      const measure = (text, size) => {
        ctx.font = "700 " + size + "px 'Barlow Condensed', system-ui, sans-serif";
        return ctx.measureText(String(text)).width;
      };
      paint(ctx, ShareCardLayout.layout(model, specName || "portrait", measure));
      return await blobOf(canvas);
    } finally { canvas.width = 0; canvas.height = 0; }
  }

  async function browserDownload(blob, name) {
    if (typeof NativeDownload !== "undefined" && NativeDownload.viable()) {
      await NativeDownload.saveBlob(blob, name); return;
    }
    const url = URL.createObjectURL(blob), anchor = document.createElement("a");
    anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function deliver(blob, name, share, env) {
    if (!blob) throw new Error("No share-card image");
    share = share || {}; env = env || {};
    const nav = env.navigator || (typeof navigator !== "undefined" ? navigator : null);
    const download = env.download || browserDownload;
    const FileCtor = env.File || (typeof File === "function" ? File : null);
    if (nav && FileCtor && typeof nav.canShare === "function" && typeof nav.share === "function") {
      const file = new FileCtor([blob], name, { type: blob.type || "image/png" });
      const payload = { files: [file], title: share.title || "APEX 26", text: share.text || "" };
      if (share.url) payload.url = share.url;
      if (nav.canShare(payload)) {
        try { await nav.share(payload); return "shared"; }
        catch (error) { if (error && error.name === "AbortError") return "cancelled"; }
      }
    }
    await download(blob, name);
    return "downloaded";
  }

  return Object.freeze({ paint, render, deliver, ensureFonts });
})();
Object.freeze(ShareCard);
