import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  build: {
    // Sin esto todo sale en un unico archivo de ~960 KB: quien entra a ver
    // su perfil se descarga igual el mapa, los graficos y el SDK de Cognito.
    // Cada grupo se separa por como se usa, no por tamano.
    rollupOptions: {
      output: {
        manualChunks: {
          // Se necesita en el primer render de cualquier ruta.
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // Solo el dashboard y el detalle de punto montan el mapa.
          'maps': ['leaflet', 'react-leaflet'],
          // Solo el dashboard dibuja graficos.
          'charts': ['recharts'],
          // Solo el login y el arranque de sesion tocan Cognito.
          'auth': ['aws-amplify'],
          // Solo la subida de mediciones lee EXIF.
          'exif': ['exifr'],
        },
      },
    },
    // Ya no hay un bundle unico gigante, asi que el aviso vuelve a ser util
    // en vez de dispararse siempre.
    chunkSizeWarningLimit: 400,
  },
})
