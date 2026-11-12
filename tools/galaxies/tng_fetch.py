"""IllustrisTNG: fetch one simulated galaxy's history, for the EVOLUTION view (milestone 4). NOT YET RUN.

The TNG API needs a free account: register at https://www.tng-project.org/users/register/ and copy the API key from
your profile page. Give it to this script through the environment, never in a file that gets committed:

    export TNG_API_KEY=...            (or put it in ~/.config/tng/key, one line)
    python tng_fetch.py TNG50-1 99 <subhalo_id>

What it downloads (small, targeted; nothing in the hundreds of GB):
  1. the subhalo's record at that snapshot (mass, star formation rate, black hole mass, ...);
  2. its main progenitor branch from the SubLink merger tree (sublink/mpb.hdf5): the same galaxy at every earlier
     snapshot, with positions, masses and star formation rates, which is what a timeline needs;
  3. a particle cutout (stars: positions, masses, formation times; gas: positions, masses, star formation rates)
     at a handful of snapshots along that branch, for animating the structure.
Simulation time is not observed time: every product made from this is labelled SIMULATED.
Endpoint layout follows the TNG API documentation (https://www.tng-project.org/data/docs/api/)."""
import json, os, sys, urllib.request

BASE = 'https://www.tng-project.org/api'

def key():
    k = os.environ.get('TNG_API_KEY')
    if not k:
        p = os.path.expanduser('~/.config/tng/key')
        if os.path.exists(p): k = open(p).read().strip()
    if not k: sys.exit('No TNG API key: set TNG_API_KEY (see the top of this file).')
    return k

def get(url, out=None, params=None):
    if params: url += '?' + '&'.join(f'{a}={b}' for a, b in params.items())
    req = urllib.request.Request(url, headers={'api-key': key()})
    with urllib.request.urlopen(req, timeout=300) as r:
        data = r.read()
        if out:
            open(out, 'wb').write(data); return out
        return json.loads(data)

def main(sim='TNG50-1', snap=99, sub=0, every=11):
    os.makedirs('tng', exist_ok=True)
    rec = get(f'{BASE}/{sim}/snapshots/{snap}/subhalos/{sub}/')
    json.dump(rec, open(f'tng/{sim}_{snap}_{sub}.json', 'w'), indent=1)
    mpb = get(f'{BASE}/{sim}/snapshots/{snap}/subhalos/{sub}/sublink/mpb.hdf5', out=f'tng/{sim}_{sub}_mpb.hdf5')
    import h5py   # only needed from here on
    with h5py.File(mpb) as f:
        snaps, ids = f['SnapNum'][:], f['SubfindID'][:]
    fields = dict(stars='Coordinates,Masses,GFM_StellarFormationTime', gas='Coordinates,Masses,StarFormationRate')
    for s, i in list(zip(snaps, ids))[::every]:
        get(f'{BASE}/{sim}/snapshots/{s}/subhalos/{i}/cutout.hdf5', out=f'tng/{sim}_{s}_{i}_cutout.hdf5', params=fields)
        print('cutout', s, i)

if __name__ == '__main__':
    a = sys.argv[1:]
    main(a[0] if a else 'TNG50-1', int(a[1]) if len(a) > 1 else 99, int(a[2]) if len(a) > 2 else 0)
