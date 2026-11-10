#!/bin/sh
# pget URL START LEN OUT [PARTS] — parallel range download of [START, START+LEN)
U=$1; S=$2; N=$3; O=$4; P=${5:-8}; C=$(( (N + P - 1) / P ))
for i in $(seq 0 $((P-1))); do a=$((S + i*C)); b=$((a + C - 1)); e=$((S + N - 1)); [ $b -gt $e ] && b=$e; [ $a -gt $e ] && break
  ( for t in 1 2 3 4 5; do curl -s -f -m 3000 -r $a-$b -o $O.part$i "$U" && [ $(stat -c%s $O.part$i) -eq $((b-a+1)) ] && break; sleep 3; done ) &
done; wait
cat $(ls $O.part* | sort -V) > $O && rm -f $O.part* && echo "done $O $(stat -c%s $O)"
