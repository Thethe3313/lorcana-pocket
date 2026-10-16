# Crée le raccourci « Lorcana Pocket » à la racine du projet : un double-clic ouvre le jeu dans sa propre fenêtre
# (mode application de Microsoft Edge, ou de Google Chrome à défaut : pas de barre d'adresse ni d'onglets).
# Le jeu est ouvert depuis son adresse en ligne ; après une première ouverture il marche aussi sans réseau
# (les visuels des cartes, eux, demandent une connexion : hors ligne ils sont remplacés par un cadre généré).
# Utilisation : powershell -ExecutionPolicy Bypass -File scripts\creer-raccourci.ps1
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$url = 'https://thethe3313.github.io/lorcana-pocket/'
$browsers = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$exe = $browsers | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $exe) { Write-Output "Ni Edge ni Chrome trouves : ouvre $url avec ton navigateur."; exit 1 }
$sh = New-Object -ComObject WScript.Shell
$lnk = $sh.CreateShortcut((Join-Path $root 'Lorcana Pocket.lnk'))
$lnk.TargetPath = $exe
$lnk.Arguments = "--app=`"$url`" --window-size=1400,900"
$lnk.IconLocation = (Join-Path $root 'jeu\icones\icone.ico') + ',0'
$lnk.Description = 'Lorcana Pocket : jeu de cartes Disney Lorcana'
$lnk.Save()
Write-Output "Raccourci cree : $root\Lorcana Pocket.lnk (navigateur : $exe)"
