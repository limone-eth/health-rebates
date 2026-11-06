# Who applies the lab rule: the model or plain code?

Decided: 2026-11-06 · Case: c_9ee1d7f9-39ad-46ac-946f-7c584f34dcc9

## Question and choice
The model gave wrong answers when it had to return only `test_found` and `rule_met`. Should the model read the values in the TEE, and plain code apply the lab rule?

The owner chose: "The model reads the values in the TEE. Plain code applies the lab rule. The contract checks the NEAR AI signature on the hashes and the service signature on the result."

This changes one line of [the private AI record](2026-11-06-private-ai-role.md): the model no longer returns only `test_found` and `rule_met`.

## Why
- It is the only design that gave each answer correctly: 12 of 12, on six synthetic reports run two times each. The current design gave 8 to 10 of 12, and the design with step booleans gave 10 of 12.
- The model must run with `reasoning_effort: "none"`, because reasoning text can hold report values. With no reasoning and JSON only, it missed the 0.3-point improvement in %, and it was not reliable on dates. It reads the values correctly.
- It uses the same trust as wearable claims: the model reads, and code decides. It is also faster: 0.6 to 3.5 s for each report.

## Constraints
- The model returns the values only: the latest HbA1c (value, unit, date) and an earlier one, or null.
- Plain code applies the rule: a test in the last 12 months, and HbA1c under 5.7% or 0.3 points better than the last test. Percent = mmol/mol / 10.929 + 2.15.
- The response body, which holds the values, does not go on-chain. On-chain: the request hash, the response hash, `test_found` and `rule_met`.
- The contract checks the NEAR AI signature on (model, request_hash, response_hash), and the service signature on (contract, member, year, request_hash, response_hash, test_found, rule_met).
- The server stores no report and no value.

## Ruled out
- The model decides, with step booleans in the answer: 10 of 12 correct, and more health data on-chain (for example `under_5_7`).
- Keep the current record (two booleans only): 8 to 10 of 12 correct. A visitor can see a wrong result.

## Comments
none

## Open questions
- The contract cannot read the model's answer, so it trusts the service to apply the rule to that signed answer. The member keeps the signed answer, so an auditor can check it later. The trust table must say this.

## Sources
- Case c_9ee1d7f9-39ad-46ac-946f-7c584f34dcc9
- `tee/lab-check.mjs`, `tee/lab-samples.mjs`, `web/public/lab-samples/`
- [The private AI record](2026-11-06-private-ai-role.md)
