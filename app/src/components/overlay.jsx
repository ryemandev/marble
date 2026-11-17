import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const layers = [];
window.addEventListener("keydown", (e) => {
  const top = layers[layers.length - 1];
  if (!top) return;
  if (e.key === "Escape") {
    e.preventDefault();
    top.current.onEscape?.();
  } else top.current.onKey?.(e);
});

export function useLayer(active, handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!active) return;
    layers.push(ref);
    return () => {
      const i = layers.lastIndexOf(ref);
      if (i >= 0) layers.splice(i, 1);
    };
  }, [active]);
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(active, containerRef) {
  useEffect(() => {
    const el = containerRef.current;
    if (!active || !el) return;
    const before = document.activeElement;
    (el.querySelector("[data-autofocus]") || el.querySelector(FOCUSABLE) || el).focus({ preventScroll: true });
    const trap = (e) => {
      if (e.key !== "Tab") return;
      const items = [...el.querySelectorAll(FOCUSABLE)].filter((n) => n.getClientRects().length);
      if (!items.length) return e.preventDefault();
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    el.addEventListener("keydown", trap);
    return () => {
      el.removeEventListener("keydown", trap);
      if (before && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, [active]);
}

let locks = 0;
export function useScrollLock(active) {
  useEffect(() => {
    if (!active) return;
    if (locks++ === 0) document.documentElement.classList.add("scroll-locked");
    return () => { if (--locks === 0) document.documentElement.classList.remove("scroll-locked"); };
  }, [active]);
}

let inerts = 0;
function useInertApp(active) {
  useEffect(() => {
    const root = document.getElementById("root");
    if (!active || !root) return;
    if (inerts++ === 0) root.inert = true;
    return () => { if (--inerts === 0) root.inert = false; };
  }, [active]);
}

// Every sheet leaves the way it came: a short fade. A sheet is taken out of the page the moment it closes, however
// it was closed, so what fades is a still copy of it. The copy can't be touched or tabbed to, and the app under it
// answers straight away.
const LEAVE_MS = 120;
function useLeaving(ref) {
  useLayoutEffect(() => {
    const el = ref.current;
    return () => {
      if (!el?.isConnected || reducedMotion() || el.classList.contains("out")) return; // .out: it has already played its own exit
      const moved = [el, ...el.querySelectorAll("*")].filter((n) => n.scrollTop || n.scrollLeft);
      moved.forEach((n) => n.setAttribute("data-leaving-scroll", `${n.scrollTop},${n.scrollLeft}`));
      const copy = el.cloneNode(true);
      moved.forEach((n) => n.removeAttribute("data-leaving-scroll"));
      for (const a of ["role", "aria-modal", "aria-label", "tabindex"]) copy.removeAttribute(a);
      copy.setAttribute("aria-hidden", "true");
      copy.inert = true;
      copy.classList.add("leaving");
      const drawn = el.querySelectorAll("canvas"), blank = copy.querySelectorAll("canvas");
      drawn.forEach((c, i) => { try { blank[i].getContext("2d").drawImage(c, 0, 0); } catch {} });
      // The copy goes in once the sheet itself is out, in the same frame. If the sheet is still there it wasn't
      // closing at all (React's development double-run of effects), and the copy is dropped.
      queueMicrotask(() => {
        if (el.isConnected) return;
        document.body.appendChild(copy);
        const put = (n) => { const [top, left] = n.getAttribute("data-leaving-scroll").split(","); n.scrollTop = +top; n.scrollLeft = +left; };
        copy.querySelectorAll("[data-leaving-scroll]").forEach(put);
        if (copy.hasAttribute("data-leaving-scroll")) put(copy);
        setTimeout(() => copy.remove(), LEAVE_MS + 40);
      });
    };
  }, []);
}

export function Modal({ label, onClose, onKey, className = "overlay", children }) {
  const ref = useRef(null);
  const downOnBackdrop = useRef(false);
  useLayer(true, { onEscape: onClose, onKey });
  useScrollLock(true);
  useInertApp(true);
  useFocusTrap(true, ref);
  useLeaving(ref);
  return createPortal(
    <div ref={ref} className={className} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
      onPointerDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (downOnBackdrop.current && e.target === e.currentTarget) onClose(); downOnBackdrop.current = false; }}>
      {children}
    </div>,
    document.body,
  );
}

