import openmeteo_requests

import pandas as pd
import requests_cache
from retry_requests import retry

# Setup the Open-Meteo API client with cache and retry on error
cache_session = requests_cache.CachedSession('.cache', expire_after = 3600)
retry_session = retry(cache_session, retries = 5, backoff_factor = 0.2)
openmeteo = openmeteo_requests.Client(session = retry_session)

# Make sure all required weather variables are listed here
# The order of variables in hourly or daily is important to assign them correctly below
url = "https://api.open-meteo.com/v1/forecast?latitude=-23.2217&longitude=-45.31&hourly=temperature_2m&timezone=America%2FSao_Paulo&forecast_days=3"
# 1. Atualize os parâmetros para incluir o que você quer
params = {
    "latitude": -23.2217,
    "longitude": -45.31,
    "hourly": ["temperature_2m", "precipitation", "precipitation_probability", "wind_gusts_10m"],
    "timezone": "America/Sao_Paulo",
    "forecast_days": 1
}

responses = openmeteo.weather_api(url, params=params)
response = responses[0]
hourly = response.Hourly()

# 2. Extraia cada variável (seguindo a ordem que você pediu acima)
# O índice no Variables(x) segue a ordem da lista no params['hourly']
hourly_data = {
    "date": pd.date_range(
        start = pd.to_datetime(hourly.Time(), unit = "s", utc = True),
        end = pd.to_datetime(hourly.TimeEnd(), unit = "s", utc = True),
        freq = pd.Timedelta(seconds = hourly.Interval()),
        inclusive = "left"
    ),
    "temp": hourly.Variables(0).ValuesAsNumpy(),
    "chuva_mm": hourly.Variables(1).ValuesAsNumpy(),
    "prob_percent": hourly.Variables(2).ValuesAsNumpy(),
    "rajada_vento": hourly.Variables(3).ValuesAsNumpy()
}

hourly_dataframe = pd.DataFrame(data = hourly_data)
print(hourly_dataframe)