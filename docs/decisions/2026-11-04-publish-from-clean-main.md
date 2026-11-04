# How do we publish the code with no old brand name?

Decided: 2026-11-04 · Case: c_1ab8aef3-bfd8-4fb3-aa44-c1100e61143d

## Question and choice

PRs 1 to 5 were merged, but the first repo still showed the old brand name in 3 commits of PR 5.

The owner chose: "Make a new public repo named health-rebates that holds only the clean main. This repo stays private."

The owner changed the option with this message: "delete the old one and anything else related to it".

## Why

- The owner gave no other reason.
- My reasons: this is the one option that keeps the name out of public view. Judges need the code and the README, not the PR history.

## Constraints

- The public repo holds only main. It has no PR refs and no other branches.
- The name is not in the files or the commits on main. A scan found 0 matches.
- A key scan of all commits on main found 0 matches. The only env file in git is `.env.example`.
- The first repo is deleted only after the new repo passes the check with no login.
- The owner deletes the first repo. It is a permanent delete, so the agent does not do it.
- Later fixes go in as new PRs on the new repo.

## Ruled out

- "Make this repo public": anyone who opens PR 5 can read the name.
- "Rewrite PR 5, then publish": a force-push cannot clear the PR ref, and the permission check blocked it.

## Comments

- "delete the old one and anything else related to it": I give the owner the delete command, because the agent does not do permanent deletes. I asked what "anything else" covers. The answer is in [the hosted copy record](2026-11-04-hosted-copy-name.md).

## Open questions

- Product name. "Good Week" is only a placeholder.

## Sources

- Case c_1ab8aef3-bfd8-4fb3-aa44-c1100e61143d, which follows c_98ff9788-1b57-4238-892f-840dd176f338.
- A scan of a full mirror of the first repo on 2026-11-04.
