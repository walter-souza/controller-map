# test-interception.ps1
# Este script testa a simulação de teclado usando o driver Interception (Kernel-level).
# Ele encontra a interception.dll, identifica seu teclado físico e envia os inputs diretamente pelo kernel.

Write-Host "Procurando pela 'interception.dll' (x64)..." -ForegroundColor Cyan

# 1. Busca automática pela DLL em locais comuns
$dllPath = ""
$searchPaths = @(
    "C:\Interception",
    "$Home\Downloads",
    "C:\Users\User\Downloads",
    "C:\Users\User\source\repos\controller-map-electron"
)

foreach ($path in $searchPaths) {
    if (Test-Path $path) {
        $dllFile = Get-ChildItem -Path $path -Filter "interception.dll" -Recurse -ErrorAction SilentlyContinue | 
                   Where-Object { $_.FullName -like "*x64*" } | 
                   Select-Object -First 1
        if ($dllFile) {
            $dllPath = $dllFile.FullName
            break
        }
    }
}

if (-not $dllPath) {
    Write-Error "Não foi possível encontrar a 'interception.dll' (x64)."
    Write-Host "Por favor, garanta que extraiu a pasta do Interception.zip que você baixou em C:\Interception ou nos seus Downloads." -ForegroundColor Red
    exit 1
}

Write-Host "Encontrada em: $dllPath" -ForegroundColor Green

# Adiciona o diretório da DLL ao Path do processo atual
$dllDir = Split-Path $dllPath
$env:PATH += ";$dllDir"

# 2. Definição do código C# para fazer P/Invoke na interception.dll
$code = @"
using System;
using System.Runtime.InteropServices;
using System.Threading;

public class InterceptionSimulator {
    [StructLayout(LayoutKind.Sequential)]
    public struct KeyStroke {
        public ushort code;
        public ushort state;
        public uint information;
    }

    [StructLayout(LayoutKind.Explicit)]
    public struct Stroke {
        [FieldOffset(0)] public KeyStroke key;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr LoadLibrary(string dllToLoad);

    public delegate int Predicate(int device);

    [DllImport("interception.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr interception_create_context();

    [DllImport("interception.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern void interception_destroy_context(IntPtr context);

    [DllImport("interception.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern void interception_set_filter(IntPtr context, Predicate filter, ushort filter_flags);

    [DllImport("interception.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int interception_wait(IntPtr context);

    [DllImport("interception.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int interception_send(IntPtr context, int device, ref Stroke stroke, uint nstroke);

    [DllImport("interception.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int interception_receive(IntPtr context, int device, ref Stroke stroke, uint nstroke);

    public static void Load(string dllPath) {
        IntPtr hModule = LoadLibrary(dllPath);
        if (hModule == IntPtr.Zero) {
            throw new Exception("Falha ao carregar a DLL através do LoadLibrary a partir de: " + dllPath);
        }
    }

    public static int IsKeyboard(int device) {
        return (device >= 1 && device <= 10) ? 1 : 0;
    }

    public static int IdentifyDevice(IntPtr context) {
        // Intercepta o pressionamento de qualquer tecla
        interception_set_filter(context, IsKeyboard, 0x0001); // 0x0001 = KEY_DOWN

        int device = interception_wait(context);
        Stroke stroke = new Stroke();
        interception_receive(context, device, ref stroke, 1);
        
        // Importante: reenvia o evento original para que o teclado não fique congelado no Windows
        interception_send(context, device, ref stroke, 1);

        // Remove o filtro para não bloquear mais nada globalmente
        interception_set_filter(context, IsKeyboard, 0);

        return device;
    }

    public static void SendKey(IntPtr context, int device, ushort scanCode, int pressDurationMs) {
        Stroke strokeDown = new Stroke();
        strokeDown.key.code = scanCode;
        strokeDown.key.state = 0; // Key Down

        Stroke strokeUp = new Stroke();
        strokeUp.key.code = scanCode;
        strokeUp.key.state = 1; // Key Up

        // Envia pressionar
        interception_send(context, device, ref strokeDown, 1);
        Thread.Sleep(pressDurationMs);
        // Envia soltar
        interception_send(context, device, ref strokeUp, 1);
    }
}
"@

# Compila o código C# em tempo de execução no PowerShell
Add-Type -TypeDefinition $code

# Carrega explicitamente a biblioteca
[InterceptionSimulator]::Load($dllPath)

# 3. Inicializa o Contexto do Driver
$context = [InterceptionSimulator]::interception_create_context()
if ($context -eq [IntPtr]::Zero) {
    Write-Error "Falha ao criar o contexto do Interception. O driver do kernel está mesmo ativo e executando?"
    exit 1
}

try {
    Write-Host "`n=== IDENTIFICAÇÃO DO SEU TECLADO FISICO ===" -ForegroundColor Cyan
    Write-Host "Por favor, pressione QUALQUER TECLA do seu teclado físico (como Barra de Espaço) agora para identificar seu dispositivo..." -ForegroundColor Yellow

    $device = [InterceptionSimulator]::IdentifyDevice($context)
    Write-Host "Teclado detectado com sucesso! ID do Dispositivo: $device" -ForegroundColor Green

    Write-Host "`n=== PREPARAÇÃO DO TESTE DE SIMULAÇÃO ===" -ForegroundColor Cyan
    Write-Host "Você tem 5 segundos para clicar na janela do programa/jogo bloqueado..." -ForegroundColor Yellow
    for ($i = 5; $i -gt 0; $i--) {
        Write-Host "$i..."
        Start-Sleep -Seconds 1
    }

    Write-Host "Enviando tecla 'Espaço' (Scan Code 0x39) via Interception..." -ForegroundColor Green
    [InterceptionSimulator]::SendKey($context, $device, 0x39, 100)

    Start-Sleep -Milliseconds 500

    Write-Host "Enviando tecla 'A' (Scan Code 0x1E) via Interception..." -ForegroundColor Green
    [InterceptionSimulator]::SendKey($context, $device, 0x1E, 100)

    Write-Host "`nEnviado! Verifique se o espaço e o 'A' foram digitados no aplicativo bloqueado." -ForegroundColor Cyan
}
finally {
    # Limpeza crucial: destrói o contexto para evitar congelar as entradas do sistema em caso de erros
    [InterceptionSimulator]::interception_destroy_context($context)
    Write-Host "Contexto do Interception finalizado com segurança." -ForegroundColor Gray
}
