// Parc Sky | TrayIcon.cs
// Created by Samuel Teixeira Parchao

using System;
using System.Collections.Generic;
using Drawing = System.Drawing;
using Forms = System.Windows.Forms;

namespace WeatherApp;

internal sealed class TrayMenuItem
{
    /// <summary>Visible label for the command.</summary>
    public string Text { get; }
    /// <summary>Action invoked when the command is selected.</summary>
    public Action Handler { get; }

    /// <summary>Creates a tray command with its visible label and action.</summary>
    /// <param name="text">Command label.</param>
    /// <param name="handler">Action to invoke.</param>
    public TrayMenuItem(string text, Action handler)
    {
        Text = text;
        Handler = handler;
    }
}

internal sealed class TrayIcon : IDisposable
{
    private readonly Forms.NotifyIcon _notifyIcon;
    private bool _disposed;

    /// <summary>Icon displayed in the Windows notification area.</summary>
    public Drawing.Icon Icon
    {
        get => _notifyIcon.Icon;
        set => _notifyIcon.Icon = value;
    }

    /// <summary>Text shown when the pointer rests over the icon.</summary>
    public string ToolTipText
    {
        get => _notifyIcon.Text;
        set => _notifyIcon.Text = value;
    }

    /// <summary>Commands shown in the notification-area context menu.</summary>
    public List<TrayMenuItem> MenuItems { get; } = new();

    /// <summary>Occurs when the notification-area icon is clicked with the primary button.</summary>
    public event EventHandler LeftClick;

    /// <summary>Creates and registers the notification-area icon.</summary>
    public TrayIcon()
    {
        _notifyIcon = new Forms.NotifyIcon { Visible = true };
        _notifyIcon.MouseClick += OnMouseClick;
    }

    private void OnMouseClick(object sender, Forms.MouseEventArgs e)
    {
        if (e.Button == Forms.MouseButtons.Left)
        {
            LeftClick?.Invoke(this, EventArgs.Empty);
        }
        else if (e.Button == Forms.MouseButtons.Right)
        {
            ShowContextMenu();
        }
    }

    private void ShowContextMenu()
    {
        if (MenuItems.Count == 0) return;

        var menu = new Forms.ContextMenuStrip();
        foreach (var item in MenuItems)
        {
            menu.Items.Add(item.Text, null, (_, _) => item.Handler?.Invoke());
        }

        menu.Show(Forms.Cursor.Position);
    }

    /// <inheritdoc/>
    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        _notifyIcon.MouseClick -= OnMouseClick;
        _notifyIcon.Visible = false;
        _notifyIcon.Dispose();
    }
}
