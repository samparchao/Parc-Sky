// Parc Sky | WeatherService.cs
// Created by Samuel Teixeira Parchao

using System;
using System.Globalization;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;

namespace WeatherApp.Services;

/// <summary>Loads forecast data used by the Weather and Observing views.</summary>
internal static class WeatherService
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(20) };

    /// <summary>Current temperature in Celsius and WMO weather code.</summary>
    /// <param name="Temperature">Air temperature in degrees Celsius.</param>
    /// <param name="WeatherCode">WMO weather code.</param>
    public record CurrentWeather(double Temperature, int WeatherCode);

    /// <summary>Daily weather and daylight forecast in the site's time zone.</summary>
    /// <param name="Date">Local forecast date.</param>
    /// <param name="WeatherCode">WMO weather code.</param>
    /// <param name="TempMax">Maximum temperature in degrees Celsius.</param>
    /// <param name="TempMin">Minimum temperature in degrees Celsius.</param>
    /// <param name="Sunrise">Local sunrise, when available.</param>
    /// <param name="Sunset">Local sunset, when available.</param>
    public record DailyForecast(DateTime Date, int WeatherCode, double TempMax, double TempMin, DateTime? Sunrise, DateTime? Sunset);

    /// <summary>Hourly forecast values used by the weather display and observing planner.</summary>
    /// <param name="Time">Local forecast timestamp.</param>
    /// <param name="Temperature">Air temperature in degrees Celsius.</param>
    /// <param name="WindGust">Peak wind gust in kilometres per hour.</param>
    /// <param name="PrecipitationProbability">Probability of measurable precipitation, as a percentage.</param>
    /// <param name="Precipitation">Total precipitation in millimetres for the preceding hour.</param>
    /// <param name="CloudCover">Cloud cover percentage.</param>
    /// <param name="Rainfall">Rain and showers in millimetres for the preceding hour, when available.</param>
    public record HourlyForecast(DateTime Time, double Temperature, double WindGust,
        double PrecipitationProbability, double Precipitation, double CloudCover, double? Rainfall);

    /// <summary>Current conditions and forecast series for one location.</summary>
    /// <param name="Current">Current weather.</param>
    /// <param name="Daily">Daily forecast series.</param>
    /// <param name="Hourly">Hourly forecast series.</param>
    /// <param name="TimeZone">IANA time zone identifier returned by Open-Meteo.</param>
    public record WeatherData(CurrentWeather Current, DailyForecast[] Daily, HourlyForecast[] Hourly, string TimeZone);

    /// <summary>Downloads a seven-day local forecast for a coordinate.</summary>
    /// <param name="latitude">Latitude in decimal degrees.</param>
    /// <param name="longitude">Longitude in decimal degrees.</param>
    /// <returns>The current, hourly and daily forecasts.</returns>
    public static async Task<WeatherData> GetWeatherAsync(double latitude, double longitude)
    {
        string coordinates = FormattableString.Invariant($"latitude={latitude}&longitude={longitude}");
        string url = $"https://api.open-meteo.com/v1/forecast?{coordinates}" +
            "&current=temperature_2m,weather_code" +
            "&hourly=temperature_2m,wind_gusts_10m,precipitation_probability,precipitation,rain,showers,cloud_cover" +
            "&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto&forecast_days=7";

        using var stream = await Http.GetStreamAsync(url);
        using var document = await JsonDocument.ParseAsync(stream);
        JsonElement root = document.RootElement, current = root.GetProperty("current");
        JsonElement days = root.GetProperty("daily"), hours = root.GetProperty("hourly");
        var daily = new DailyForecast[days.GetProperty("time").GetArrayLength()];
        var hourly = new HourlyForecast[hours.GetProperty("time").GetArrayLength()];

        for (int i = 0; i < daily.Length; i++)
        {
            daily[i] = new DailyForecast(
                ReadTime(days, "time", i).Value, days.GetProperty("weather_code")[i].GetInt32(),
                ReadNumber(days, "temperature_2m_max", i).Value, ReadNumber(days, "temperature_2m_min", i).Value,
                ReadTime(days, "sunrise", i), ReadTime(days, "sunset", i));
        }

        for (int i = 0; i < hourly.Length; i++)
        {
            hourly[i] = new HourlyForecast(ReadTime(hours, "time", i).Value, ReadNumber(hours, "temperature_2m", i).Value,
                ReadNumber(hours, "wind_gusts_10m", i).Value, ReadNumber(hours, "precipitation_probability", i).Value,
                ReadNumber(hours, "precipitation", i).Value, ReadNumber(hours, "cloud_cover", i).Value,
                ReadNumber(hours, "rain", i) + ReadNumber(hours, "showers", i));
        }

        return new WeatherData(new CurrentWeather(current.GetProperty("temperature_2m").GetDouble(),
            current.GetProperty("weather_code").GetInt32()), daily, hourly, root.GetProperty("timezone").GetString());
    }

    private static DateTime? ReadTime(JsonElement series, string field, int index) =>
        DateTime.TryParse(series.GetProperty(field)[index].GetString(), CultureInfo.InvariantCulture,
            DateTimeStyles.None, out var value) ? value : null;

    private static double? ReadNumber(JsonElement series, string field, int index) =>
        series.GetProperty(field)[index] is { ValueKind: JsonValueKind.Number } value ? value.GetDouble() : null;

    /// <summary>Gets a display name for a WMO weather condition.</summary>
    /// <param name="code">WMO weather code.</param>
    /// <returns>The condition name or Unknown for an unsupported code.</returns>
    public static string DescribeWeatherCode(int code) => code switch
    {
        0 => "Clear Sky",
        1 => "Mainly Clear",
        2 => "Partly Cloudy",
        3 => "Overcast",
        45 or 48 => "Fog",
        51 or 53 or 55 => "Drizzle",
        56 or 57 => "Freezing Drizzle",
        61 => "Light Rain",
        63 => "Rain",
        65 => "Heavy Rain",
        66 or 67 => "Freezing Rain",
        71 or 73 or 75 or 77 => "Snow",
        80 or 81 or 82 => "Showers",
        85 or 86 => "Snow Showers",
        95 => "Thunderstorm",
        96 or 99 => "Thunderstorm + Hail",
        _ => "Unknown",
    };
}
