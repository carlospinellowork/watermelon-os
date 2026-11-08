<#
  Instalador do WatermelonOS para Windows: instala num SEGUNDO DISCO, sem pendrive.
  O disco do Windows nunca é tocado. Ao final, o computador ganha dual boot:
  menu com WatermelonOS e Windows.

  O que faz:
    1. mostra os discos (o disco do Windows aparece bloqueado);
    2. baixa o WatermelonOS e grava direto no disco escolhido (sem arquivo temporário);
    3. cria a entrada "WatermelonOS" no boot da placa-mãe (primeira da lista);
    4. pausa o BitLocker por 1 reinício (evita pedir a chave de recuperação);
    5. desliga a inicialização rápida (evita corromper dados em dual boot).
#>
param(
  [string]$Repo = "carlospinellowork/watermelon-os",
  [string]$LocalDir = "",   # testes: pasta com os arquivos .part, SHA256SUMS e .size
  [string]$BaseUrl = "",    # testes: servidor HTTP com os mesmos arquivos
  [switch]$Unattended,      # testes automatizados: instala sem interface no disco -Disk
  [int]$Disk = -1
)

$ErrorActionPreference = "Stop"

# ------------------------------------------------------------------ administrador
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $args2 = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Repo `"$Repo`""
  if ($LocalDir) { $args2 += " -LocalDir `"$LocalDir`"" }
  if ($BaseUrl) { $args2 += " -BaseUrl `"$BaseUrl`"" }
  if ($Unattended) { $args2 += " -Unattended -Disk $Disk" }
  Start-Process powershell.exe -Verb RunAs -ArgumentList $args2
  exit
}

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Escrita direta no disco (o FileStream do .NET não abre \\.\PhysicalDriveN sozinho)
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class RawDisk {
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr sec, uint disp, uint flags, IntPtr tmpl);
  public static FileStream Open(int number) {
    // GENERIC_READ|GENERIC_WRITE, FILE_SHARE_READ|WRITE, OPEN_EXISTING, FILE_FLAG_WRITE_THROUGH
    var h = CreateFile(@"\\.\PhysicalDrive" + number, 0xC0000000, 3, IntPtr.Zero, 3, 0x80000000, IntPtr.Zero);
    if (h.IsInvalid) throw new IOException("Não foi possível abrir o disco " + number + " (erro " + Marshal.GetLastWin32Error() + ")");
    return new FileStream(h, FileAccess.ReadWrite, 4 * 1024 * 1024);
  }
}
// Junta várias partes (.part00, .part01...) num único fluxo, calculando o SHA-256 de cada parte
public class PartsStream : Stream {
  readonly Func<int, Stream> open; readonly int count; int idx = -1; Stream cur;
  public System.Collections.Generic.List<string> Hashes = new System.Collections.Generic.List<string>();
  System.Security.Cryptography.SHA256 sha;
  public PartsStream(Func<int, Stream> open, int count) { this.open = open; this.count = count; Next(); }
  void Next() {
    if (cur != null) { sha.TransformFinalBlock(new byte[0], 0, 0); Hashes.Add(BitConverter.ToString(sha.Hash).Replace("-", "").ToLowerInvariant()); cur.Dispose(); }
    idx++; cur = idx < count ? open(idx) : null; sha = System.Security.Cryptography.SHA256.Create();
  }
  public override int Read(byte[] b, int o, int c) {
    while (cur != null) { int n = cur.Read(b, o, c); if (n > 0) { sha.TransformBlock(b, o, n, null, 0); return n; } Next(); }
    return 0;
  }
  public override bool CanRead { get { return true; } } public override bool CanSeek { get { return false; } } public override bool CanWrite { get { return false; } }
  public override long Length { get { throw new NotSupportedException(); } } public override long Position { get { throw new NotSupportedException(); } set { throw new NotSupportedException(); } }
  public override void Flush() {} public override long Seek(long a, SeekOrigin b) { throw new NotSupportedException(); }
  public override void SetLength(long v) { throw new NotSupportedException(); } public override void Write(byte[] b, int o, int c) { throw new NotSupportedException(); }
}
"@

# ------------------------------------------------------------------ cores e fontes
$Melon = [System.Drawing.Color]::FromArgb(232, 48, 74)
$Ink   = [System.Drawing.Color]::FromArgb(29, 29, 31)
$Soft  = [System.Drawing.Color]::FromArgb(110, 110, 115)
$Bg    = [System.Drawing.Color]::FromArgb(250, 250, 248)
$FontTitle = New-Object System.Drawing.Font("Segoe UI", 20, [System.Drawing.FontStyle]::Bold)
$FontBody  = New-Object System.Drawing.Font("Segoe UI", 10)
$FontSmall = New-Object System.Drawing.Font("Segoe UI", 9)

# ------------------------------------------------------------------ janela
$form = New-Object System.Windows.Forms.Form
$form.Text = "Instalar WatermelonOS"
$form.Size = New-Object System.Drawing.Size(760, 640)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.BackColor = $Bg
$form.Font = $FontBody

$title = New-Object System.Windows.Forms.Label
$title.Text = "watermelonOS"
$title.Font = $FontTitle
$title.ForeColor = $Melon
$title.AutoSize = $true
$title.Location = New-Object System.Drawing.Point(28, 20)
$form.Controls.Add($title)

$sub = New-Object System.Windows.Forms.Label
$sub.Text = "Instala o WatermelonOS em um segundo disco, sem pendrive. O Windows continua intacto`ne você escolhe qual sistema usar ao ligar o computador."
$sub.ForeColor = $Soft
$sub.AutoSize = $true
$sub.Location = New-Object System.Drawing.Point(30, 66)
$form.Controls.Add($sub)

$lblDisks = New-Object System.Windows.Forms.Label
$lblDisks.Text = "1. Escolha o disco onde o WatermelonOS será instalado:"
$lblDisks.ForeColor = $Ink
$lblDisks.AutoSize = $true
$lblDisks.Location = New-Object System.Drawing.Point(30, 118)
$form.Controls.Add($lblDisks)

$list = New-Object System.Windows.Forms.ListView
$list.View = "Details"
$list.FullRowSelect = $true
$list.MultiSelect = $false
$list.HideSelection = $false
$list.Location = New-Object System.Drawing.Point(30, 142)
$list.Size = New-Object System.Drawing.Size(684, 170)
[void]$list.Columns.Add("Disco", 60)
[void]$list.Columns.Add("Modelo", 300)
[void]$list.Columns.Add("Tamanho", 100)
[void]$list.Columns.Add("Situação", 210)
$form.Controls.Add($list)

$chkErase = New-Object System.Windows.Forms.CheckBox
$chkErase.Text = "Entendo que TUDO no disco escolhido será apagado."
$chkErase.AutoSize = $true
$chkErase.Location = New-Object System.Drawing.Point(30, 324)
$form.Controls.Add($chkErase)

$chkBackup = New-Object System.Windows.Forms.CheckBox
$chkBackup.Text = "Fiz backup do que era importante nesse disco."
$chkBackup.AutoSize = $true
$chkBackup.Location = New-Object System.Drawing.Point(30, 350)
$form.Controls.Add($chkBackup)

$progress = New-Object System.Windows.Forms.ProgressBar
$progress.Location = New-Object System.Drawing.Point(30, 392)
$progress.Size = New-Object System.Drawing.Size(684, 22)
$progress.Maximum = 1000
$form.Controls.Add($progress)

$status = New-Object System.Windows.Forms.Label
$status.Text = "Pronto para instalar."
$status.ForeColor = $Soft
$status.AutoSize = $true
$status.Location = New-Object System.Drawing.Point(30, 420)
$form.Controls.Add($status)

$log = New-Object System.Windows.Forms.TextBox
$log.Multiline = $true
$log.ReadOnly = $true
$log.ScrollBars = "Vertical"
$log.Font = New-Object System.Drawing.Font("Consolas", 9)
$log.Location = New-Object System.Drawing.Point(30, 446)
$log.Size = New-Object System.Drawing.Size(684, 92)
$form.Controls.Add($log)

$btn = New-Object System.Windows.Forms.Button
$btn.Text = "Instalar"
$btn.BackColor = $Melon
$btn.ForeColor = [System.Drawing.Color]::White
$btn.FlatStyle = "Flat"
$btn.FlatAppearance.BorderSize = 0
$btn.Font = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
$btn.Size = New-Object System.Drawing.Size(160, 40)
$btn.Location = New-Object System.Drawing.Point(554, 548)
$btn.Enabled = $false
$form.Controls.Add($btn)

function Log([string]$msg) {
  $log.AppendText("$msg`r`n")
  [System.Windows.Forms.Application]::DoEvents()
}
function SetStatus([string]$msg) { $status.Text = $msg; [System.Windows.Forms.Application]::DoEvents() }

# ------------------------------------------------------------------ discos
$MinBytes = 64GB
function Load-Disks {
  $list.Items.Clear()
  foreach ($d in (Get-Disk | Sort-Object Number)) {
    $size = "{0:N0} GB" -f ($d.Size / 1GB)
    $reason = $null
    if ($d.IsBoot -or $d.IsSystem) { $reason = "Windows: protegido" }
    elseif ($d.BusType -eq "USB") { $reason = "Pendrive/USB: não suportado" }
    elseif ($d.Size -lt $MinBytes) { $reason = "Pequeno demais (mín. 64 GB)" }
    $item = New-Object System.Windows.Forms.ListViewItem([string]$d.Number)
    [void]$item.SubItems.Add(($d.FriendlyName).Trim())
    [void]$item.SubItems.Add($size)
    if ($reason) {
      [void]$item.SubItems.Add($reason)
      $item.ForeColor = [System.Drawing.Color]::Gray
      $item.Tag = $null
    } else {
      $parts = @(Get-Partition -DiskNumber $d.Number -ErrorAction SilentlyContinue).Count
      [void]$item.SubItems.Add($(if ($parts) { "Disponível ($parts partições serão apagadas)" } else { "Disponível (vazio)" }))
      $item.Tag = $d.Number
    }
    [void]$list.Items.Add($item)
  }
}

function Update-Button {
  $sel = if ($list.SelectedItems.Count) { $list.SelectedItems[0].Tag } else { $null }
  $btn.Enabled = ($null -ne $sel) -and $chkErase.Checked -and $chkBackup.Checked
}
$list.Add_SelectedIndexChanged({ Update-Button })
$chkErase.Add_CheckedChanged({ Update-Button })
$chkBackup.Add_CheckedChanged({ Update-Button })

# ------------------------------------------------------------------ fontes do download
function Get-Source {
  if ($LocalDir) {
    $parts = Get-ChildItem $LocalDir -Filter "watermelon-os-disk.raw.gz.part*" | Sort-Object Name
    $size = [int64](Get-Content (Join-Path $LocalDir "watermelon-os-disk.size"))
    $sums = Get-Content (Join-Path $LocalDir "SHA256SUMS")
    return @{ Parts = @($parts | ForEach-Object { $_.FullName }); Size = $size; Sums = $sums; Local = $true }
  }
  if ($BaseUrl) {
    $sums = (Invoke-RestMethod "$BaseUrl/SHA256SUMS") -split "`n" | Where-Object { $_.Trim() }
    $names = $sums | ForEach-Object { ($_ -split '\s+')[-1].TrimStart('*') } | Sort-Object
    $size = [int64](Invoke-RestMethod "$BaseUrl/watermelon-os-disk.size")
    return @{ Parts = @($names | ForEach-Object { "$BaseUrl/$_" }); Size = $size; Sums = $sums; Local = $false; Tag = "teste ($BaseUrl)" }
  }
  $rel = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/latest" -Headers @{ "User-Agent" = "WatermelonOS-Installer" }
  $assets = $rel.assets
  $parts = $assets | Where-Object { $_.name -like "watermelon-os-disk.raw.gz.part*" } | Sort-Object name
  if (-not $parts) { throw "A versão $($rel.tag_name) não tem o disco pronto para download." }
  $size = [int64](Invoke-RestMethod ($assets | Where-Object name -eq "watermelon-os-disk.size").browser_download_url)
  $sums = (Invoke-RestMethod ($assets | Where-Object name -eq "SHA256SUMS").browser_download_url) -split "`n"
  return @{ Parts = @($parts | ForEach-Object { $_.browser_download_url }); Size = $size; Sums = $sums; Local = $false; Tag = $rel.tag_name }
}

function Open-Part($src, [int]$i) {
  if ($src.Local) { return [System.IO.File]::OpenRead($src.Parts[$i]) }
  $req = [System.Net.HttpWebRequest]::Create($src.Parts[$i])
  $req.UserAgent = "WatermelonOS-Installer"
  $req.Timeout = 60000
  $req.ReadWriteTimeout = 120000
  return $req.GetResponse().GetResponseStream()
}

# ------------------------------------------------------------------ instalação
function Install-Watermelon([int]$num) {
  $btn.Enabled = $false; $list.Enabled = $false; $chkErase.Enabled = $false; $chkBackup.Enabled = $false

  SetStatus "Buscando a versão mais recente..."
  $src = Get-Source
  Log ("Versão: " + $(if ($src.Local) { "arquivos locais" } else { $src.Tag }) + " · " + ("{0:N1} GB" -f ($src.Size / 1GB)))

  $disk = Get-Disk -Number $num
  if ($disk.IsBoot -or $disk.IsSystem) { throw "Disco do Windows: instalação bloqueada." }
  if ($disk.Size -lt $src.Size) { throw "O disco é menor que o sistema." }

  SetStatus "Preparando o disco $num..."
  if ($disk.IsOffline) { Set-Disk -Number $num -IsOffline $false }
  if ($disk.IsReadOnly) { Set-Disk -Number $num -IsReadOnly $false }
  if ($disk.PartitionStyle -ne "RAW") { Clear-Disk -Number $num -RemoveData -RemoveOEM -Confirm:$false }
  Set-Disk -Number $num -IsOffline $true     # offline: o Windows não mexe no disco durante a gravação
  Log "Disco $num limpo e reservado."

  SetStatus "Baixando e gravando o WatermelonOS..."
  $parts = New-Object PartsStream([Func[int, System.IO.Stream]] { param($i) Open-Part $src $i }, $src.Parts.Count)
  $gz = New-Object System.IO.Compression.GZipStream($parts, [System.IO.Compression.CompressionMode]::Decompress)
  $out = [RawDisk]::Open($num)
  $buf = New-Object byte[] (4MB)
  [int64]$written = 0
  $sw = [Diagnostics.Stopwatch]::StartNew()
  try {
    while ($true) {
      # preenche o buffer inteiro (a gravação em disco precisa de blocos alinhados)
      $fill = 0
      while ($fill -lt $buf.Length) {
        $n = $gz.Read($buf, $fill, $buf.Length - $fill)
        if ($n -le 0) { break }
        $fill += $n
      }
      if ($fill -le 0) { break }
      if ($fill % 4096) { [Array]::Clear($buf, $fill, 4096 - ($fill % 4096)); $fill += 4096 - ($fill % 4096) }
      $out.Write($buf, 0, $fill)
      $written += $fill
      $pct = [Math]::Min(1000, [int](1000 * $written / $src.Size))
      $progress.Value = $pct
      $mbps = ($written / 1MB) / [Math]::Max(1, $sw.Elapsed.TotalSeconds)
      SetStatus ("Gravando: {0:N1} de {1:N1} GB · {2:N0} MB/s" -f ($written / 1GB), ($src.Size / 1GB), $mbps)
    }
    $out.Flush()
  } finally { $out.Dispose(); $gz.Dispose() }
  Log ("Gravado: {0:N1} GB em {1:N0} min." -f ($written / 1GB), $sw.Elapsed.TotalMinutes)

  # confere o SHA-256 de cada parte baixada
  for ($i = 0; $i -lt $parts.Hashes.Count; $i++) {
    $name = [IO.Path]::GetFileName(([string]$src.Parts[$i]).Split('/')[-1])
    $expected = ($src.Sums | Where-Object { $_ -match [regex]::Escape($name) }) -replace '\s.*$', ''
    if ($expected -and $expected.Trim() -ne $parts.Hashes[$i]) { throw "Arquivo corrompido no download ($name). Rode o instalador de novo." }
  }
  Log "Integridade verificada (SHA-256)."

  SetStatus "Configurando o boot..."
  Set-Disk -Number $num -IsOffline $false
  Update-Disk -Number $num
  Start-Sleep -Seconds 2
  $esp = Get-Partition -DiskNumber $num | Where-Object { $_.GptType -eq "{c12a7328-f81f-11d2-ba4b-00a0c93ec93b}" } | Select-Object -First 1
  if (-not $esp) { throw "Partição de boot do WatermelonOS não encontrada." }
  $letter = (68..90 | ForEach-Object { [char]$_ } | Where-Object { -not (Test-Path "$($_):\") } | Select-Object -Last 1)
  try { Set-Partition -DiskNumber $num -PartitionNumber $esp.PartitionNumber -NewDriveLetter $letter }
  catch {
    # algumas versões do Windows não deixam dar letra à partição EFI pelo PowerShell: tenta pelo diskpart
    $dp = [IO.Path]::GetTempFileName()
    "select disk $num`r`nselect partition $($esp.PartitionNumber)`r`nassign letter=$letter`r`n" | Set-Content $dp -Encoding ASCII
    diskpart /s $dp | Out-Null
    Remove-Item $dp
    if (-not (Test-Path "$($letter):\")) { throw "Não foi possível acessar a partição de boot do disco $num." }
  }
  try {
    $loader = if (Test-Path "$($letter):\EFI\fedora\shimx64.efi") { "\EFI\fedora\shimx64.efi" } else { "\EFI\BOOT\BOOTX64.EFI" }
    $copy = (bcdedit /copy "{bootmgr}" /d "WatermelonOS") -join " "
    if ($copy -notmatch '(\{[0-9a-fA-F-]{36}\})') { throw "bcdedit: $copy" }
    $id = $Matches[1]
    bcdedit /set $id device "partition=$($letter):" | Out-Null
    bcdedit /set $id path $loader | Out-Null
    bcdedit /set "{fwbootmgr}" displayorder $id /addfirst | Out-Null
    Log "Boot: entrada WatermelonOS criada ($id) e colocada em primeiro."
  } finally {
    Remove-PartitionAccessPath -DiskNumber $num -PartitionNumber $esp.PartitionNumber -AccessPath "$($letter):\" -ErrorAction SilentlyContinue
  }

  # BitLocker: pausa por 1 reinício para a mudança no boot não pedir a chave de recuperação
  try {
    $bl = Get-BitLockerVolume -MountPoint $env:SystemDrive -ErrorAction Stop
    if ($bl.ProtectionStatus -eq "On") { Suspend-BitLocker -MountPoint $env:SystemDrive -RebootCount 1 | Out-Null; Log "BitLocker pausado por 1 reinício." }
  } catch { }

  # Inicialização rápida deixa o Windows "meio desligado" e atrapalha dual boot
  powercfg /hibernate off 2>$null | Out-Null
  Log "Inicialização rápida desligada."

  $progress.Value = 1000
  SetStatus "Instalado!"
  if ($Unattended) { Log "Modo automático: reiniciando."; Restart-Computer -Force; return }
  $r = [System.Windows.Forms.MessageBox]::Show(
    "O WatermelonOS foi instalado no disco $num.`n`nAo reiniciar, o computador entra no WatermelonOS. O Windows continua disponível no menu de boot (5 segundos para escolher).`n`nReiniciar agora?",
    "Instalado! 🍉", "YesNo", "Information")
  if ($r -eq "Yes") { Restart-Computer -Force }
  $form.Close()
}

$btn.Add_Click({
  $num = [int]$list.SelectedItems[0].Tag
  $d = Get-Disk -Number $num
  $ok = [System.Windows.Forms.MessageBox]::Show(
    ("Última confirmação:`n`nApagar o disco {0} ({1}, {2:N0} GB) e instalar o WatermelonOS?" -f $num, $d.FriendlyName.Trim(), ($d.Size / 1GB)),
    "Instalar WatermelonOS", "YesNo", "Warning")
  if ($ok -ne "Yes") { return }
  try { Install-Watermelon $num }
  catch {
    Log ("ERRO: " + $_.Exception.Message)
    SetStatus "Algo deu errado. O Windows não foi alterado."
    try { Set-Disk -Number $num -IsOffline $false } catch { }
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "Erro na instalação", "OK", "Error") | Out-Null
    $list.Enabled = $true; $chkErase.Enabled = $true; $chkBackup.Enabled = $true; Update-Button
  }
})

Load-Disks
if ($Unattended) {
  # Testes: mesma instalação, sem cliques. Log em C:\watermelon-install.log
  $form.Show()
  try { Install-Watermelon $Disk } catch { Log ("ERRO: " + $_.Exception.Message) }
  $log.Text | Set-Content C:\watermelon-install.log
} else {
  [void]$form.ShowDialog()
}
