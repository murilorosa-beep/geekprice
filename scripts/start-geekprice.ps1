[CmdletBinding()]
param(
    [switch]$SkipInstall,
    [switch]$SkipSeed
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Test-Command([string]$Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-DockerEngine {
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & docker info 1>$null 2>$null
        return ($LASTEXITCODE -eq 0)
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }
}

function Wait-DockerEngine([int]$TimeoutSeconds = 120) {
    $attempts = [Math]::Ceiling($TimeoutSeconds / 3)
    for ($attempt = 1; $attempt -le $attempts; $attempt++) {
        if (Test-DockerEngine) { return $true }
        $elapsed = $attempt * 3
        Write-Host "Aguardando o Docker Desktop... ${elapsed}s/${TimeoutSeconds}s" -ForegroundColor DarkGray
        Start-Sleep -Seconds 3
    }
    return $false
}

try {
    Write-Host "GeekPrice - inicializacao local" -ForegroundColor Magenta

    if (-not (Test-Command "node")) {
        throw "Node.js nao foi encontrado. Instale uma versao compativel e tente novamente."
    }
    if (-not (Test-Command "npm")) {
        throw "npm nao foi encontrado no PATH."
    }

    # Hosted PostgreSQL uses the configured connection and never starts Docker,
    # migrates, or seeds implicitly. Inspect/backup precede database changes.
    if (Test-Path -LiteralPath (Join-Path $projectRoot ".env")) {
        $remoteDatabase = & node --env-file=.env -e 'const u=new URL(process.env.DATABASE_URL); console.log(!["localhost","127.0.0.1","::1"].includes(u.hostname))'
        if ($LASTEXITCODE -ne 0) { throw "DATABASE_URL invalida no .env." }
        if ($remoteDatabase -eq "true") {
            if (-not $SkipInstall -and -not (Test-Path -LiteralPath (Join-Path $projectRoot "node_modules"))) {
                npm.cmd install
                if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar dependencias." }
            }
            Write-Step "Verificando PostgreSQL remoto (somente leitura)"
            node --env-file=.env scripts/inspect-validation-environment.mjs
            if ($LASTEXITCODE -ne 0) { throw "Conexao remota indisponivel. Revise DATABASE_URL e o pooler do Supabase." }
            Write-Host "Migrations e seed remotos nao sao executados automaticamente; faca backup e siga docs/SUPABASE_SETUP.md." -ForegroundColor Yellow
            Write-Step "Iniciando GeekPrice com PostgreSQL remoto"
            npm.cmd run dev
            exit $LASTEXITCODE
        }
    }
    if (-not (Test-Command "docker")) {
        throw "Docker nao foi encontrado. Instale e abra o Docker Desktop."
    }

    if (-not (Test-DockerEngine)) {
        $dockerDesktopCandidates = @(
            (Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"),
            (Join-Path $env:LOCALAPPDATA "Docker\Docker Desktop.exe")
        )
        $dockerDesktopPath = $dockerDesktopCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
        if (-not $dockerDesktopPath) {
            throw "Docker Desktop esta instalado, mas seu aplicativo nao foi encontrado. Abra-o manualmente e tente novamente."
        }

        Write-Step "Abrindo o Docker Desktop"
        Start-Process -FilePath $dockerDesktopPath -WindowStyle Hidden
        if (-not (Wait-DockerEngine -TimeoutSeconds 120)) {
            throw "O Docker Desktop foi aberto, mas o engine nao respondeu em 120 segundos. Verifique se ele mostra um erro de inicializacao ou solicita atualizacao do WSL."
        }
    }

    $envPath = Join-Path $projectRoot ".env"
    $envExamplePath = Join-Path $projectRoot ".env.example"
    $envNeedsSetup = -not (Test-Path -LiteralPath $envPath)
    if (-not $envNeedsSetup) {
        $currentEnvContent = Get-Content -LiteralPath $envPath -Raw
        $envNeedsSetup = $currentEnvContent -match "replace-with-a-long-random-secret|admin@exemplo.com|replace-with-a-strong-local-password"
    }
    if ($envNeedsSetup) {
        if (-not (Test-Path -LiteralPath $envPath)) {
            Copy-Item -LiteralPath $envExamplePath -Destination $envPath
            Write-Host "Foi criado um arquivo .env a partir de .env.example." -ForegroundColor Yellow
        }
        else {
            Write-Host "O arquivo .env ainda possui valores de exemplo e sera configurado agora." -ForegroundColor Yellow
        }

        $randomBytes = New-Object byte[] 48
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($randomBytes)
        $generatedSecret = [Convert]::ToBase64String($randomBytes)

        do {
            $adminEmail = (Read-Host "E-mail do administrador inicial").Trim().ToLowerInvariant()
            $emailIsValid = $adminEmail -match "^[^\s@]+@[^\s@]+\.[^\s@]+$"
            if (-not $emailIsValid) { Write-Host "Informe um e-mail valido." -ForegroundColor Yellow }
        } until ($emailIsValid)

        do {
            $securePassword = Read-Host "Senha do administrador (minimo 12 caracteres)" -AsSecureString
            $secureConfirmation = Read-Host "Confirme a senha" -AsSecureString
            $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
            $confirmationPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureConfirmation)
            try {
                $adminPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
                $passwordConfirmation = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmationPointer)
            }
            finally {
                [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
                [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmationPointer)
            }
            $passwordIsValid = $adminPassword.Length -ge 12 -and $adminPassword -eq $passwordConfirmation
            if (-not $passwordIsValid) { Write-Host "As senhas devem ser iguais e possuir pelo menos 12 caracteres." -ForegroundColor Yellow }
        } until ($passwordIsValid)

        $newEnvContent = Get-Content -LiteralPath $envPath -Raw
        $newEnvContent = $newEnvContent.Replace("replace-with-a-long-random-secret", $generatedSecret)
        $newEnvContent = $newEnvContent.Replace("admin@exemplo.com", $adminEmail)
        $escapedAdminPassword = $adminPassword.Replace('\', '\\').Replace('"', '\"')
        $newEnvContent = $newEnvContent.Replace("replace-with-a-strong-local-password", '"' + $escapedAdminPassword + '"')
        [System.IO.File]::WriteAllText($envPath, $newEnvContent, (New-Object System.Text.UTF8Encoding($false)))
        $adminPassword = $null
        $passwordConfirmation = $null
        Write-Host "Configuracao local criada. Continuando a inicializacao..." -ForegroundColor Green
    }

    if (-not $SkipInstall) {
        if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "node_modules"))) {
            Write-Step "Instalando dependencias"
            npm install
            if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar dependencias." }
        }
        else {
            Write-Host "Dependencias ja instaladas." -ForegroundColor DarkGray
        }
    }

    Write-Step "Iniciando PostgreSQL"
    docker compose up -d postgres
    if ($LASTEXITCODE -ne 0) { throw "Falha ao iniciar o PostgreSQL." }

    Write-Step "Aguardando o PostgreSQL ficar pronto"
    $databaseReady = $false
    for ($attempt = 1; $attempt -le 30; $attempt++) {
        docker compose exec -T postgres pg_isready -U geekprice -d geekprice *> $null
        if ($LASTEXITCODE -eq 0) {
            $databaseReady = $true
            break
        }
        Start-Sleep -Seconds 2
    }
    if (-not $databaseReady) { throw "O PostgreSQL nao ficou pronto dentro de 60 segundos." }

    Write-Step "Aplicando migrations pendentes"
    npm run db:migrate
    if ($LASTEXITCODE -ne 0) { throw "Falha ao aplicar as migrations." }

    if (-not $SkipSeed) {
        $envContent = Get-Content -LiteralPath $envPath -Raw
        $hasExampleEmail = $envContent -match "SEED_ADMIN_EMAIL=admin@exemplo.com"
        $hasExamplePassword = $envContent -match "SEED_ADMIN_PASSWORD=replace-with-a-strong-local-password"
        if ($hasExampleEmail -or $hasExamplePassword) {
            Write-Host "Seed ignorado: configure SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD no .env." -ForegroundColor Yellow
        }
        else {
            Write-Step "Garantindo a organizacao e o administrador iniciais"
            npm run db:seed
            if ($LASTEXITCODE -ne 0) { throw "Falha ao executar o seed inicial." }
        }
    }

    Write-Step "Iniciando o GeekPrice"
    Write-Host "Acesse http://localhost:3000" -ForegroundColor Green
    Write-Host "Use Ctrl+C para encerrar o servidor web. O PostgreSQL continuara ativo." -ForegroundColor DarkGray
    npm run dev
    exit $LASTEXITCODE
}
catch {
    Write-Host "`nErro: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
