"""Inspect real float WAV captures; produce comparable spectral and level QA."""
import argparse
import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from scipy.io import wavfile
from scipy.signal import spectrogram

parser = argparse.ArgumentParser()
parser.add_argument('recordings', type=Path)
parser.add_argument('--out', type=Path, default=Path('/tmp/text-to-strudel-spectrogram.png'))
args = parser.parse_args()
files = sorted(args.recordings.glob('*.wav'))
if not files:
    raise SystemExit('No WAV recordings found')

fig, axes = plt.subplots(len(files), 2, figsize=(14, 3.2 * len(files)), squeeze=False, layout='constrained')
metrics = []
for row, file in enumerate(files):
    rate, signal = wavfile.read(file)
    signal = signal.astype(np.float64)
    if signal.ndim == 1:
        signal = signal[:, None]
    if not np.isfinite(signal).all():
        raise ValueError(f'{file}: non-finite audio samples')
    peak = float(np.max(np.abs(signal)))
    rms = float(np.sqrt(np.mean(signal ** 2)))
    if rms < 1e-6:
        raise ValueError(f'{file}: silent recording')
    powers = []
    for channel in signal.T:
        freq, time, power = spectrogram(channel, rate, nperseg=2048, noverlap=1536, scaling='spectrum')
        powers.append(power)
    db = 10 * np.log10(np.mean(powers, axis=0) + 1e-12)
    visible = (freq >= 25) & (freq <= 16000)
    axes[row, 0].pcolormesh(time, freq[visible], db[visible], shading='auto', vmin=-90, vmax=-10, cmap='magma', rasterized=True)
    axes[row, 0].set(yscale='log', ylabel='Frequency (Hz)', xlabel='Time (s)', title=f'{file.stem} · spectrum (shared −90 to −10 dB scale)')
    axes[row, 0].set_yticks([30, 100, 300, 1000, 3000, 10000], labels=['30','100','300','1k','3k','10k'])
    # Peak envelopes preserve short transients while keeping the plot compact.
    block = max(1, rate // 100)
    trimmed = signal[:len(signal) // block * block]
    envelope = np.max(np.abs(trimmed.reshape(-1, block, signal.shape[1])), axis=(1, 2))
    axes[row, 1].plot(np.arange(len(envelope)) * block / rate, envelope, color='#176b72', lw=.8)
    axes[row, 1].axhline(1, color='#a13b38', ls='--', lw=1, label='0 dBFS')
    axes[row, 1].set(xlabel='Time (s)', ylabel='Peak amplitude', ylim=(0, max(1.05, peak * 1.05)), title=f'Peak {20*np.log10(peak):.1f} dBFS · RMS {20*np.log10(rms):.1f} dBFS')
    metrics.append({
        'recording': file.stem, 'durationSeconds': round(len(signal)/rate, 2),
        'peakDbFS': round(float(20*np.log10(peak)), 2), 'rmsDbFS': round(float(20*np.log10(rms)), 2),
        'samplesAboveFullScale': int(np.sum(np.abs(signal) > 1)),
        'maxAbsoluteDC': round(float(np.max(np.abs(np.mean(signal, axis=0)))), 6),
    })
fig.suptitle('Text-to-Strudel · real Web Audio capture, before destination clipping\nOne complete form per take; spectral checks do not score musical taste.', fontsize=14)
args.out.parent.mkdir(parents=True, exist_ok=True)
fig.savefig(args.out, dpi=150)
args.out.with_suffix('.json').write_text(json.dumps(metrics, indent=2) + '\n')
print(json.dumps(metrics, indent=2))
