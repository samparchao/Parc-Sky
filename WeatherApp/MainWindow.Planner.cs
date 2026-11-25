using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;

namespace WeatherApp;

public sealed partial class MainWindow
{
    private readonly WebView2 shootPlanner = new();
    private bool plannerReady;
    private System.Threading.CancellationTokenSource mapRequest, pointRequest;

    private async Task OpenPlannerAsync()
    {
        shootPlanner.Visibility = Visibility.Visible;
        try
        {
            await shootPlanner.EnsureCoreWebView2Async();
            if (shootPlanner.Source == null)
            {
                var core = shootPlanner.CoreWebView2;
                core.SetVirtualHostNameToFolderMapping("planner.example", Path.Combine(AppContext.BaseDirectory, "Planner"), CoreWebView2HostResourceAccessKind.DenyCors);
                core.WebMessageReceived += async (_, args) =>
                {
                    if (args.Source != "https://planner.example/index.html") return;
                    var message = args.TryGetWebMessageAsString();
                    if (message.StartsWith("map:") || message.StartsWith("point:"))
                    {
                        await SendMapForecastAsync(core, message.Substring(message.IndexOf(':') + 1), message.StartsWith("point:"));
                        return;
                    }
                    if (message.StartsWith("find:"))
                    {
                        var query = message.Substring(5).Trim();
                        try
                        {
                            var matches = await Services.LocationService.SearchCitiesAsync(query);
                            core.PostWebMessageAsJson(JsonSerializer.Serialize(new { query, matches }));
                        }
                        catch
                        {
                            core.PostWebMessageAsJson(JsonSerializer.Serialize(new { query, error = "Location search unavailable." }));
                        }
                        return;
                    }
                    if (message.StartsWith("add:"))
                    {
                        var match = JsonSerializer.Deserialize<Services.LocationService.CitySearchResult>(message.Substring(4));
                        if (match != null) await AddOrActivateTrackedCityAsync(match.CityName, match.Latitude, match.Longitude, true);
                        return;
                    }
                    switch (message)
                    {
                        case "ready": plannerReady = true; SendPlannerSites(); break;
                        case "weather": shootPlanner.Visibility = Visibility.Collapsed; break;
                    }
                };
                core.NavigationStarting += (_, args) => args.Cancel = args.Uri != "https://planner.example/index.html";
                shootPlanner.Source = new Uri("https://planner.example/index.html");
            }
            else SendPlannerSites();
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine(ex);
            shootPlanner.Visibility = Visibility.Collapsed;
            ToolTipService.SetToolTip(shootPlanner, "Planner unavailable");
        }
    }

    private async Task SendMapForecastAsync(CoreWebView2 core, string json, bool point)
    {
        Services.MapForecast.Request request;
        try { request = JsonSerializer.Deserialize<Services.MapForecast.Request>(json); }
        catch (JsonException) { return; }
        if (request == null) return;
        (point ? pointRequest : mapRequest)?.Cancel();
        using var cancellation = new System.Threading.CancellationTokenSource();
        if (point) pointRequest = cancellation;
        else mapRequest = cancellation;
        try
        {
            var grid = await Services.MapForecast.LoadAsync(request, cancellation.Token);
            if (!cancellation.IsCancellationRequested)
                core.PostWebMessageAsJson(JsonSerializer.Serialize(new { mapId = point ? (int?)null : request.Id, pointId = point ? (int?)request.Id : null, grid }));
        }
        catch (Exception) when (!cancellation.IsCancellationRequested)
        {
            core.PostWebMessageAsJson(JsonSerializer.Serialize(new { mapId = point ? (int?)null : request.Id, pointId = point ? (int?)request.Id : null, error = true }));
        }
        catch (Exception) when (cancellation.IsCancellationRequested) { }
        finally
        {
            if (mapRequest == cancellation) mapRequest = null;
            if (pointRequest == cancellation) pointRequest = null;
        }
    }

    private void SendPlannerSites()
    {
        if (!plannerReady) return;
        var sites = trackedCities.Select((city, index) =>
        {
            string key = GetCityKey(city.Latitude, city.Longitude);
            trackedCityWeather.TryGetValue(key, out var forecast);
            return new {
                key, name = city.Name, lat = city.Latitude, lon = city.Longitude,
                fahrenheit = temperatureUnit == TemperatureUnit.Fahrenheit, active = index == activeTrackedCityIndex, zone = forecast?.TimeZone,
                current = forecast == null ? null : new { temp = FormatTemperature(forecast.Current.Temperature), code = forecast.Current.WeatherCode, description = Services.WeatherService.MapWeatherCode(forecast.Current.WeatherCode).Desc },
                days = forecast?.Daily.Select(d => new { date = d.Date.ToString("yyyy-MM-dd"), code = d.WeatherCode, description = Services.WeatherService.MapWeatherCode(d.WeatherCode).Desc, high = FormatTemperature(d.TempMax), low = FormatTemperature(d.TempMin), sunset = d.Sunset.ToString("HH:mm"), sunrise = d.Sunrise.ToString("HH:mm"), humidity = d.Humidity }),
                hours = forecast?.Hourly.Select(h => new {
                    time = h.Time.ToString("yyyy-MM-ddTHH", System.Globalization.CultureInfo.InvariantCulture),
                    temperature = h.Temperature, gust = h.WindGust, rainfall = h.Rainfall, temp = FormatTemperature(h.Temperature), cloud = h.CloudCover, rain = h.Precipitation, probability = h.PrecipitationProbability
                })
            };
        });
        shootPlanner.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(sites));
    }
}
