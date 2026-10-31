"""IMWA Gemalen (Het Waterschapshuis, via PDOK) -> linked data. See water_board.py; PLAN.md dataset 11."""
from datasets import water_board as wb

META = wb.meta("pumping-stations", "imwa_pumping_stations", "Gemalen")
convert = wb.make_convert("pumping-stations")
