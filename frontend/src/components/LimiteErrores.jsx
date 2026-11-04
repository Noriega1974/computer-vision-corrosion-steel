import React from 'react';

// Catches render errors inside a page so one broken screen never blanks the whole app:
// the sidebar stays usable and the user gets a way to retry. AppLayout keys it by route,
// so navigating to another page clears the error.
export default class LimiteErrores extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reintentar = this.reintentar.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.pathname !== this.props.pathname) this.reintentar();
  }

  componentDidCatch(error, info) {
    console.error('Error al mostrar la página', error, info?.componentStack);
  }

  reintentar() {
    this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" style={{
        maxWidth: 520, margin: '48px auto', padding: '20px 22px', borderRadius: 12,
        background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)',
        fontFamily: 'var(--font-ui)',
      }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 'var(--text-lg)' }}>No pudimos mostrar esta página</h2>
        <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
          Ocurrió un error inesperado. Tus datos no se perdieron. Intenta de nuevo o vuelve al inicio.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn-accion btn-accion--ok" onClick={this.reintentar}>Reintentar</button>
          <a href="/dashboard" className="btn-accion btn-accion--plain">Ir al inicio</a>
        </div>
      </div>
    );
  }
}
