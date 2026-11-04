# Does "anything else related" include the Vercel copy?

Decided: 2026-11-04 · Case: c_90f45226-3b3f-4731-9de9-974e8d4aaa8c

## Question and choice

The owner said to delete the old repo "and anything else related to it". The hosted copy on Vercel uses the old project name.

The owner chose: "Deploy the hosted copy under a new project named health-rebates. Then you delete the old Vercel project."

## Why

- The owner gave no other reason.
- The option's reasons: the URL matches the new repo, and nothing keeps the old project name.

## Constraints

- The README links to the new URL before the old project is deleted.
- The new copy passes the same checks as the old copy: results show, claim and held requests get a 403, and key and state files get a 404.
- The owner deletes the old Vercel project. It is a permanent delete, so the agent does not do it.

## Ruled out

- "Keep the Vercel copy": the URL keeps the old project name.

## Comments

none

## Open questions

- Product name. "Good Week" is only a placeholder.

## Sources

- Case c_90f45226-3b3f-4731-9de9-974e8d4aaa8c, which follows c_1ab8aef3-bfd8-4fb3-aa44-c1100e61143d.
- `README.md:9`, which holds the only link to the old URL.
