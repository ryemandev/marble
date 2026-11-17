const root = document.documentElement;
const touch = matchMedia("(pointer: coarse)").matches;
const settle = performance.now() + 1500;
let w = -1, h = -1;

const check = (e) => {
  if (!innerHeight || !innerWidth) return;
  if (touch && innerWidth === w && h > 0 && performance.now() > settle) return;
  w = innerWidth;
  if (innerHeight === h) return;
  const first = h < 0;
  h = innerHeight;
  root.style.setProperty("--vh", `${h / 100}px`);
  if (!first && e?.type !== "resize") dispatchEvent(new Event("resize"));
};
check();
addEventListener("resize", check);
document.addEventListener("DOMContentLoaded", check);
addEventListener("load", check);
[150, 600, 1300].forEach((ms) => setTimeout(check, ms));
