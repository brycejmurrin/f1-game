# Delegation prompt for a circuit author (track-surveyor)

Fill the `<…>` fields; one prompt, and one track-surveyor subagent, per circuit. Children never run a browser (AGENTS.md rule 10).

```
Circuit <id>, target <year/layout>. Start SHA <sha>. Evidence: scratch/survey-track/<id>/evidence.json
OWNED: js/circuits/<id>.js, js/circuits/scenery/<id>.js, docs/tracks/<id>.md
FORBIDDEN: js/track/**, js/render/**, assets/pack/**, tests/**, any other circuit, generated files
Goal: <3-5 observable improvements, each with an evidence id>
Done when: node tools/track/verify-track.cjs <id> passes; hand back the diff summary,
measured geometry/asset cost, and remaining gaps. Browser checks: report unverified.
Do not enable auto-merge or merge.
```

Shared engine or asset needs: stop and report; the parent names one owner first.
