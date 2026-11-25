// Parc Sky | MainWindow.xaml.cs
// Created by Samuel Teixeira Parchao

using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.IO;
using System.Runtime.InteropServices;
using Windows.Foundation.Collections;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using WeatherApp.Services;
using Windows.Storage;
using Drawing = System.Drawing;

namespace WeatherApp;

/// <summary>Hosts the Parc Sky planner and owns its settings, forecasts and tray lifecycle.</summary>
public sealed partial class MainWindow : Window
{
    private const string TemperatureUnitSettingKey = "TemperatureUnit";
    private const string WindSpeedUnitSettingKey = "WindSpeedUnit";
    private const string TrackedCitiesSettingKey = "TrackedCities";
    private enum TemperatureUnit { Celsius, Fahrenheit }
    private enum WindSpeedUnit { KilometersPerHour, MilesPerHour }

    private record TrackedCity(string Name, double Latitude, double Longitude, bool IsFavorite);
    private record SavedTrackedCity(string Name, double Latitude, double Longitude);

    private readonly List<TrackedCity> trackedCities = new();
    private readonly Dictionary<string, WeatherService.WeatherData> trackedCityWeather = new();
    private readonly Dictionary<string, Task> pendingForecasts = new();
    private readonly SemaphoreSlim forecastSlots = new(4);
    private TemperatureUnit temperatureUnit;
    private WindSpeedUnit windSpeedUnit;
    private int activeTrackedCityIndex;
    private TrayIcon trayIcon;
    private bool allowClose;

    /// <summary>Initializes the planner window, persisted preferences and notification-area icon.</summary>
    public MainWindow()
    {
        InitializeComponent();
        Title = "Parc Sky";
        AppWindow.Resize(new Windows.Graphics.SizeInt32(480, 780));
        PositionWindowBottomRight();
        LoadSettings();
        Content = shootPlanner;
        InitializeTrayIcon();
        shootPlanner.Loaded += async (_, _) => await OpenPlannerAsync();
        _ = InitializeLocationsAsync();
    }

    private async Task InitializeLocationsAsync()
    {
        var savedForecasts = RefreshSavedForecastsAsync();
        try
        {
            var location = await LocationService.GetCurrentLocationAsync();
            if (location.CityName != "Location denied")
            {
                // Preserve an explicit selection made while Windows location was resolving.
                await AddOrActivateTrackedCityAsync(location.CityName, location.Latitude, location.Longitude, false, activate: !userSelectedSite);
            }
        }
        catch (Exception ex) { Debug.WriteLine(ex); }
        await savedForecasts;
    }

    private bool userSelectedSite;

    private async Task AddOrActivateTrackedCityAsync(string name, double latitude, double longitude, bool favorite, bool activate = true)
    {
        string key = GetCityKey(latitude, longitude);
        int index = trackedCities.FindIndex(city => GetCityKey(city.Latitude, city.Longitude) == key);
        if (index < 0)
        {
            index = trackedCities.Count;
            trackedCities.Add(new TrackedCity(name, latitude, longitude, favorite));
        }
        else if (favorite)
        {
            trackedCities[index] = new TrackedCity(name, latitude, longitude, true);
        }
        if (activate) activeTrackedCityIndex = index;
        if (favorite)
        {
            userSelectedSite = true;
            SaveSettings();
        }
        SendPlannerSites();
        await RefreshForecastAsync(trackedCities[index]);
        SendPlannerSites();
    }

    private async Task RefreshSavedForecastsAsync()
    {
        await Task.WhenAll(trackedCities.Select(RefreshForecastAsync).ToArray());
        SendPlannerSites();
    }

    private async Task RefreshForecastAsync(TrackedCity city)
    {
        string key = GetCityKey(city.Latitude, city.Longitude);
        if (pendingForecasts.TryGetValue(key, out var existing))
        {
            await existing;
            return;
        }
        var task = LoadForecastAsync(city, key);
        pendingForecasts[key] = task;
        try { await task; }
        finally { pendingForecasts.Remove(key); }
    }

    private async Task LoadForecastAsync(TrackedCity city, string key)
    {
        await forecastSlots.WaitAsync();
        try { trackedCityWeather[key] = await WeatherService.GetWeatherAsync(city.Latitude, city.Longitude); }
        catch (Exception ex) { Debug.WriteLine(ex); }
        finally { forecastSlots.Release(); }
    }

    private void RemoveSavedLocation(string key)
    {
        int index = trackedCities.FindIndex(city => city.IsFavorite && GetCityKey(city.Latitude, city.Longitude) == key);
        if (index < 0) return;
        trackedCities.RemoveAt(index);
        if (index < activeTrackedCityIndex) activeTrackedCityIndex--;
        activeTrackedCityIndex = Math.Clamp(activeTrackedCityIndex, 0, Math.Max(0, trackedCities.Count - 1));
        SaveSettings();
        SendPlannerSites();
    }

    private void LoadSettings()
    {
        IDictionary<string, string> settings = ReadPreferences();
        if (settings.TryGetValue(TemperatureUnitSettingKey, out string tempText) &&
            Enum.TryParse(tempText, out TemperatureUnit temperature) && Enum.IsDefined(temperature))
            temperatureUnit = temperature;
        if (settings.TryGetValue(WindSpeedUnitSettingKey, out string windText) &&
            Enum.TryParse(windText, out WindSpeedUnit speed) && Enum.IsDefined(speed))
            windSpeedUnit = speed;

        if (!settings.TryGetValue(TrackedCitiesSettingKey, out string json)) return;
        try
        {
            var locations = JsonSerializer.Deserialize<SavedTrackedCity[]>(json) ?? Array.Empty<SavedTrackedCity>();
            trackedCities.AddRange(locations.Where(city => city != null && !string.IsNullOrWhiteSpace(city.Name))
                .DistinctBy(city => GetCityKey(city.Latitude, city.Longitude))
                .Select(city => new TrackedCity(city.Name, city.Latitude, city.Longitude, true)));
        }
        catch (JsonException ex) { Debug.WriteLine(ex); }
    }

    private void SaveSettings()
    {
        var settings = new Dictionary<string, string>
        {
            [TemperatureUnitSettingKey] = temperatureUnit.ToString(),
            [WindSpeedUnitSettingKey] = windSpeedUnit.ToString(),
            [TrackedCitiesSettingKey] = JsonSerializer.Serialize(trackedCities.Where(city => city.IsFavorite)
                .Select(city => new SavedTrackedCity(city.Name, city.Latitude, city.Longitude)))
        };
        IPropertySet packaged = TryGetPackagedSettings();
        if (packaged != null)
        {
            foreach (var setting in settings) packaged[setting.Key] = setting.Value;
            return;
        }

        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(PreferencesPath));
            string temporaryFile = PreferencesPath + "." + Environment.ProcessId + ".tmp";
            File.WriteAllText(temporaryFile, JsonSerializer.Serialize(settings));
            File.Move(temporaryFile, PreferencesPath, overwrite: true);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { Debug.WriteLine(ex); }
    }

    private static string PreferencesPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Parc Sky", "preferences.json");

    private static IDictionary<string, string> ReadPreferences()
    {
        IPropertySet packaged = TryGetPackagedSettings();
        if (packaged != null)
            return packaged.Where(setting => setting.Value is string)
                .ToDictionary(setting => setting.Key, setting => (string)setting.Value);
        try
        {
            if (File.Exists(PreferencesPath))
                return JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(PreferencesPath)) ?? new();
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException) { Debug.WriteLine(ex); }
        return new Dictionary<string, string>();
    }

    private static IPropertySet TryGetPackagedSettings()
    {
        try { return ApplicationData.Current.LocalSettings.Values; }
        catch (Exception ex) when (ex is InvalidOperationException or COMException)
        {
            // The standalone installer runs without an MSIX package identity.
            return null;
        }
    }

    private static string GetCityKey(double latitude, double longitude) =>
        string.Create(CultureInfo.InvariantCulture, $"{Math.Round(latitude, 4):F4}|{Math.Round(longitude, 4):F4}");

    private string FormatTemperature(double celsius) =>
        $"{(temperatureUnit == TemperatureUnit.Fahrenheit ? celsius * 1.8 + 32 : celsius):F0}°";

    private void InitializeTrayIcon()
    {
        trayIcon = new TrayIcon { Icon = Drawing.Icon.ExtractAssociatedIcon(Environment.ProcessPath) ?? Drawing.SystemIcons.Application, ToolTipText = Title };
        trayIcon.MenuItems.Add(new TrayMenuItem("Open", ShowFromTray));
        trayIcon.MenuItems.Add(new TrayMenuItem("Quit", QuitFromTray));
        trayIcon.LeftClick += (_, _) => ShowFromTray();
        AppWindow.Closing += OnAppWindowClosing;
    }

    private void OnAppWindowClosing(AppWindow sender, AppWindowClosingEventArgs args)
    {
        if (allowClose) return;
        args.Cancel = true;
        sender.Hide();
    }

    private void ShowFromTray()
    {
        PositionWindowBottomRight();
        AppWindow.Show();
        Activate();
    }

    private void PositionWindowBottomRight()
    {
        var work = DisplayArea.GetFromWindowId(AppWindow.Id, DisplayAreaFallback.Primary).WorkArea;
        var size = AppWindow.Size;
        AppWindow.Move(new Windows.Graphics.PointInt32(
            Math.Max(work.X, work.X + work.Width - size.Width),
            Math.Max(work.Y, work.Y + work.Height - size.Height)));
    }

    private void QuitFromTray()
    {
        allowClose = true;
        trayIcon.Dispose();
        Close();
    }
}
