"""IMWA Sluizen (Het Waterschapshuis, via PDOK) -> linked data. See water_board.py; PLAN.md dataset 11."""
from datasets import water_board as wb

META = wb.meta("locks", "imwa_locks", "Sluizen")
convert = wb.make_convert("locks")
