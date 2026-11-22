# Vercel persistence setup

The app reads and saves `meetings.json` and `interview.json` through the GitHub Contents API on Vercel.

Add these environment variables in the Vercel project under **Settings → Environment Variables**:

- `GITHUB_REPOSITORY` = `timz204/calendar-demo`
- `GITHUB_BRANCH` = `main`
- `GITHUB_TOKEN` = a GitHub fine-grained personal access token

The token needs repository access to `timz204/calendar-demo` and **Contents: Read and write** permission.

Redeploy after saving the variables. Check `/api/storage`:

- `githubConfigured: true` means saves can commit to GitHub.
- `githubConfigured: false` means `GITHUB_TOKEN` is missing.

Never commit the token or a `.env` file containing it.
