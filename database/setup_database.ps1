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
    # Split batches by GO (case insensitive, on its own line)
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

# 3. Connect to UniversityLms
$dbConnStr = "Server=$Server;Database=$Database;Integrated Security=True;TrustServerCertificate=True"
$dbConn = New-Object System.Data.SqlClient.SqlConnection($dbConnStr)
$dbConn.Open()

try {
    # Check if Users table exists. If so, drop tables or report
    $checkTablesCmd = $dbConn.CreateCommand()
    $checkTablesCmd.CommandText = "SELECT COUNT(*) FROM sys.tables WHERE name = 'Users'"
    $tableCount = [int]$checkTablesCmd.ExecuteScalar()

    if ($tableCount -eq 0) {
        Execute-SqlFile -conn $dbConn -filePath "$PSScriptRoot\01_schema.sql"
        Execute-SqlFile -conn $dbConn -filePath "$PSScriptRoot\02_seed.sql"
    } else {
        Write-Host "Tables already exist in $Database. Skipping initial schema and seed." -ForegroundColor Yellow
    }

    # Validate seed
    Write-Host "`n=== Validating Seed Data ==="
    $valCmd = $dbConn.CreateCommand()
    $valCmd.CommandText = @"
SELECT 'Users' AS TableName, COUNT(*) AS [RowCount] FROM dbo.Users
UNION ALL SELECT 'Courses', COUNT(*) FROM dbo.Courses
UNION ALL SELECT 'Enrollments', COUNT(*) FROM dbo.Enrollments
UNION ALL SELECT 'Modules', COUNT(*) FROM dbo.Modules
UNION ALL SELECT 'Lessons', COUNT(*) FROM dbo.Lessons
UNION ALL SELECT 'Assignments', COUNT(*) FROM dbo.Assignments
UNION ALL SELECT 'Submissions', COUNT(*) FROM dbo.Submissions
UNION ALL SELECT 'Quizzes', COUNT(*) FROM dbo.Quizzes
UNION ALL SELECT 'QuizQuestions', COUNT(*) FROM dbo.QuizQuestions
UNION ALL SELECT 'QuizAttempts', COUNT(*) FROM dbo.QuizAttempts
UNION ALL SELECT 'Grades', COUNT(*) FROM dbo.Grades
UNION ALL SELECT 'Notifications', COUNT(*) FROM dbo.Notifications;
"@
    $reader = $valCmd.ExecuteReader()
    $dt = New-Object System.Data.DataTable
    $dt.Load($reader)
    $dt | Format-Table -AutoSize | Out-String | Write-Host

} finally {
    $dbConn.Close()
}

Write-Host "=== Database setup completed successfully! ===" -ForegroundColor Green
