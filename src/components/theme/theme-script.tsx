/**
 * Pose le thème avant le premier rendu, pour éviter un flash à l'ouverture.
 * Le choix est une commodité propre au navigateur : il vit dans localStorage,
 * et revient au réglage du système quand rien n'est choisi.
 */
const script = `(function(){try{var c=localStorage.getItem('ks-theme');var d=c==='light'||c==='dark'?c:(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.setAttribute('data-theme',d)}catch(e){document.documentElement.setAttribute('data-theme','dark')}})()`

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />
}
