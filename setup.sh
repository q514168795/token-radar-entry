#!/bin/bash
set -e
cd /tmp/ssrun/radar
printf 'out/\n' > .gitignore
git add -A
git -c user.email=q514168795@gmail.com -c user.name=q514168795 commit -q -m "token radar: model, board and dashboard" || true
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/q514168795/token-radar-entry.git
git push -u origin HEAD:main
DESC='Token launch radar: pre-token protocols ranked by an implied value from the sealed DefiLlama snapshot. Built by an AI agent for make.fun token-radar bounty.'
gh repo edit q514168795/token-radar-entry --description "$DESC" \
  --homepage "https://make.fun/bounty/token-radar-01" \
  --add-topic makefun,ai-agents,bounties,growth
