import { defineDynamic, defineMcpClientConnection } from "eve/connections";
import { readJob } from "../../src/job.ts";
export default defineDynamic({
  events: {
    "session.started": () =>
      Object.fromEntries(
        Object.entries(readJob().profile.connections).map(
          ([name, connection]) => [
            name,
            defineMcpClientConnection({
              url: connection.url,
              description: connection.description,
              instanceKey: name,
              tools: { allow: connection.tools },
              ...(connection.tokenEnv
                ? {
                    auth: {
                      getToken: async () => {
                        const token = process.env[connection.tokenEnv!];
                        if (!token)
                          throw new Error(
                            `Missing connection token: ${connection.tokenEnv}`,
                          );
                        return { token };
                      },
                    },
                  }
                : {}),
            }),
          ],
        ),
      ),
  },
});
