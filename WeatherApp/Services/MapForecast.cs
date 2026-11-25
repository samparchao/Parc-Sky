using System;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace WeatherApp.Services;

internal static class MapForecast
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(16) };
    public record Request(int Id, double[] Points, string Day);

    public static async Task<double[]> LoadAsync(Request request, CancellationToken cancellation)
    {
        if (request.Points is not { Length: 2 or 96 } ||
            request.Points.Where((value, index) => !double.IsFinite(value) || Math.Abs(value) > (index % 2 == 0 ? 85.06 : 180)).Any() ||
            !DateOnly.TryParseExact(request.Day, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
            throw new ArgumentException("Invalid map forecast request.");

        string Coordinates(int axis) => string.Join(",", request.Points.Where((_, index) => index % 2 == axis)
            .Select(value => value.ToString("F3", CultureInfo.InvariantCulture)));
        string url = $"https://api.open-meteo.com/v1/forecast?latitude={Coordinates(0)}&longitude={Coordinates(1)}" +
            $"&hourly=temperature_2m,cloud_cover,rain,showers,wind_gusts_10m&timezone=GMT&start_date={request.Day}&end_date={request.Day}";
        using var response = await Http.GetAsync(url, cancellation);
        response.EnsureSuccessStatusCode();
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellation));
        var root = document.RootElement;
        var locations = root.ValueKind == JsonValueKind.Array ? root.EnumerateArray().ToArray() : new[] { root };
        if (locations.Length * 2 != request.Points.Length) throw new InvalidOperationException("Incomplete map grid.");

        var grid = new double[locations.Length * 4 * 24];
        for (int i = 0; i < locations.Length; i++)
        {
            var hours = locations[i].GetProperty("hourly");
            for (int hour = 0; hour < 24; hour++)
            {
                double? Read(string field) => hours.GetProperty(field)[hour] is { ValueKind: JsonValueKind.Number } sample
                    ? sample.GetDouble() : null;
                int offset = i * 96 + hour;
                grid[offset] = Read("temperature_2m") ?? -9999;
                grid[offset + 24] = Read("cloud_cover") ?? -9999;
                grid[offset + 48] = (Read("rain") + Read("showers")) ?? -9999;
                grid[offset + 72] = Read("wind_gusts_10m") ?? -9999;
            }
        }
        return grid;
    }
}
