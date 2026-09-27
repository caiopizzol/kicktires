import { defineAgent, defineDynamic } from "eve";
import { readJob } from "../src/job.ts";
import { resolveModel } from "../src/model.ts";

export default defineAgent({
  model: defineDynamic({
    events: {
      "step.started": () => {
        const job = readJob();
        const { model } = job.profile;
        return {
          model: resolveModel(model, job.directory, job.profile.limits.modelSeconds),
          modelContextWindowTokens: model.context,
        };
      },
    },
  }),
  defaultTools: false,
  limits: {
    maxInputTokensPerSession: 2000000,
    // Includes reasoning: the largest measured xhigh review used about 29,000.
    maxOutputTokensPerSession: 64000,
  },
});
