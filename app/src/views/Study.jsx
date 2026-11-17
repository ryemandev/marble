import { StudyPad } from "./study/Pad";
import { useMedia } from "../lib/useMedia.js";
import "../drip/study/study-screen.css";

export default function Study({ go }) {
  const phone = useMedia("(max-width: 900px)");
  return (
    <div className="view sy" data-tour="study">
      <StudyPad phone={phone} go={go} />
    </div>
  );
}
