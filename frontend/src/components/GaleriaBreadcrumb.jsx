import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

// Migas de la galería: "Galería › Empresa › Punto". Cada tramo con `to` es un
// enlace; el último (página actual) es solo texto.
export default function GaleriaBreadcrumb({ tramos }) {
  return (
    <nav aria-label="Ruta de la galería" style={{
      display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4,
      marginBottom: 10, fontFamily: 'var(--font-ui)', fontSize: 'var(--text-xs)',
    }}>
      {tramos.map((t, i) => {
        const esUltimo = i === tramos.length - 1;
        return (
          <React.Fragment key={`${i}-${t.label}`}>
            {i > 0 && <ChevronRight size={13} aria-hidden="true" style={{ color: 'var(--text-faint)', flexShrink: 0 }} />}
            {t.to && !esUltimo ? (
              <Link to={t.to} style={{ color: 'var(--text-muted)', textDecoration: 'none', fontWeight: 500 }}>
                {t.label}
              </Link>
            ) : (
              <span aria-current={esUltimo ? 'page' : undefined} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {t.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
