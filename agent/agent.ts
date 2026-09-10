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
          model: resolveModel(model, job.directory),
          modelContextWindowTokens: model.contextWindow,
        };
      },
    },
  }),
  defaultTools: false,
  limits: {
    maxInputTokensPerSession: 2000000,
    maxOutputTokensPerSession: 24000,
  },
});
