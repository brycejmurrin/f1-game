#!/bin/bash
cd /home/user/f1-game
for s in ui-scale ui-resize; do
  t=$(date +%s)
  npm test -- tests/specs/$s.spec.js --workers=1 --retries=0 > artifacts/test-review/platform/$s.run2.log 2>&1
  echo "= run $s exit $? $(( $(date +%s)-t ))s"
done
echo "= chain2 done"
