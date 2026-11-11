#!/bin/sh
# job.sh NAME 'ADQL' — Gaia archive async query with retries
N=$1; Q=$2
for try in 1 2 3 4 5 6; do
  J=$(curl -s -m 120 -i "https://gea.esac.esa.int/tap-server/tap/async" --data-urlencode "REQUEST=doQuery" --data-urlencode "LANG=ADQL" --data-urlencode "FORMAT=csv" --data-urlencode "PHASE=RUN" --data-urlencode "QUERY=$Q" | grep -i "^location" | head -1 | awk '{print $2}' | tr -d '\r')
  [ -z "$J" ] && { echo "try $try no job"; sleep 30; continue; }
  for i in $(seq 1 120); do P=$(curl -s -m 30 $J/phase); case $P in COMPLETED|ERROR|ABORTED) break;; esac; sleep 5; done
  [ "$P" = COMPLETED ] && curl -s -m 600 -L -o $N.csv $J/results/result && echo "$N $(($(wc -l < $N.csv)-1))" && exit 0
  echo "try $try phase $P"; sleep 30
done
echo "$N FAILED"
