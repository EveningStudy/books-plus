$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Speech
Add-Type -ReferencedAssemblies System.Speech -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Speech.Synthesis;
public class Cue { public double time; public int start; public int length; }
public static class ReaderSpeech {
  static SpeechSynthesizer synth = new SpeechSynthesizer();
  public static List<Cue> Render(string text, string voice, string file, double rate, int pitch) {
    var cues = new List<Cue>();
    if (!String.IsNullOrEmpty(voice)) synth.SelectVoice(voice);
    synth.Rate = Math.Max(-10, Math.Min(10, (int)Math.Round(Math.Log(rate, 2) * 10)));
    synth.Volume = 100;
    EventHandler<SpeakProgressEventArgs> handler = (s, e) => {
      lock(cues) { cues.Add(new Cue { time = e.AudioPosition.TotalMilliseconds / 1000.0, start = e.CharacterPosition, length = e.CharacterCount }); }
    };
    synth.SpeakProgress += handler;
    try { synth.SetOutputToWaveFile(file); synth.Speak(text); }
    finally { synth.SetOutputToNull(); synth.SpeakProgress -= handler; }
    return cues;
  }
}
'@
while ($null -ne ($line = [Console]::ReadLine())) {
  try {
    $request = $line | ConvertFrom-Json
    if ($request.command -eq 'voices') {
      $synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
      $result = @($synth.GetInstalledVoices() | Where-Object Enabled | ForEach-Object { @{ id=$_.VoiceInfo.Name; name=$_.VoiceInfo.Name; lang=$_.VoiceInfo.Culture.Name; engine='native' } })
      $synth.Dispose()
    } else {
      $result = @{ cues=@([ReaderSpeech]::Render($request.text, $request.voice, $request.file, $request.rate, $request.pitch)); timing='word'; pitchSupported=$false }
    }
    [Console]::WriteLine((@{ id=$request.id; result=$result } | ConvertTo-Json -Depth 8 -Compress))
  } catch {
    [Console]::WriteLine((@{ id=$request.id; error=$_.Exception.Message } | ConvertTo-Json -Compress))
  }
}
