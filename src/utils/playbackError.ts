import { VideoCue } from '../types/cue';
import { tr } from '../i18n';

export interface MediaFileCheck {
  state: 'ok' | 'missing' | 'noaccess' | 'empty' | 'notfile' | 'error';
  size?: number;
  code?: string;
}

/**
 * Builds a precise, human-readable explanation of why a clip could not be played.
 * Format: first line = short headline (shown in the Cue List badge), remaining lines = details.
 */
export function describePlaybackError(
  cue: VideoCue | undefined,
  mediaError: { code?: number; message?: string } | null | undefined,
  check: MediaFileCheck | null,
  playedPath: string
): string {
  const path = playedPath || cue?.filePath || '?';
  const isProxy = !!cue?.proxyPath && playedPath === cue.proxyPath;
  const tech = mediaError?.message ? mediaError.message : '';
  const vc = cue?.videoCodec || '?';
  const ac = cue?.audioChannels ? cue.audioCodec || '?' : tr('sin audio');
  const container = cue?.container || '?';

  if (check) {
    if (check.state === 'missing') {
      return isProxy
        ? `${tr('VERSIÓN CONVERTIDA NO ENCONTRADA')}\n${tr('Falta el archivo {path}. Vuelve a convertir el vídeo.', { path })}`
        : `${tr('ARCHIVO NO ENCONTRADO')}\n${tr('No existe: {path}. Se ha movido, renombrado o borrado, o la unidad o la red está desconectada. Usa «Cambiar / Relinkear archivo».', { path })}`;
    }
    if (check.state === 'noaccess') {
      return `${tr('SIN PERMISO PARA LEER EL ARCHIVO')}\n${tr('El sistema no permite leer {path}. Puede estar bloqueado por otro programa o no tener permisos.', { path })}`;
    }
    if (check.state === 'empty') {
      return `${tr('ARCHIVO VACÍO')}\n${tr('El archivo {path} ocupa 0 bytes (copia incompleta o corrupta).', { path })}`;
    }
    if (check.state === 'notfile' || check.state === 'error') {
      return `${tr('NO SE PUEDE ACCEDER AL ARCHIVO')}\n${path}${check.code ? ` (${check.code})` : ''}`;
    }
  }

  const detail = tech ? ` ${tr('Detalle técnico: {tech}', { tech })}` : '';
  switch (mediaError?.code) {
    case 1:
      return `${tr('CARGA INTERRUMPIDA')}\n${tr('La carga del vídeo se canceló antes de terminar.')}${detail}`;
    case 2:
      return `${tr('ERROR DE LECTURA DEL ARCHIVO')}\n${tr('No se pudo leer {path} hasta el final (disco o red inestable, o archivo en uso por otro programa).', { path })}${detail}`;
    case 3:
      return `${tr('ARCHIVO DAÑADO O NO DECODIFICABLE')}\n${tr('El vídeo ({vc}, audio {ac}, {container}) está dañado o falla al decodificarlo.', { vc, ac, container })}${detail}`;
    case 4:
      return `${tr('FORMATO NO COMPATIBLE')}\n${tr('El reproductor no admite este archivo (vídeo {vc}, audio {ac}, contenedor {container}). Conviértelo a H.264 con el botón «Convertir».', { vc, ac, container })}${detail}`;
    default:
      return `${tr('ERROR DE REPRODUCCIÓN')}\n${tr('Código {code}.', { code: mediaError?.code ?? 0 })}${detail}`;
  }
}

/** Splits a message built by describePlaybackError into headline + details. */
export function splitPlaybackError(msg: string): { headline: string; detail: string } {
  const i = msg.indexOf('\n');
  return i < 0 ? { headline: msg, detail: '' } : { headline: msg.slice(0, i), detail: msg.slice(i + 1) };
}
