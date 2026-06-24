// The persistent docs shell (segment boundary): rendered once, soft-navs swap only the
// <JuneOutlet> content inside it — so the sidebar (and its open folders) stay put.
import { kura } from "../kura.config";

export const segmentBoundary = true;
export default kura.layout;
