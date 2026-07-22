# Repository governance

The repository should use `main` as the protected, deployable branch. Feature work is
opened through short-lived branches and merged through pull requests after CI passes.

## One-time GitHub settings

1. Create `main` from the current production commit and make it the default branch.
2. Change both `branch:` values in `render.yaml` to `main` in the same pull request.
3. Add a branch protection rule for `main` requiring the `verify` CI job, one approval,
   resolved conversations and linear history.
4. Disable force pushes and branch deletion on `main`.
5. Keep secrets in Render/GitHub environments only; never place provider credentials in
   repository variables or committed files.

The repository includes a CI workflow, pull-request template and CODEOWNERS file. The
one-time default-branch and protection settings must be applied by a repository admin.
