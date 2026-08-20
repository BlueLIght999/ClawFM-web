$ErrorActionPreference = 'Continue'
$base = 'http://localhost:3333/api/community'

$a = Invoke-WebRequest -Uri "http://localhost:3333/api/auth/status" -UseBasicParsing | Select-Object -ExpandProperty Content | ConvertFrom-Json
Write-Host "Auth: loggedIn=$($a.loggedIn) uid=$($a.profile.userId) nick=$($a.profile.nickname)"
Start-Sleep -Seconds 2
$uid = "$($a.profile.userId)"

function Req($method, $url, $body) {
  try {
    $params = @{ Uri = $url; Method = $method; UseBasicParsing = $true }
    if ($body) { $params.Body = ($body | ConvertTo-Json -Compress); $params.ContentType = 'application/json' }
    $r = Invoke-WebRequest @params
    return "PASS [$($r.StatusCode)]: $($r.Content)"
  } catch {
    $resp = ''
    if ($_.Exception.Response) { try { $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream()); $resp = $sr.ReadToEnd() } catch {} }
    return "FAIL [$($_.Exception.Message)] body=$resp"
  }
}

Write-Host ""
Write-Host "=== TEST 1: GET feed ==="
Write-Host (Req 'GET' "$base/feed?limit=5")

Write-Host ""
Write-Host "=== TEST 2: POST members ==="
Write-Host (Req 'POST' "$base/members" @{ userId = $uid; nickname = 'tester'; avatarUrl = '' })

Write-Host ""
Write-Host "=== TEST 3: POST posts ==="
$r = Req 'POST' "$base/posts" @{ userId = $uid; type = 'reflection'; content = "test post $(Get-Date -Format 'HH:mm:ss')"; songId = $null }
Write-Host $r
$postId = $null
if ($r -match 'PASS') { try { $postId = ($r -replace '^PASS \[\d+\]: ', '' | ConvertFrom-Json).data.id } catch {} }

if ($postId) {
  Write-Host ""
  Write-Host "=== TEST 4: POST posts/$postId/like ==="
  Write-Host (Req 'POST' "$base/posts/$postId/like" @{ userId = $uid })

  Write-Host ""
  Write-Host "=== TEST 5: GET posts/$postId/like ==="
  Write-Host (Req 'GET' "$base/posts/$postId/like?userId=$uid")

  Write-Host ""
  Write-Host "=== TEST 6: POST posts/$postId/comments ==="
  Write-Host (Req 'POST' "$base/posts/$postId/comments" @{ userId = $uid; content = "test comment" })

  Write-Host ""
  Write-Host "=== TEST 7: GET posts/$postId/comments ==="
  Write-Host (Req 'GET' "$base/posts/$postId/comments")
}

Write-Host ""
Write-Host "=== TEST 8: POST members/999999/follow ==="
Write-Host (Req 'POST' "$base/members/999999/follow" @{ userId = $uid })

Write-Host ""
Write-Host "=== TEST 9: GET feed/following ==="
Write-Host (Req 'GET' "$base/feed/following?limit=5")

Write-Host ""
Write-Host "=== TEST 10: GET clusters ==="
Write-Host (Req 'GET' "$base/clusters")

Write-Host ""
Write-Host "=== TEST 11: GET rooms ==="
Write-Host (Req 'GET' "$base/rooms")

Write-Host ""
Write-Host "=== TEST 12: GET inbox ==="
Write-Host (Req 'GET' "$base/inbox?userId=$uid")
