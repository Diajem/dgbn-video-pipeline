param([Parameter(Mandatory=$true)][string]$Out, [Parameter(Mandatory=$true)][string]$TextFile)
# DRAFT-ONLY narration using the built-in Windows voice. Not for publication.
Add-Type -AssemblyName System.Speech
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $speaker.SetOutputToWaveFile($Out)
  $speaker.Speak([IO.File]::ReadAllText($TextFile))
} finally {
  $speaker.Dispose()
}
