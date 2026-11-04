// A WCAG contrast check that runs inside the page: give CONTRAST_JS to
// page.eval() and it returns every piece of text that is too faint to read,
// as { text, ratio, need }. An empty list means the page passes.
//
// For each visible element that holds text of its own (not only in its
// children), the text colour is compared with what it sits on: the nearest
// background colour from the element upwards, see-through ones laid over
// the next one down, ending on the page's own background. Anything inside
// aria-hidden="true" is decoration and is skipped.
export const CONTRAST_JS = `(() => {
  // The canvas turns any CSS colour (rgb, color-mix's color(srgb ...), ...) into bytes.
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  ctx.canvas.width = ctx.canvas.height = 1;
  const rgba = (css) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = 'transparent';
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
  const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
  const luminance = ([r, g, b]) => {
    const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };

  const backgroundOf = (el) => {
    const layers = [];
    for (let node = el; node; node = node.parentElement) {
      const colour = rgba(getComputedStyle(node).backgroundColor);
      if (colour[3] > 0) layers.push(colour);
      if (colour[3] >= 1) break;
    }
    // Below everything is the browser's white canvas.
    return layers.reduceRight((under, top) => over(top, under), [255, 255, 255, 1]);
  };

  const failures = [];
  for (const el of document.querySelectorAll('body, body *')) {
    const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
    if (!own || el.closest('[aria-hidden="true"]')) continue;
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const box = el.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) continue;

    const style = getComputedStyle(el);
    const bg = backgroundOf(el);
    const fg = over(rgba(style.color), bg);
    const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
    const ratio = (hi + 0.05) / (lo + 0.05);

    // Large text (24px, or 18.66px bold) needs 3:1; everything else 4.5:1.
    const size = parseFloat(style.fontSize);
    const need = size >= 24 || (size >= 18.66 && parseInt(style.fontWeight, 10) >= 700) ? 3 : 4.5;
    if (ratio < need) {
      failures.push({ text: el.textContent.trim().replace(/\\s+/g, ' ').slice(0, 60), ratio: Math.round(ratio * 100) / 100, need });
    }
  }
  return failures;
})()`;
