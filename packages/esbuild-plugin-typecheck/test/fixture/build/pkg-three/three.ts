import { walk } from 'typecheck-fixture-one';
import { moonWalk } from 'typecheck-fixture-two';

export async function* multiWalk(dirPath: string) {
  const earth = walk(dirPath);
  const moon = moonWalk(dirPath);
  let earthDone;
  let moonDone;
  while (!earthDone && !moonDone) {
    if (!earthDone) {
      let earthPath = await earth.next();
      yield earthPath.value;
      earthDone = earthPath.done;
    }
    if (!moonDone) {
      let moonPath = await moon.next();
      yield moonPath.value;
      moonDone = moonPath.done;
    }
  }
}
