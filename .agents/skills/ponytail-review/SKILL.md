---
name: ponytail-review
description: Review code only for over-engineering, unnecessary dependencies, and speculative abstractions when the user invokes /ponytail-review.
disable-model-invocation: true
---

# Ponytail Review

Review only the requested diff or files for:

- Complexity that does not serve the requested behavior.
- Dependencies that could be replaced by existing code or platform features.
- Abstractions, options, configuration, or extension points with no current caller or requirement.

Do not report general correctness, security, style, or performance findings unless the issue is itself unnecessary complexity. Preserve required validation, authorization, accessibility, error handling, and tests.

Write exactly one line per finding in this format:

`<file>:L<line>: <unneeded element and why>. <smallest removal or simplification>.`

If no finding qualifies, write: `No over-engineering findings.`
