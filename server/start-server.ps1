# 스크립트의 인코딩이 UTF-8 with BOM으로 저장되어야 합니다.

# .NET 어셈블리 로드
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# 서버 프로세스 변수
$serverProcess = $null

# 서버 시작 함수
function Start-Server {
    # 스크립트가 위치한 폴더에서 node server.js 실행
    $scriptPath = $PSScriptRoot
    $serverProcess = Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $scriptPath -PassThru -WindowStyle Hidden
    if ($serverProcess) {
        $notifyIcon.Text = "메신저 서버 실행 중 (PID: $($serverProcess.Id))"
    }
}

# 서버 중지 함수
function Stop-Server {
    if ($null -ne $serverProcess -and !$serverProcess.HasExited) {
        Stop-Process -Id $serverProcess.Id -Force
    }
    $serverProcess = $null
}

# 트레이 아이콘 생성
$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$notifyIcon.Icon = [System.Drawing.SystemIcons]::Information
$notifyIcon.Text = "메신저 서버"
$notifyIcon.Visible = $true

# 트레이 아이콘 우클릭 메뉴 액션 정의
$restartAction = {
    Stop-Server
    Start-Server
}
$exitAction = {
    Stop-Server
    $notifyIcon.Dispose()
    [System.Windows.Forms.Application]::Exit()
}

# 컨텍스트 메뉴 및 메뉴 아이템 생성
$contextMenu = New-Object System.Windows.Forms.ContextMenu
$restartMenuItem = New-Object System.Windows.Forms.MenuItem("재시작")
$restartMenuItem.add_Click($restartAction)
$exitMenuItem = New-Object System.Windows.Forms.MenuItem("종료")
$exitMenuItem.add_Click($exitAction)

$contextMenu.MenuItems.Add($restartMenuItem) | Out-Null
$contextMenu.MenuItems.Add($exitMenuItem) | Out-Null

$notifyIcon.ContextMenu = $contextMenu

# --- 메인 로직 ---
# 서버 시작
Start-Server

# 트레이 아이콘이 사라지지 않도록 Application 실행
[System.Windows.Forms.Application]::Run()

# Application 종료 시 서버 프로세스 정리
Stop-Server
$notifyIcon.Dispose()
