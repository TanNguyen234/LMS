param (
    [string]$Server = "localhost\SQLEXPRESS",
    [string]$Database = "UniversityLms"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Setting up SQL Server Database: $Database on $Server ==="

# 1. Connect to master and create database if not exists
$masterConnStr = "Server=$Server;Database=master;Integrated Security=True;TrustServerCertificate=True"
$masterConn = New-Object System.Data.SqlClient.SqlConnection($masterConnStr)
$masterConn.Open()

$checkDbCmd = $masterConn.CreateCommand()
$checkDbCmd.CommandText = "IF DB_ID('$Database') IS NULL CREATE DATABASE [$Database];"
$checkDbCmd.ExecuteNonQuery() | Out-Null
Write-Host "Database '$Database' exists or created successfully."
$masterConn.Close()

# 2. Function to execute SQL file with GO batches
function Execute-SqlFile {
    param (
        [System.Data.SqlClient.SqlConnection]$conn,
        [string]$filePath
    )
    Write-Host "Executing $filePath ..."
    $content = Get-Content -Path $filePath -Raw -Encoding UTF8
    $batches = [System.Text.RegularExpressions.Regex]::Split($content, "(?mi)^\s*GO\s*$")
    foreach ($batch in $batches) {
        $trimmed = $batch.Trim()
        if ($trimmed.Length -gt 0) {
            $cmd = $conn.CreateCommand()
            $cmd.CommandText = $trimmed
            $cmd.CommandTimeout = 120
            try {
                $cmd.ExecuteNonQuery() | Out-Null
            } catch {
                Write-Host "Error in batch: $trimmed" -ForegroundColor Red
                throw $_
            }
        }
    }
    Write-Host "Successfully executed $filePath" -ForegroundColor Green
}

# 3. Connect to target database
$dbConnStr = "Server=$Server;Database=$Database;Integrated Security=True;TrustServerCertificate=True"
$dbConn = New-Object System.Data.SqlClient.SqlConnection($dbConnStr)
$dbConn.Open()

try {
    $checkTablesCmd = $dbConn.CreateCommand()
    $checkTablesCmd.CommandText = "SELECT COUNT(*) FROM sys.tables WHERE name = 'Users'"
    $tableCount = [int]$checkTablesCmd.ExecuteScalar()

    if ($tableCount -eq 0) {
        Execute-SqlFile -conn $dbConn -filePath "$PSScriptRoot\01_schema.sql"
        Execute-SqlFile -conn $dbConn -filePath "$PSScriptRoot\02_seed.sql"
    } else {
        Write-Host "Tables already exist in $Database. Run alembic upgrade head to migrate existing schema." -ForegroundColor Yellow
    }

    Write-Host "`n=== Validating 19-Table Seed Data ==="
    $valCmd = $dbConn.CreateCommand()
    $valCmd.CommandText = Get-Content -Path "$PSScriptRoot\04_seed_validation.sql" -Raw -Encoding UTF8
    $reader = $valCmd.ExecuteReader()
    $dt = New-Object System.Data.DataTable
    $dt.Load($reader)
    $dt | Format-Table -AutoSize | Out-String | Write-Host

} finally {
    $dbConn.Close()
}

Write-Host "=== Database setup completed successfully! ===" -ForegroundColor Green
