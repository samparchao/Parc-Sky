// Parc Sky | MainWindow.Planner.cs
// Created by Samuel Teixeira Parchao

using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;

namespace WeatherApp;

/// <summary>Connects the planner interface to the native application services.</summary>
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
                    if (message.StartsWith("select:"))
                    {
                        int index = trackedCities.FindIndex(city => GetCityKey(city.Latitude, city.Longitude) == message.Substring(7));
                        if (index >= 0) { activeTrackedCityIndex = index; userSelectedSite = true; }
                        return;
                    }
                    if (message.StartsWith("remove:"))
                    {
                        RemoveSavedLocation(message.Substring(7));
                        return;
                    }
                    switch (message)
                    {
                        case "ready":
                            plannerReady = true;
                            SendPlannerSettings();
                            SendPlannerSites();
                            break;
                        case "refresh": await RefreshSavedForecastsAsync(); break;
                        case "temperature:Celsius": ChangeUnits(TemperatureUnit.Celsius, windSpeedUnit); break;
                        case "temperature:Fahrenheit": ChangeUnits(TemperatureUnit.Fahrenheit, windSpeedUnit); break;
                        case "wind:KilometersPerHour": ChangeUnits(temperatureUnit, WindSpeedUnit.KilometersPerHour); break;
                        case "wind:MilesPerHour": ChangeUnits(temperatureUnit, WindSpeedUnit.MilesPerHour); break;
                    }
                };
                core.NewWindowRequested += async (_, args) =>
                {
                    args.Handled = true;
                    if (!IsCreditLink(args.Uri)) return;
                    using var deferral = args.GetDeferral();
                    try { await Windows.System.Launcher.LaunchUriAsync(new Uri(args.Uri)); }
                    catch (Exception ex) { System.Diagnostics.Debug.WriteLine(ex); }
                };
                core.NavigationStarting += (_, args) => args.Cancel = args.Uri != "https://planner.example/index.html";
                shootPlanner.Source = new Uri("https://planner.example/index.html");
            }
            else SendPlannerSites();
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine(ex);
            Content = new TextBlock { Text = "Parc Sky could not open. Check that Microsoft Edge WebView2 Runtime is installed.", Margin = new Thickness(24), TextWrapping = TextWrapping.Wrap };
        }
    }

    private static bool IsCreditLink(string uri) => uri is
        "https://open-meteo.com/" or
        "https://creativecommons.org/licenses/by/4.0/" or
        "https://www.openstreetmap.org/copyright" or
        "https://stdatu.stsci.edu/publishing/data-use";

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

    private void ChangeUnits(TemperatureUnit temperature, WindSpeedUnit wind)
    {
        temperatureUnit = temperature;
        windSpeedUnit = wind;
        SaveSettings();
        SendPlannerSettings();
        SendPlannerSites();
    }

    private void SendPlannerSettings() =>
        shootPlanner.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new
        {
            settings = new { temperature = temperatureUnit.ToString(), wind = windSpeedUnit.ToString(), about = AppInfo.AboutText, version = AppInfo.Version }
        }));

    private void SendPlannerSites()
    {
        if (!plannerReady) return;
        var sites = trackedCities.Select((city, index) =>
        {
            string key = GetCityKey(city.Latitude, city.Longitude);
            trackedCityWeather.TryGetValue(key, out var forecast);
            return new {
                key, name = city.Name, lat = city.Latitude, lon = city.Longitude,
                fahrenheit = temperatureUnit == TemperatureUnit.Fahrenheit, mph = windSpeedUnit == WindSpeedUnit.MilesPerHour, saved = city.IsFavorite, active = index == activeTrackedCityIndex, zone = forecast?.TimeZone,
                current = forecast == null ? null : new { temp = FormatTemperature(forecast.Current.Temperature), code = forecast.Current.WeatherCode, description = Services.WeatherService.DescribeWeatherCode(forecast.Current.WeatherCode) },
                days = forecast?.Daily.Select(d => new { date = d.Date.ToString("yyyy-MM-dd"), code = d.WeatherCode, description = Services.WeatherService.DescribeWeatherCode(d.WeatherCode), high = FormatTemperature(d.TempMax), low = FormatTemperature(d.TempMin), sunset = d.Sunset?.ToString("HH:mm"), sunrise = d.Sunrise?.ToString("HH:mm") }),
                hours = forecast?.Hourly.Select(h => new {
                    time = h.Time.ToString("yyyy-MM-ddTHH", System.Globalization.CultureInfo.InvariantCulture),
                    temperature = h.Temperature, gust = h.WindGust, rainfall = h.Rainfall, temp = FormatTemperature(h.Temperature), cloud = h.CloudCover, rain = h.Precipitation, probability = h.PrecipitationProbability
                })
            };
        });
        shootPlanner.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(sites));
    }
}
