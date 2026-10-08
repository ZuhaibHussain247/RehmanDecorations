# Private photo admin setup

The admin page is hosted at `/admin.html` and is publicly reachable, but photo-management actions require a confirmed Supabase user whose email matches the server-side `ADMIN_EMAIL` secret. The GitHub token is only stored as a Supabase Edge Function secret; it is never sent to the browser.

## 1. Create the owner account

In Supabase, open **Authentication → Users** and add your own email as a user with a password. Then open **Authentication → Providers → Email** and make sure the Email provider is enabled for password sign-in. Turn off public sign-ups to prevent new users from registering; this does not disable sign-in for the owner account. Confirm the email address; the function rejects unconfirmed or non-allowlisted accounts.

## 2. Create a fine-grained GitHub token

On GitHub, open **Settings → Developer settings → Personal access tokens → Fine-grained tokens** and create a token with:

- Resource owner: `RehmanDecorations`
- Repository access: only `RehmanDecorations.github.io`
- Repository permissions: **Contents: Read and write**
- Expiration: choose a short duration you can renew

Copy it once. Do not put it in this repository, the admin page, or a chat message.

## 3. Add Edge Function secrets

In Supabase, open **Edge Functions → Secrets** and add:

| Name | Value |
| --- | --- |
| `GITHUB_TOKEN` | The fine-grained token from step 2 |
| `ADMIN_EMAIL` | The exact email used for the owner account |
| `ADMIN_ALLOWED_ORIGIN` | `https://rehmandecorations.github.io` |

The allowed origin is the website host only: no `/RehmanDecoration` path and no trailing slash. If a custom domain is used, put its `https://` origin here instead. Supabase supplies `SUPABASE_URL` and `SUPABASE_ANON_KEY` to the function runtime.

## 4. Deploy the function

Install the Supabase CLI if needed, then run these commands from the repository root:

```text
npx supabase login
npx supabase link --project-ref uyctrdiarleevrwrawph
npx supabase functions deploy manage-photos
```

The repository configuration keeps JWT verification enabled for this function. The function additionally checks the signed-in user's email and allowed website origin before it can read or change repository files.

## 5. Publish and test

The repository must be transferred to or created under the `RehmanDecorations` account as `RehmanDecorations.github.io`, with the website files on its `main` branch. Configure GitHub Pages to deploy from the `main` branch root. After the new repository exists, update this local checkout's Git remote:

```text
git remote set-url origin https://github.com/RehmanDecorations/RehmanDecorations.github.io.git
```

Then commit and push the website changes so GitHub Pages publishes `admin.html`, the Supabase client configuration, and image-management updates. The admin address will be `https://rehmandecorations.github.io/admin.html`.

Open that address to see image previews (these are already public website images). Sign in with the owner account to reveal upload controls and enable image removal, then test with a small image. The admin creates a GitHub commit for each upload or removal; GitHub Pages then builds and publishes the updated site automatically. Large uploads are limited to 8 MB.

Images up to 8 MB are resized to fit within 1920 px and compressed before upload; transparent PNGs retain transparency. Gallery uploads are added as optimized JPEG or PNG images. The admin can also replace or remove the site logo and homepage/About photo. Removing the logo hides it on site pages; replacing it updates the shared logo reference.

If the GitHub token expires, create a replacement token and update the `GITHUB_TOKEN` Edge Function secret. A paused Supabase Free project must be restored from the Supabase dashboard before sign-in or admin actions work.
