#!/bin/bash
cd /home/user/f1-game
for s in smoke dev-tools-dom ui-resize dev-tools new-hooks ui-redesign ui-button-touch agent-view ui-scale ui-audit; do
  while [ "$(cut -d' ' -f1 /proc/loadavg | cut -d. -f1)" -ge 3 ]; do sleep 10; done
  echo "= start $s $(date +%T) load $(cut -d' ' -f1 /proc/loadavg)"
  t=$(date +%s)
  npm test -- tests/specs/$s.spec.js --workers=1 --retries=0 > artifacts/test-review/platform/$s.log 2>&1
  echo "= run $s exit $? $(( $(date +%s)-t ))s: $(grep -E '^\s+[0-9]+ (passed|failed|flaky|skipped)' artifacts/test-review/platform/$s.log | tr -s ' ' | tr '\n' ';')"
done
echo "= chain done"
