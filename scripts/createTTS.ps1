Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = 0
$synth.Volume = 100
$outputPath = Join-Path (Get-Location) 'assets/welcome.wav'
$synth.SetOutputToWaveFile($outputPath)
$synth.Speak("Welcome to Rounit's Discord. Read the guidelines, check the project showcase, and let's get building.")
$synth.Dispose()
Write-Output "Generated: $outputPath"
