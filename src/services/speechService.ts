export function speakEnglish(text: string): boolean {
  if (!('speechSynthesis' in window) || !text) return false
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'en-US'; utterance.rate = 0.85
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('en'))
  if (voice) utterance.voice = voice
  window.speechSynthesis.speak(utterance)
  return true
}
