# Reusable review skills

Portable Markdown skills and supporting files. This package has no Eve dependency.
Install a pinned version and expose each directory through your agent's skill loader.
`review-code` depends on `get-context` and `verify-change`, included here.

The consuming application must supply repository/diff reading, bounded terminal
execution and writable disposable test space. Browser verification requires a browser
tool and application startup mechanism. External context requires explicitly configured
connections. Provide a capability guide mapping these requirements to actual tools.
Credentials, repository selection and deployment configuration belong to the application.
