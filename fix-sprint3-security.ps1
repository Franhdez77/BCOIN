$ErrorActionPreference = 'Stop'

$path = Join-Path (Get-Location) 'docs/SECURITY.md'
if (-not (Test-Path -LiteralPath $path)) {
    throw "No se encontro docs/SECURITY.md desde el directorio actual. Ejecuta este script desde la raiz del repo."
}

$text = [System.IO.File]::ReadAllText($path)

if ($text.Contains('Sprint 3 Mining now applies the economic boundary directly:')) {
    Write-Host 'docs/SECURITY.md ya contiene el bloque de Sprint 3. No se hicieron cambios.'
    exit 0
}

$pattern = 'Future Mining/Rewards claims must use this service and add domain-specific concurrency/idempotency\r?\ntests rather than bypassing the wallet boundary\. Privileged/manual adjustments remain internal\r?\nuntil the Admin sprint and must record actor, request/reference, and reason\.'

$match = [System.Text.RegularExpressions.Regex]::Match($text, $pattern)
if (-not $match.Success) {
    throw "No encontre el parrafo antiguo esperado en docs/SECURITY.md. No se modifico ningun archivo."
}

$newline = if ($text.Contains("`r`n")) { "`r`n" } else { "`n" }
$replacementLines = @(
    'Sprint 3 Mining now applies the economic boundary directly:',
    '',
    '- mining start/claim never accept client-owned `userId`, reward, timestamps, claimed state, or',
    '  balance; non-empty command bodies are rejected;',
    '- session timing and reward are validated backend configuration, and the reward is snapshotted at',
    '  start;',
    '- a PostgreSQL partial unique index prevents multiple open sessions for one user even under',
    '  concurrent starts;',
    '- claim eligibility uses server time and a conditional `claimedAt IS NULL` transition;',
    '- claim state, wallet credit, and immutable ledger creation occur in one serializable transaction;',
    '- the wallet ledger uses `referenceType=MINING`, `referenceId=sessionId`, and deterministic',
    '  `mining:claim:<sessionId>` idempotency;',
    '- concurrent/replayed claims can produce at most one credit and one source-reference ledger row;',
    '- history/current queries derive ownership only from the authenticated principal and use bounded',
    '  cursor pagination.',
    '',
    'Rewards and privileged/manual adjustments must follow the same wallet boundary in their owning',
    'sprints. Manual adjustments remain internal until the Admin sprint and must record actor,',
    'request/reference, and reason.'
)
$replacement = [string]::Join($newline, $replacementLines)

$updated = $text.Substring(0, $match.Index) + $replacement + $text.Substring($match.Index + $match.Length)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $updated, $utf8NoBom)

Write-Host 'OK: solo docs/SECURITY.md fue actualizado para Sprint 3.'
