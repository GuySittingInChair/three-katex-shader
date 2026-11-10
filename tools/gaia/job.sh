#!/bin/sh
# job.sh RA0 — one 15-degree strip of the 100 pc sample
R=$1; Q="SELECT ra, dec, parallax, pmra, pmdec, radial_velocity, phot_g_mean_mag, bp_rp FROM gaiadr3.gaia_source WHERE parallax > 10 AND parallax_over_error > 10 AND ruwe < 1.4 AND bp_rp IS NOT NULL AND ra >= $R AND ra < $((R+15))"
for try in 1 2 3 4 5; do
  J=$(curl -s -m 120 -i "https://gea.esac.esa.int/tap-server/tap/async" --data-urlencode "REQUEST=doQuery" --data-urlencode "LANG=ADQL" --data-urlencode "FORMAT=csv" --data-urlencode "PHASE=RUN" --data-urlencode "QUERY=$Q" | grep -i "^location" | head -1 | awk '{print $2}' | tr -d '\r')
  [ -z "$J" ] && { sleep 20; continue; }
  for i in $(seq 1 120); do P=$(curl -s -m 30 $J/phase); case $P in COMPLETED|ERROR|ABORTED) break;; esac; sleep 5; done
  [ "$P" = COMPLETED ] && curl -s -m 600 -L -o s$R.csv $J/results/result && echo "s$R $(($(wc -l < s$R.csv)-1))" && exit 0
  sleep 20
done
echo "s$R FAILED"
