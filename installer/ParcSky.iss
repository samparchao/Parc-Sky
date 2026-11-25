; Parc Sky per-user Windows x64 installer
#ifndef ReleaseVersion
  #define ReleaseVersion "0.2.1"
#endif
#ifndef PayloadDir
  #error Set PayloadDir to the self-contained win-x64 publish directory.
#endif
#ifndef InstallerOutput
  #define InstallerOutput "."
#endif

[Setup]
AppId={{7B858674-7D94-4EA3-8971-969BCDD0E94D}
AppName=Parc Sky
AppVersion={#ReleaseVersion}
AppPublisher=Samuel Teixeira Parchao
AppPublisherURL=https://github.com/samparchao/WeatherApp
DefaultDirName={localappdata}\Programs\Parc Sky
DefaultGroupName=Parc Sky
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\WeatherApp.exe
SetupIconFile=..\WeatherApp\Assets\ParcSky.ico
OutputDir={#InstallerOutput}
OutputBaseFilename=Parc-Sky-{#ReleaseVersion}-Windows-x64-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[Files]
Source: "{#PayloadDir}\*"; DestDir: "{app}"; Excludes: "*.pdb,*.appx,*.msix,*.appxrecipe"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Parc Sky"; Filename: "{app}\WeatherApp.exe"

[Run]
Filename: "{app}\WeatherApp.exe"; Description: "Open Parc Sky"; Flags: nowait postinstall skipifsilent
