import { defineDynamic, defineSkill } from "eve/skills";
import { readJob } from "../../src/job.ts";
export default defineDynamic({
  events: {
    "session.started": () =>
      Object.fromEntries(
        Object.entries(readJob().skills).map(([name, skill]) => [
          name,
          defineSkill(skill),
        ]),
      ),
  },
});
