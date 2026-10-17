# Delegation prompt for a circuit author (track-surveyor)

Fill the `<…>` fields; one prompt, and one track-surveyor subagent, per circuit. Children never run a browser (AGENTS.md rule 10).

```
Circuit <id>, target <year/layout>. Start SHA <sha>. Evidence: scratch/survey-track/<id>/evidence.json
OWNED (the only writes the edit hook allows): js/circuits/<id>.js, js/circuits/scenery/<id>.js, plus scratch/ and artifacts/
FORBIDDEN: js/track/**, js/render/**, assets/pack/**, tests/**, docs/** (incl. docs/tracks/<id>.md), any other circuit, generated files
Goal: <3-5 observable improvements, each with an evidence id>
Done when: node tools/track/verify-track.cjs <id> passes; hand back the diff summary,
measured geometry/asset cost, and remaining gaps. Browser checks: report unverified.
Do not enable auto-merge or merge.
```

Shared engine or asset needs: stop and report; the parent names one owner first.
The per-circuit brief `docs/tracks/<id>.md` is the PARENT's: after hand-back it updates the brief from the surveyor's report (a surveyor edit there is a denied write).
