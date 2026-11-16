import { app } from 'electron';

/** Main-process strings (tray, native dialogs). Spanish source text is the key. */
type Lang = 'es' | 'ca' | 'en';

const en: Record<string, string> = {
  'PlayCue Studio sigue en ejecución': 'PlayCue Studio is still running',
  'La app continúa en segundo plano. Haz clic en el icono para mostrarla o usa "Salir" para cerrarla.':
    'The app keeps running in the background. Click the icon to show it, or use "Quit" to close it.',
  'Mostrar PlayCue Studio': 'Show PlayCue Studio',
  'Abrir carpeta de logs': 'Open logs folder',
  'Salir': 'Quit',
  'Cancelar': 'Cancel',
  'Salir de PlayCue Studio': 'Quit PlayCue Studio',
  '¿Cerrar PlayCue Studio?': 'Close PlayCue Studio?',
  'Se detendrá la reproducción y se cerrarán las pantallas de salida.':
    'Playback will stop and the output screens will be closed.',
  'MOSAICO SPANNED': 'SPANNED MOSAIC',
  'MOSAICO SALIDA 1': 'MOSAIC OUTPUT 1',
  'MOSAICO SALIDA 2': 'MOSAIC OUTPUT 2',
  'No se encontró el paquete del módulo Companion.': 'The Companion module package was not found.',
  'Añadir Archivos de Vídeo al Cue List': 'Add Video Files to the Cue List',
  'Archivos de Vídeo': 'Video Files',
  'Todos los archivos': 'All files',
  'Seleccionar Carpeta con Vídeos': 'Select Folder with Videos',
  'Relinkear archivo': 'Relink file',
  'Vídeo': 'Video',
  'Guardar Proyecto': 'Save Project',
  'Abrir Proyecto': 'Open Project',
  'Adaptador Gráfico': 'Graphics Adapter',
  'AMD AMF (Aceleración GPU)': 'AMD AMF (GPU acceleration)',
  'Renderizado Software': 'Software rendering',
  'GPU Dedicada • Máxima Prioridad': 'Dedicated GPU • Top priority',
  'GPU Integrada • Aceleración Hardware': 'Integrated GPU • Hardware acceleration',
};

const ca: Record<string, string> = {
  'PlayCue Studio sigue en ejecución': 'PlayCue Studio continua en execució',
  'La app continúa en segundo plano. Haz clic en el icono para mostrarla o usa "Salir" para cerrarla.':
    "L'aplicació continua en segon pla. Fes clic a la icona per mostrar-la o usa \"Sortir\" per tancar-la.",
  'Mostrar PlayCue Studio': 'Mostrar PlayCue Studio',
  'Abrir carpeta de logs': 'Obrir la carpeta de logs',
  'Salir': 'Sortir',
  'Cancelar': 'Cancel·lar',
  'Salir de PlayCue Studio': 'Sortir de PlayCue Studio',
  '¿Cerrar PlayCue Studio?': 'Tancar PlayCue Studio?',
  'Se detendrá la reproducción y se cerrarán las pantallas de salida.':
    "S'aturarà la reproducció i es tancaran les pantalles de sortida.",
  'MOSAICO SPANNED': 'MOSAIC SPANNED',
  'MOSAICO SALIDA 1': 'MOSAIC SORTIDA 1',
  'MOSAICO SALIDA 2': 'MOSAIC SORTIDA 2',
  'No se encontró el paquete del módulo Companion.': "No s'ha trobat el paquet del mòdul Companion.",
  'Añadir Archivos de Vídeo al Cue List': 'Afegir fitxers de vídeo al Cue List',
  'Archivos de Vídeo': 'Fitxers de vídeo',
  'Todos los archivos': 'Tots els fitxers',
  'Seleccionar Carpeta con Vídeos': 'Seleccionar carpeta amb vídeos',
  'Relinkear archivo': 'Revincular fitxer',
  'Vídeo': 'Vídeo',
  'Guardar Proyecto': 'Desar projecte',
  'Abrir Proyecto': 'Obrir projecte',
  'Adaptador Gráfico': 'Adaptador gràfic',
  'AMD AMF (Aceleración GPU)': 'AMD AMF (Acceleració GPU)',
  'Renderizado Software': 'Renderitzat per programari',
  'GPU Dedicada • Máxima Prioridad': 'GPU dedicada • Màxima prioritat',
  'GPU Integrada • Aceleración Hardware': 'GPU integrada • Acceleració per maquinari',
};

export function currentLang(): Lang {
  let loc = '';
  try {
    loc = (app.getLocale() || '').toLowerCase();
  } catch {
    // before app is ready
  }
  if (loc.startsWith('ca')) return 'ca';
  if (loc.startsWith('es')) return 'es';
  return 'en';
}

export function trm(key: string): string {
  const l = currentLang();
  if (l === 'es') return key;
  return (l === 'ca' ? ca : en)[key] ?? key;
}
