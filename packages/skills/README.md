# Review skills

Portable Markdown with no Eve dependency. Copy a pinned version into your agent's
skill loader. `review-code` requires the included `get-context` and `verify-change`.

The consuming application supplies tools for reading source/diffs, bounded commands
and temporary tests. Browser checks need a browser tool and app startup; external
context needs configured connections. Provide a guide mapping capabilities to tools.
Skills do not supply credentials, runtimes or deployment configuration.
