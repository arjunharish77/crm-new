// Shared horizontal-overflow check for the UI smoke scripts. Returns [] only when the page does
// not scroll sideways. Otherwise it names the offending elements AND text runs (an unbroken word
// such as "Recommendation/ranking" overflows while its <p> box stays inside the viewport), and
// if neither can be identified it still reports the page width, so real overflow never passes.
module.exports = (page) => page.evaluate(() => {
  const limit = innerWidth + 1;
  const clipped = clippedText();
  if (document.documentElement.scrollWidth <= limit) return clipped;
  const label = (node) => `${node.tagName.toLowerCase()}.${String(node.className).slice(0, 70)}`;
  const elements = [...document.querySelectorAll("body *")]
    .filter((node) => node.getBoundingClientRect().right > limit && node.getBoundingClientRect().width > 0)
    .map((node) => `${label(node)} right=${Math.round(node.getBoundingClientRect().right)} "${(node.textContent || "").trim().slice(0, 40)}"`);
  const texts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    const range = document.createRange();
    range.selectNodeContents(text);
    const right = range.getBoundingClientRect().right;
    if (right > limit) texts.push(`text in ${label(text.parentElement)} right=${Math.round(right)} "${text.textContent.trim().slice(0, 40)}"`);
  }
  const found = [...elements, ...texts, ...clipped].slice(0, 10);
  return found.length ? found : [`document scrollWidth=${document.documentElement.scrollWidth} > viewport ${innerWidth}`];

  // Text cut off by an ancestor that hides overflow (e.g. a nowrap button label wider than the
  // button) -- invisible to the page-width check because nothing scrolls. Deliberate truncation
  // with an ellipsis is not reported.
  function clippedText() {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      if (!text.textContent.trim() || !text.parentElement || !text.parentElement.checkVisibility?.()) continue;
      const range = document.createRange();
      range.selectNodeContents(text);
      const box = range.getBoundingClientRect();
      if (!box.width) continue;
      for (let node = text.parentElement; node && node !== document.body; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.textOverflow === "ellipsis") break;
        if (!["hidden", "clip"].includes(style.overflowX)) continue;
        const clip = node.getBoundingClientRect();
        if (clip.width <= 1 || clip.height <= 1) break; // screen-reader-only text, hidden on purpose
        if (box.left < clip.left - 1 || box.right > clip.right + 1) {
          out.push(`clipped text in ${node.tagName.toLowerCase()}.${String(node.className).slice(0, 60)} "${text.textContent.trim().slice(0, 40)}"`);
        }
        break;
      }
    }
    return out.slice(0, 10);
  }
});
