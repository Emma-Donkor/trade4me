"""PHASE 13 — reproducible, leakage-free machine learning pipeline.

Python remains the single authority for all training math.  This package owns
dataset labelling, chronological splitting, three model slots, calibration,
evaluation and the versioned artifact registry.  No module here loads an
arbitrary pickle from an untrusted path: artifacts are only read from the
configured registry directory after a checksum match.
"""
