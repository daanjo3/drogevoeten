/* KNMI weather stations with their daily rainfall extremes (RH, etmaalsom).
   Taken from rainStations in the prototype data layer
   (prototype/datalayer/fetch_status.py and build.py), harvested 2026-10-25 from
   https://www.daggegevens.knmi.nl/klimatologie/daggegevens. That service does
   not send CORS headers, so the app ships this snapshot. */

export interface RainStation {
  stn: string;
  name: string;
  lat: number;
  lon: number;
  /* first and last day with data */
  since: string;
  until: string;
  wettestDay: { date: string; mm: number };
  /* the wettest day in the twelve months before the harvest */
  wettestDayLastYear: { date: string; mm: number };
}

export const KNMI_URL = "https://www.daggegevens.knmi.nl/klimatologie/daggegevens";

export const RAIN_STATIONS: RainStation[] = [
  {"stn": "215", "name": "Voorschoten", "lat": 52.141, "lon": 4.437, "since": "2014-07-16", "until": "2026-10-25", "wettestDay": {"date": "2017-09-08", "mm": 77.6}, "wettestDayLastYear": {"date": "2026-09-08", "mm": 28.4}},
  {"stn": "235", "name": "De Kooy Airport", "lat": 52.928, "lon": 4.781, "since": "1957-01-01", "until": "2026-10-25", "wettestDay": {"date": "2008-10-05", "mm": 90.2}, "wettestDayLastYear": {"date": "2026-08-31", "mm": 45.4}},
  {"stn": "240", "name": "Schiphol Airport", "lat": 52.318, "lon": 4.79, "since": "1971-01-01", "until": "2026-10-25", "wettestDay": {"date": "2017-09-08", "mm": 67.2}, "wettestDayLastYear": {"date": "2026-08-29", "mm": 29.0}},
  {"stn": "249", "name": "Berkhout", "lat": 52.644, "lon": 4.979, "since": "1999-03-23", "until": "2026-10-25", "wettestDay": {"date": "2004-08-20", "mm": 56.9}, "wettestDayLastYear": {"date": "2026-08-29", "mm": 26.2}},
  {"stn": "251", "name": "Hoorn Terschelling", "lat": 53.392, "lon": 5.346, "since": "1994-06-01", "until": "2026-10-25", "wettestDay": {"date": "1995-07-09", "mm": 84.0}, "wettestDayLastYear": {"date": "2025-11-14", "mm": 27.8}},
  {"stn": "257", "name": "Wijk aan Zee", "lat": 52.506, "lon": 4.603, "since": "2001-05-01", "until": "2026-10-25", "wettestDay": {"date": "2014-07-28", "mm": 96.6}, "wettestDayLastYear": {"date": "2026-08-29", "mm": 28.4}},
  {"stn": "260", "name": "De Bilt", "lat": 52.1, "lon": 5.18, "since": "1951-01-01", "until": "2026-10-25", "wettestDay": {"date": "2013-10-13", "mm": 63.9}, "wettestDayLastYear": {"date": "2026-10-23", "mm": 29.6}},
  {"stn": "267", "name": "Stavoren", "lat": 52.898, "lon": 5.384, "since": "1991-11-14", "until": "2026-10-25", "wettestDay": {"date": "2021-08-22", "mm": 92.0}, "wettestDayLastYear": {"date": "2025-11-14", "mm": 38.0}},
  {"stn": "269", "name": "Lelystad Airport", "lat": 52.458, "lon": 5.52, "since": "1991-08-13", "until": "2026-10-25", "wettestDay": {"date": "2017-09-08", "mm": 59.2}, "wettestDayLastYear": {"date": "2026-06-27", "mm": 39.2}},
  {"stn": "270", "name": "Leeuwarden Airport", "lat": 53.224, "lon": 5.752, "since": "1974-06-01", "until": "2026-10-25", "wettestDay": {"date": "1997-06-29", "mm": 69.7}, "wettestDayLastYear": {"date": "2025-11-14", "mm": 34.9}},
  {"stn": "273", "name": "Marknesse", "lat": 52.703, "lon": 5.888, "since": "1989-11-01", "until": "2026-10-25", "wettestDay": {"date": "2003-06-02", "mm": 115.6}, "wettestDayLastYear": {"date": "2026-06-19", "mm": 24.2}},
  {"stn": "275", "name": "Deelen Airport", "lat": 52.056, "lon": 5.873, "since": "1982-03-25", "until": "2026-10-25", "wettestDay": {"date": "2014-07-28", "mm": 131.6}, "wettestDayLastYear": {"date": "2026-10-23", "mm": 38.2}},
  {"stn": "277", "name": "Lauwersoog", "lat": 53.413, "lon": 6.2, "since": "1992-03-06", "until": "2026-10-25", "wettestDay": {"date": "1994-07-07", "mm": 57.6}, "wettestDayLastYear": {"date": "2025-11-14", "mm": 33.4}},
  {"stn": "278", "name": "Heino", "lat": 52.435, "lon": 6.259, "since": "1992-03-05", "until": "2026-10-25", "wettestDay": {"date": "2011-08-03", "mm": 55.6}, "wettestDayLastYear": {"date": "2026-10-24", "mm": 20.6}},
  {"stn": "279", "name": "Hoogeveen", "lat": 52.75, "lon": 6.574, "since": "1993-03-01", "until": "2026-10-25", "wettestDay": {"date": "2014-05-26", "mm": 62.2}, "wettestDayLastYear": {"date": "2026-06-19", "mm": 30.3}},
  {"stn": "280", "name": "Groningen Airport Eelde", "lat": 53.125, "lon": 6.585, "since": "1957-01-01", "until": "2026-10-25", "wettestDay": {"date": "1970-09-16", "mm": 65.8}, "wettestDayLastYear": {"date": "2025-11-14", "mm": 34.8}},
  {"stn": "283", "name": "Hupsel", "lat": 52.069, "lon": 6.657, "since": "1992-02-25", "until": "2026-10-25", "wettestDay": {"date": "2010-08-26", "mm": 142.3}, "wettestDayLastYear": {"date": "2026-08-27", "mm": 22.8}},
  {"stn": "286", "name": "Nieuw Beerta", "lat": 53.196, "lon": 7.15, "since": "1990-01-27", "until": "2026-10-25", "wettestDay": {"date": "1997-07-22", "mm": 55.0}, "wettestDayLastYear": {"date": "2025-11-14", "mm": 28.1}},
  {"stn": "290", "name": "Twenthe Airport", "lat": 52.274, "lon": 6.891, "since": "1974-06-01", "until": "2026-10-25", "wettestDay": {"date": "2010-08-26", "mm": 106.4}, "wettestDayLastYear": {"date": "2026-05-29", "mm": 22.6}},
  {"stn": "310", "name": "Vlissingen", "lat": 51.442, "lon": 3.596, "since": "1957-01-01", "until": "2026-10-25", "wettestDay": {"date": "2005-07-04", "mm": 80.9}, "wettestDayLastYear": {"date": "2026-08-27", "mm": 31.8}},
  {"stn": "319", "name": "Westdorpe", "lat": 51.226, "lon": 3.861, "since": "1993-06-23", "until": "2026-10-25", "wettestDay": {"date": "2002-08-05", "mm": 72.1}, "wettestDayLastYear": {"date": "2026-10-23", "mm": 33.1}},
  {"stn": "323", "name": "Wilhelminadorp", "lat": 51.527, "lon": 3.884, "since": "1990-12-05", "until": "2026-10-25", "wettestDay": {"date": "2020-09-26", "mm": 77.0}, "wettestDayLastYear": {"date": "2026-10-23", "mm": 34.0}},
  {"stn": "330", "name": "Hoek van Holland", "lat": 51.992, "lon": 4.122, "since": "1995-08-01", "until": "2026-10-25", "wettestDay": {"date": "2001-09-19", "mm": 107.7}, "wettestDayLastYear": {"date": "2026-10-23", "mm": 35.6}},
  {"stn": "340", "name": "Woensdrecht Airport", "lat": 51.449, "lon": 4.342, "since": "2018-02-01", "until": "2026-10-25", "wettestDay": {"date": "2023-08-06", "mm": 40.7}, "wettestDayLastYear": {"date": "2026-10-23", "mm": 33.9}},
  {"stn": "344", "name": "Rotterdam Airport", "lat": 51.962, "lon": 4.447, "since": "1974-01-01", "until": "2026-10-25", "wettestDay": {"date": "1975-06-23", "mm": 101.4}, "wettestDayLastYear": {"date": "2026-10-23", "mm": 33.2}},
  {"stn": "348", "name": "Cabauw", "lat": 51.97, "lon": 4.926, "since": "1986-04-18", "until": "2026-10-25", "wettestDay": {"date": "2005-06-29", "mm": 75.9}, "wettestDayLastYear": {"date": "2026-06-19", "mm": 32.0}},
  {"stn": "350", "name": "Gilze-Rijen Airport", "lat": 51.566, "lon": 4.936, "since": "1976-10-01", "until": "2026-10-25", "wettestDay": {"date": "1980-07-20", "mm": 65.8}, "wettestDayLastYear": {"date": "2026-10-23", "mm": 40.8}},
  {"stn": "356", "name": "Herwijnen", "lat": 51.859, "lon": 5.146, "since": "1993-05-05", "until": "2026-10-25", "wettestDay": {"date": "2011-06-28", "mm": 99.1}, "wettestDayLastYear": {"date": "2026-10-23", "mm": 39.3}},
  {"stn": "370", "name": "Eindhoven Airport", "lat": 51.451, "lon": 5.377, "since": "1984-08-16", "until": "2026-10-25", "wettestDay": {"date": "2022-06-05", "mm": 48.3}, "wettestDayLastYear": {"date": "2026-09-13", "mm": 28.5}},
  {"stn": "375", "name": "Volkel", "lat": 51.659, "lon": 5.707, "since": "1974-06-01", "until": "2026-10-25", "wettestDay": {"date": "2020-06-26", "mm": 85.8}, "wettestDayLastYear": {"date": "2026-08-27", "mm": 31.5}},
  {"stn": "377", "name": "Ell", "lat": 51.198, "lon": 5.763, "since": "1999-07-15", "until": "2026-10-25", "wettestDay": {"date": "2009-10-07", "mm": 62.1}, "wettestDayLastYear": {"date": "2026-09-13", "mm": 28.4}},
  {"stn": "380", "name": "Maastricht Airport", "lat": 50.906, "lon": 5.762, "since": "1957-01-01", "until": "2026-10-25", "wettestDay": {"date": "2021-06-29", "mm": 87.2}, "wettestDayLastYear": {"date": "2026-06-20", "mm": 31.1}},
  {"stn": "392", "name": "Horst", "lat": 51.486836, "lon": 6.056189, "since": "2025-06-16", "until": "2026-10-25", "wettestDay": {"date": "2025-09-09", "mm": 43.4}, "wettestDayLastYear": {"date": "2026-10-24", "mm": 22.4}},
];
