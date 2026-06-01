# test-scancode.ps1
# Este script envia teclas simuladas usando a API Windows SendInput com Scan Codes físicos.
# Ele espera 5 segundos para dar tempo de você clicar e focar na janela do programa/jogo alvo.

$code = @"
using System;
using System.Runtime.InteropServices;

public class InputSimulator {
    [StructLayout(LayoutKind.Sequential)]
    struct keyboardInput {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Explicit)]
    struct inputUnion {
        [FieldOffset(0)]
        public keyboardInput ki;
    }

    struct INPUT {
        public int type;
        public inputUnion u;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    const int INPUT_KEYBOARD = 1;
    const uint KEYEVENTF_SCANCODE = 0x0008;
    const uint KEYEVENTF_KEYUP = 0x0002;

    public static void SendScanCode(ushort scanCode, int pressDurationMs) {
        INPUT[] inputs = new INPUT[2];

        // Tecla pressionada (Key Down)
        inputs[0] = new INPUT();
        inputs[0].type = INPUT_KEYBOARD;
        inputs[0].u.ki.wVk = 0; // wVk deve ser 0 quando usamos Scan Codes
        inputs[0].u.ki.wScan = scanCode;
        inputs[0].u.ki.dwFlags = KEYEVENTF_SCANCODE;
        inputs[0].u.ki.time = 0;
        inputs[0].u.ki.dwExtraInfo = IntPtr.Zero;

        // Tecla solta (Key Up)
        inputs[1] = new INPUT();
        inputs[1].type = INPUT_KEYBOARD;
        inputs[1].u.ki.wVk = 0;
        inputs[1].u.ki.wScan = scanCode;
        inputs[1].u.ki.dwFlags = KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP;
        inputs[1].u.ki.time = 0;
        inputs[1].u.ki.dwExtraInfo = IntPtr.Zero;

        // Envia o pressionamento
        SendInput(1, new INPUT[] { inputs[0] }, Marshal.SizeOf(typeof(INPUT)));
        
        // Mantém a tecla pressionada pelo tempo determinado
        System.Threading.Thread.Sleep(pressDurationMs);
        
        // Solta a tecla
        SendInput(1, new INPUT[] { inputs[1] }, Marshal.SizeOf(typeof(INPUT)));
    }
}
"@

# Compila o código C# em tempo de execução no PowerShell
Add-Type -TypeDefinition $code

Write-Host "=== TESTANDO SIMULAÇÃO DE TECLADO POR SCAN CODES ===" -ForegroundColor Cyan
Write-Host "Você tem 5 segundos para clicar na janela do programa/jogo bloqueado..." -ForegroundColor Yellow
for ($i = 5; $i -gt 0; $i--) {
    Write-Host "$i..."
    Start-Sleep -Seconds 1
}

Write-Host "Enviando tecla 'Espaço' (Scan Code 0x39)..." -ForegroundColor Green
[InputSimulator]::SendScanCode(0x39, 100) # 0x39 é o Scan Code para Espaço

Start-Sleep -Milliseconds 500

Write-Host "Enviando tecla 'A' (Scan Code 0x1E)..." -ForegroundColor Green
[InputSimulator]::SendScanCode(0x1E, 100) # 0x1E é o Scan Code para a letra 'A'

Write-Host "Enviado! Verifique se um espaço e a letra 'A' foram digitados no programa alvo." -ForegroundColor Cyan
