# reverb-keepalive.ps1
# Auto-reinicia Laravel Reverb si se detiene.
# Uso: ejecutar desde la raíz del proyecto atlas-backend
#   powershell -ExecutionPolicy Bypass -File scripts\reverb-keepalive.ps1

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$PhpBin      = "php"          # cambia a ruta absoluta si php no está en PATH
$RestartWait = 5              # segundos entre reintentos

Write-Host "[reverb-keepalive] Iniciando en $ProjectRoot" -ForegroundColor Cyan

while ($true) {
    Write-Host "[reverb-keepalive] Arrancando Reverb en puerto 8081..." -ForegroundColor Green
    $proc = Start-Process `
        -FilePath $PhpBin `
        -ArgumentList "artisan", "reverb:start", "--port=8081" `
        -WorkingDirectory $ProjectRoot `
        -NoNewWindow `
        -PassThru

    $proc.WaitForExit()

    $exitCode = $proc.ExitCode
    Write-Host "[reverb-keepalive] Reverb terminó con código $exitCode. Reiniciando en ${RestartWait}s..." -ForegroundColor Yellow
    Start-Sleep -Seconds $RestartWait
}
