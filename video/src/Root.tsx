import { Composition } from "remotion";
import { Main, SCENES, TOTAL } from "./Main";
import { FPS } from "./theme";

const size = { width: 1920, height: 1080, fps: FPS };

export function Root() {
  return (
    <>
      <Composition id="Main" component={Main} durationInFrames={TOTAL} {...size} />
      {/* each scene on its own, for previewing in `npm run studio` */}
      {SCENES.map(({ id, frames, C }) => <Composition key={id} id={id} component={C} durationInFrames={frames} {...size} />)}
    </>
  );
}
