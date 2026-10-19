#!/bin/bash
# per unit file: run under V8 coverage, write status + js/ coverage summary
D=docs/notes/test-review-2026-10-19/helpers/car-2; O=artifacts/test-review/car-2
for f in "$@"; do n=$(basename $f .test.mjs); rm -rf $O/cov-$n
  s=$(date +%s); NODE_V8_COVERAGE=$O/cov-$n timeout 600 node -r ./$D/vmname.cjs --test tests/unit/$n.test.mjs >$O/$n.log 2>&1; rc=$?
  echo "== $n rc=$rc $(( $(date +%s)-s ))s"; node $D/cov.mjs $O/cov-$n | sort -t' ' -k2 | sed 's/^/   /'
done
