#!/bin/bash
# Finder entry point. Use Bash explicitly even when ZIP tools discard mode bits.
cd -- "$(dirname -- "${BASH_SOURCE[0]}")" || exit 1
/bin/bash ./start-macos.sh "$@"
result=$?
if [ "$result" -ne 0 ] && [ -t 0 ]; then
  printf '\n按回车键关闭窗口……'
  read -r _
fi
exit "$result"
