import { defineDynamic, defineTool } from "eve/tools";
import loadSkill from "eve/tools/load_skill";
import { z } from "zod";
import { readJob } from "../../src/job.ts";

export default defineDynamic({
  events: {
    "session.started": () => {
      const names = Object.keys(readJob().skills);
      if (!names.length) return null;
      return defineTool({
        description: loadSkill.description,
        inputSchema: z.strictObject({ skill: z.enum(names) }),
        async execute(input, ctx) {
          return await loadSkill.execute(input, ctx);
        },
      });
    },
  },
});
