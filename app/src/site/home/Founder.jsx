import Letter from "../founder/Letter";
import { sectionUrl } from "../Header";
import DripEdge from "../ink/DripEdge";

const SHORT_STORY = [
  { key: "who", text: "I'm Jules, and I trade. Replace this with a line about who you are." },
  { key: "cost", text: "Write about what trading without a journal cost you." },
  { key: "why", text: "Write about why you run this journal." },
];

export default function Founder() {
  return <div className="hm-after-ink"><DripEdge /><Letter story={SHORT_STORY} full={sectionUrl("founder")} /></div>;
}
