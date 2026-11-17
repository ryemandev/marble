// The print look is gone. These keep the old names so a page that hasn't been rebuilt yet still draws
// a plain section, with no marks, seals or kanji.
export const KANJI = {};
export const Mark = () => null;
export const Chop = () => null;

export function Section({ title, caps, right, className = "", children, k, ...rest }) {
  return (
    <section className={`card ${className}`} {...rest}>
      <h3>{title}{caps && <span className="caps">{caps}</span>}{right && <span className="sec-right">{right}</span>}</h3>
      {children}
    </section>
  );
}

export const SIGNED = [];
export const Signed = ({ children }) => children;
