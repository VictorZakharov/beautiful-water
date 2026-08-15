[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string] $BaseSha,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string] $HeadSha
)

$ErrorActionPreference = 'Stop'

function Assert-CommitExists {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Commit
    )

    git cat-file -e "$Commit`^{commit}"
    if ($LASTEXITCODE -ne 0) {
        throw "Commit '$Commit' is unavailable. Ensure checkout uses fetch-depth: 0."
    }
}

Assert-CommitExists -Commit $BaseSha
Assert-CommitExists -Commit $HeadSha

$mergeCommits = @(git rev-list --merges "$BaseSha..$HeadSha" --)
if ($LASTEXITCODE -ne 0) {
    throw "Unable to inspect pull-request history between '$BaseSha' and '$HeadSha'."
}

if ($mergeCommits.Count -gt 0) {
    Write-Host '::error::Pull-request branches must have linear history. Rebase onto main instead of merging main into the branch.'
    Write-Host 'Merge commits introduced by this pull request:'
    $mergeCommits | ForEach-Object { Write-Host "  $_" }
    exit 1
}

Write-Host 'Pull-request history is linear.'
