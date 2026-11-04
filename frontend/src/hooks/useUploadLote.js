// Batch upload API used by the pages. The state itself lives in the
// app-wide UploadManagerProvider so a batch keeps running after leaving /upload.
export {
  LOTE_MAX,
  NOMBRE_MAX,
  nombreDesdeArchivo,
  generarLoteId,
  clasificarArchivos,
  sugerirNombreLote,
} from '../lib/gestorSubida';
export { useUploadManager as useUploadLote } from './UploadManagerContext';
