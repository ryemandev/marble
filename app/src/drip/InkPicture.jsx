import { useReveal } from "./motion";
import { coverTone } from "../views/study/model.js";

// A picture from Marble's library, pressed to hard black and white. The first time it's seen, ink runs down
// over it with the drips leading, and its foot stays dripped into the page. edge={false} gives a plain crop,
// for thumbnails and anything small. Anything placed inside sits on top of the picture.
export default function InkPicture({ src, srcSet, sizes, at = "50% 40%", alt = "", edge = true, className = "", style, children, ...rest }) {
  const seen = useReveal();
  const img = <img src={src} srcSet={srcSet} sizes={sizes} alt={alt} style={{ objectPosition: at }} loading="lazy" decoding="async" draggable="false" />;
  return (
    <figure ref={seen} className={`ink-pic ${edge ? "dripped" : ""} ${className}`} style={{ "--tone": coverTone(src), ...style }} {...rest}>
      {edge ? <span className="ink-run">{img}</span> : img}
      {children}
    </figure>
  );
}
