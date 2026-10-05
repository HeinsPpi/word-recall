import { Volume2 } from './Icons'
import { speakEnglish } from '../services/speechService'
export function SpeakButton({ text }: { text: string }) { return <button className="icon-button" onClick={() => speakEnglish(text)} aria-label={`${text}を発音`}><Volume2 aria-hidden="true"/></button> }
