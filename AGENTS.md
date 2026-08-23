# Repository agent notes

- On Windows, if the sandboxed `apply_patch` helper fails with `helper_unknown_error` or its native
  wrapper corrupts multiline arguments, do not spend time retrying or debugging it. Edit only the
  scoped workspace files directly, then verify the result with `git diff`.
