import numpy as np
from PIL import Image
X0, Y0, N = 7713 - 1600, 16843, 3200
def strip(name, dt):
    a = np.memmap(f'jades/{name}_strip.raw', dtype=dt, mode='r', shape=(3200, 25000))
    return np.array(a[:, X0:X0 + N])
for b in ('f115w', 'f200w', 'f444w'):
    np.save(f'jades/{b}.npy', strip(b, '>f4').astype(np.float32))
np.save('jades/seg.npy', strip('segmentation', '>i4').astype(np.int32))
for b in ('f115w', 'f200w', 'f444w'):
    a = np.load(f'jades/{b}.npy'); print(b, 'nan%', np.isnan(a).mean()*100, 'zero%', (a==0).mean()*100, 'p50/p99/p99.9', np.nanpercentile(a, [50, 99, 99.9]))
s = np.load('jades/seg.npy'); print('seg ids', len(np.unique(s)) - 1)
