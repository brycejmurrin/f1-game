// Pixel-content assertions shared by visual specs; independent of PNG compression.
export function frameContent(data) {
  if (!data.length || data.length % 4) throw new Error("invalid RGBA frame");
  let min = Infinity, max = -Infinity, lit = 0;
  for (let i = 0; i < data.length; i += 4) {
    const y = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
    min = Math.min(min, y); max = Math.max(max, y);
    if (y > 8 && data[i + 3] > 0) lit++;
  }
  return { nonblank: max - min > 8 && lit / (data.length / 4) > 0.01, min, max };
}

export function frameDelta(a, b) {
  if (!a.length || a.length !== b.length) throw new Error("frame dimensions changed");
  let delta = 0;
  for (let i = 0; i < a.length; i += 4) {
    delta += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  }
  return delta / (a.length / 4 * 3);
}

// Decode the captured presentation, including hardware CDP captures. Never arms
// a render or a soft blit, so first-frame failures cannot be repaired by sampling.
export async function screenshotPixels(page, buf) {
  return page.evaluate(async (b64) => {
    const blob = await (await fetch("data:image/png;base64," + b64)).blob();
    const image = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    // Adaptive resolution may change the backing buffer between camera cuts.
    // Compare one fixed 16:9 grid, while retaining blankness and image content.
    canvas.width = 256; canvas.height = 144;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
    return Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
  }, buf.toString("base64"));
}
