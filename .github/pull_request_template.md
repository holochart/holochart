<!--
PR title must follow Conventional Commits, e.g. `feat(render): add instanced marker primitive`.
PRs are squash-merged, so the title becomes the commit message on main.
See CONTRIBUTING.md for details.
-->

## Summary

<!-- What does this change do, and why? -->

## Linked story / issue

<!-- Plan story id (e.g. E2.4) and/or issue link. -->

- Story:
- Closes #

## Type of change

- [ ] `feat`: new feature
- [ ] `fix`: bug fix
- [ ] `perf`: performance improvement
- [ ] `refactor`: no behavior change
- [ ] `docs`: documentation only
- [ ] `test`: tests only
- [ ] `build` / `ci` / `chore`: tooling, CI, or maintenance
- [ ] Breaking change (`!` in the title or a `BREAKING CHANGE:` footer)

## Checklist

- [ ] PR title follows Conventional Commits with the package scope (e.g. `fix(core): ...`)
- [ ] Unit tests added or updated for pure logic
- [ ] Examples added or updated for visual changes (deterministic, seeded RNG)
- [ ] Visual baseline changes are intentional and reviewed (or none)
- [ ] No per-point object allocation; uses instanced/batched primitives
- [ ] `dispose()` frees all GPU resources and listeners
- [ ] New or changed attributes are declared in the schema (source of truth)
- [ ] Docs updated; ADR added or updated for architectural changes
- [ ] Bundle size and accessibility considered
- [ ] Changeset added for user-facing changes to published packages (once Changesets is set up)

## Screenshots

<!-- For visual changes: before/after images, or the relevant baseline diffs. Delete if not applicable. -->

| Before | After |
| ------ | ----- |
|        |       |

## Notes for reviewers

<!-- Anything reviewers should focus on, known limitations, follow-ups. -->
