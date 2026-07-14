#!/bin/zsh
# Daily Mindmaps health check — runs from launchd at 6 AM (and on demand).
#
#   1. pull latest, run prod smoke check + full verify (typecheck + unit + e2e)
#   2. if all green  -> post a healthy report to Stickies, done
#   3. if red        -> ask Claude Code to fix, RE-VERIFY, and push to prod ONLY
#                        if the suite is then 100% green; otherwise discard the
#                        attempt and report the failure. Never pushes red code.
#
# Report channel: Stickies (localhost:4444). Auto-fix: claude headless.

set -uo pipefail
export PATH="$HOME/.nvm/versions/node/*/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
REPO="$HOME/Sites/mindmaps"
STICKIES="http://localhost:4444/api/stickies/ext"
LOG="$REPO/test-results/daily-health-$(date +%Y%m%d-%H%M%S).log"
cd "$REPO" || exit 1
mkdir -p test-results

post_sticky() {  # $1 title, $2 html content
  curl -s -m 10 -X POST "$STICKIES" -H "Content-Type: application/json" \
    --data "$(node -e 'const t=process.argv[1],c=process.argv[2];process.stdout.write(JSON.stringify({title:t,type:"html",content:c}))' "$1" "$2")" \
    >/dev/null 2>&1
}

run() { echo "\n\$ $*" | tee -a "$LOG"; "$@" >>"$LOG" 2>&1; }

# 1. latest code (SKIP_GIT=1 to test without touching the working tree)
if [[ "${SKIP_GIT:-0}" != "1" ]]; then
  git stash --include-untracked >/dev/null 2>&1
  git pull --rebase >>"$LOG" 2>&1
  git stash pop >/dev/null 2>&1
fi

# 2. checks
run npm run smoke:prod;  SMOKE=$?
run npm run verify;      VERIFY=$?
DATE="$(date '+%a %b %-d, %-I:%M %p')"

if [[ $SMOKE -eq 0 && $VERIFY -eq 0 ]]; then
  post_sticky "Mindmaps Health - ALL GREEN ($DATE)" \
    "<div style=\"font-family:system-ui;font-size:15px;line-height:1.6\"><div style=\"font-size:18px\">✅ <b>App is healthy</b></div><table style=\"margin-top:8px;border-collapse:collapse\"><tr><td style=\"padding:2px 10px 2px 0\">Prod smoke</td><td><b style=\"color:#16a34a\">pass</b></td></tr><tr><td style=\"padding:2px 10px 2px 0\">Verify (types+unit+e2e)</td><td><b style=\"color:#16a34a\">pass</b></td></tr></table></div>"
  echo "ALL GREEN"; exit 0
fi

# 3. red -> attempt a guardrailed auto-fix
FAILED=""; [[ $SMOKE -ne 0 ]] && FAILED="$FAILED prod-smoke"; [[ $VERIFY -ne 0 ]] && FAILED="$FAILED verify"
BASE_SHA="$(git rev-parse HEAD)"
TAIL="$(tail -c 6000 "$LOG" | sed 's/"/\\"/g' | tr '\n' ' ')"

claude -p "The Mindmaps app daily health check failed:$FAILED. Read the log at $LOG, diagnose the failure, and fix the code. Do NOT commit or push. Keep changes minimal and surgical. When done, stop." \
  --permission-mode acceptEdits --allowedTools "Bash,Read,Edit,Write,Grep,Glob" >>"$LOG" 2>&1

run npm run verify; REVERIFY=$?
if [[ $REVERIFY -eq 0 ]]; then
  git add -A
  git commit -m "fix: auto-repair from daily health check ($DATE)" >>"$LOG" 2>&1
  git push >>"$LOG" 2>&1 && PUSHED=$? || PUSHED=$?
  if [[ ${PUSHED:-1} -eq 0 ]]; then
    post_sticky "Mindmaps Health - AUTO-FIXED + DEPLOYED ($DATE)" \
      "<div style=\"font-family:system-ui;font-size:15px;line-height:1.6\"><div style=\"font-size:18px\">🛠️ <b>Found a problem, fixed it, deployed.</b></div><div style=\"margin-top:6px\">Failed:<b>$FAILED</b>. Fix verified green and pushed to production.</div><div style=\"margin-top:6px;color:#64748b;font-size:13px\">Review the commit when you can.</div></div>"
  else
    post_sticky "Mindmaps Health - FIXED but PUSH FAILED ($DATE)" \
      "<div style=\"font-family:system-ui;font-size:15px;line-height:1.6\"><div style=\"font-size:18px\">⚠️ <b>Fixed locally, couldn't push.</b></div><div style=\"margin-top:6px\">Tests are green but git push failed. Push manually: cd $REPO &amp;&amp; git push</div></div>"
  fi
else
  # auto-fix didn't get to green -> discard the attempt, report for manual review
  git reset --hard "$BASE_SHA" >>"$LOG" 2>&1
  git clean -fd >>"$LOG" 2>&1
  post_sticky "Mindmaps Health - NEEDS YOU ($DATE)" \
    "<div style=\"font-family:system-ui;font-size:15px;line-height:1.6\"><div style=\"font-size:18px\">❌ <b>App check failed - auto-fix couldn't resolve it.</b></div><div style=\"margin-top:6px\">Failed:<b>$FAILED</b>. Nothing was pushed (no red code deployed).</div><div style=\"margin-top:6px;color:#64748b;font-size:13px\">Log: $LOG</div></div>"
fi
echo "DONE (smoke=$SMOKE verify=$VERIFY reverify=${REVERIFY:-NA})"
