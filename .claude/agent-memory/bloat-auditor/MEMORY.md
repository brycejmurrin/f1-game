# bloat-auditor memory

One line per finding the parent rejected:
`file:line — kind — why not — recorded-at: <full commit SHA>`.
Record the SHA whose file content was reviewed, not a later commit.

An entry is believed only while the code it judged is unchanged. Compare the
cited file against `recorded-at` before suppressing a finding. If the file
changed, the recorded commit is unavailable, or an older entry lacks a SHA,
re-check the rejection instead of trusting it. A refusal often depended on
surrounding lines that have since moved.
