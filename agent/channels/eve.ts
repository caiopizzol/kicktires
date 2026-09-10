import { eveChannel } from "eve/channels/eve";
import { httpBasic } from "eve/channels/auth";
export default eveChannel({
  auth: (request) => {
    const password = process.env.KICKTIRES_PASSWORD;
    if (!password) throw new Error("Start the review service through the CLI");
    return httpBasic({ username: "reviewer", password })(request);
  },
});
