import React, { useState } from 'react';
import {
  Settings,
  Bell,
  SlidersHorizontal,
  Monitor,
  RefreshCw,
  CalendarDays,
  ShieldCheck,
  Brain,
  Activity,
  Save,
  Check,
} from 'lucide-react';


// ─── Estilos reutilizables ───────────────────────────────────────────────────

const sectionStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  overflow: 'hidden',
  marginBottom: 18,
};

const sectionHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '14px 18px',
  borderBottom: '1px solid var(--border)',
};

const labelStyle = {
  fontFamily: 'var(--font-data)',
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: 'var(--text-faint)',
  marginBottom: 5,
};

const descriptionStyle = {
  fontFamily: 'var(--font-ui)',
  fontSize: 11,
  color: 'var(--text-muted)',
  lineHeight: 1.5,
};


// ─── Switch ──────────────────────────────────────────────────────────────────

function Switch({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      style={{
        width: 38,
        height: 21,
        padding: 2,
        border: 'none',
        borderRadius: 20,
        cursor: 'pointer',
        background: checked
          ? 'var(--accent-blue)'
          : 'var(--border-bright)',
        position: 'relative',
        transition: 'background 0.15s ease',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 19 : 2,
          width: 17,
          height: 17,
          borderRadius: '50%',
          background: 'white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'left 0.15s ease',
        }}
      />
    </button>
  );
}


// ─── Fila de configuración ──────────────────────────────────────────────────

function SettingRow({ title, description, children, last = false }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 20,
        padding: '14px 18px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-ui)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: 3,
          }}
        >
          {title}
        </div>

        {description && (
          <div style={descriptionStyle}>
            {description}
          </div>
        )}
      </div>

      <div style={{ flexShrink: 0 }}>
        {children}
      </div>
    </div>
  );
}


// ─── Encabezado de sección ───────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, description }) {
  return (
    <div style={sectionHeaderStyle}>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: 'rgba(20,50,163,0.08)',
          border: '1px solid rgba(20,50,163,0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent-blue)',
          flexShrink: 0,
        }}
      >
        <Icon size={16} strokeWidth={1.8} />
      </div>

      <div>
        <div
          style={{
            fontFamily: 'var(--font-ui)',
            fontWeight: 700,
            fontSize: 13,
            color: 'var(--text-primary)',
          }}
        >
          {title}
        </div>

        {description && (
          <div
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: 10,
              color: 'var(--text-muted)',
              marginTop: 2,
            }}
          >
            {description}
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Página de configuración ─────────────────────────────────────────────────

export default function ConfiguracionPage() {
  const [darkMode, setDarkMode] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [severeAlerts, setSevereAlerts] = useState(true);
  const [measurementSummary, setMeasurementSummary] = useState(false);

  const [dateFormat, setDateFormat] = useState('DD/MM/AAAA');

  const [thresholds, setThresholds] = useState({
    leve: 20,
    moderada: 50,
    severa: 50,
  });

  const [saved, setSaved] = useState(false);

  const handleThresholdChange = (field, value) => {
    setThresholds(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = () => {
    setSaved(true);

    setTimeout(() => {
      setSaved(false);
    }, 2500);
  };

  return (
    <>
      <style>{`
        .config-select,
        .config-input {
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }

        .config-select:focus,
        .config-input:focus {
          border-color: var(--accent-blue) !important;
          box-shadow: 0 0 0 2px rgba(20,50,163,0.08);
        }
      `}</style>

      <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>

        {/* ── Encabezado ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 22,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 5,
              }}
            >
              <span
                style={{
                  background: 'var(--accent-amber)',
                  width: 3,
                  height: 20,
                  borderRadius: 2,
                  display: 'inline-block',
                }}
              />

              <span
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--text-primary)',
                }}
              >
                Configuración
              </span>
            </div>

            <div
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: 12,
                color: 'var(--text-muted)',
                paddingLeft: 13,
              }}
            >
              Personaliza las preferencias y parámetros del sistema.
            </div>
          </div>

          <button
            onClick={handleSave}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '8px 15px',
              background: saved
                ? 'var(--accent-green)'
                : 'var(--accent-blue)',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
              fontWeight: 600,
              fontSize: 12,
              color: 'white',
              transition: 'background 0.15s ease',
            }}
          >
            {saved ? (
              <>
                <Check size={14} />
                Cambios guardados
              </>
            ) : (
              <>
                <Save size={14} />
                Guardar cambios
              </>
            )}
          </button>
        </div>


        {/* ── Preferencias del sistema ── */}

        <div style={sectionStyle}>
          <SectionHeader
            icon={Settings}
            title="Preferencias del sistema"
            description="Configura el comportamiento general de la plataforma."
          />

          <SettingRow
            title="Modo de visualización"
            description="Selecciona cómo deseas visualizar la plataforma."
          >
            <select
              className="config-select"
              value={darkMode ? 'oscuro' : 'claro'}
              onChange={e => setDarkMode(e.target.value === 'oscuro')}
              style={{
                padding: '7px 30px 7px 10px',
                borderRadius: 7,
                border: '1px solid var(--border)',
                background: 'var(--bg-page)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-ui)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <option value="claro">Claro</option>
              <option value="oscuro">Oscuro</option>
            </select>
          </SettingRow>

          <SettingRow
            title="Actualización automática"
            description="Actualizar periódicamente la información mostrada en el sistema."
          >
            <Switch
              checked={autoRefresh}
              onChange={setAutoRefresh}
            />
          </SettingRow>

          <SettingRow
            title="Formato de fecha"
            description="Formato utilizado para mostrar las fechas de mediciones y registros."
            last
          >
            <select
              className="config-select"
              value={dateFormat}
              onChange={e => setDateFormat(e.target.value)}
              style={{
                padding: '7px 30px 7px 10px',
                borderRadius: 7,
                border: '1px solid var(--border)',
                background: 'var(--bg-page)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-ui)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <option value="DD/MM/AAAA">DD/MM/AAAA</option>
              <option value="MM/DD/AAAA">MM/DD/AAAA</option>
              <option value="AAAA-MM-DD">AAAA-MM-DD</option>
            </select>
          </SettingRow>
        </div>


        {/* ── Notificaciones ── */}

        <div style={sectionStyle}>
          <SectionHeader
            icon={Bell}
            title="Notificaciones"
            description="Controla las notificaciones relacionadas con las mediciones."
          />

          <SettingRow
            title="Notificaciones de nuevas mediciones"
            description="Recibir avisos cuando se registre una nueva medición."
          >
            <Switch
              checked={notifications}
              onChange={setNotifications}
            />
          </SettingRow>

          <SettingRow
            title="Alertas de corrosión severa"
            description="Mostrar una alerta cuando una medición sea clasificada como severa."
          >
            <Switch
              checked={severeAlerts}
              onChange={setSevereAlerts}
            />
          </SettingRow>

          <SettingRow
            title="Resumen de mediciones"
            description="Recibir un resumen periódico del comportamiento de las mediciones."
            last
          >
            <Switch
              checked={measurementSummary}
              onChange={setMeasurementSummary}
            />
          </SettingRow>
        </div>


        {/* ── Parámetros de análisis ── */}

        <div style={sectionStyle}>
          <SectionHeader
            icon={SlidersHorizontal}
            title="Parámetros de análisis"
            description="Valores utilizados como referencia para clasificar el nivel de corrosión."
          />

          <div style={{ padding: 18 }}>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 14,
              }}
            >

              {/* Leve */}
              <div>
                <label style={labelStyle}>
                  Corrosión leve
                </label>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                  }}
                >
                  <input
                    className="config-input"
                    type="number"
                    min="0"
                    max="100"
                    value={thresholds.leve}
                    onChange={e =>
                      handleThresholdChange(
                        'leve',
                        Number(e.target.value)
                      )
                    }
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 7,
                      border: '1px solid var(--border)',
                      background: 'var(--bg-page)',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-data)',
                      fontSize: 12,
                      boxSizing: 'border-box',
                    }}
                  />

                  <span
                    style={{
                      fontFamily: 'var(--font-data)',
                      fontSize: 12,
                      color: 'var(--text-muted)',
                    }}
                  >
                    %
                  </span>
                </div>

                <div style={{ ...descriptionStyle, marginTop: 5 }}>
                  Hasta este porcentaje de área afectada.
                </div>
              </div>


              {/* Moderada */}
              <div>
                <label style={labelStyle}>
                  Corrosión moderada
                </label>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                  }}
                >
                  <input
                    className="config-input"
                    type="number"
                    min="0"
                    max="100"
                    value={thresholds.moderada}
                    onChange={e =>
                      handleThresholdChange(
                        'moderada',
                        Number(e.target.value)
                      )
                    }
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 7,
                      border: '1px solid var(--border)',
                      background: 'var(--bg-page)',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-data)',
                      fontSize: 12,
                      boxSizing: 'border-box',
                    }}
                  />

                  <span
                    style={{
                      fontFamily: 'var(--font-data)',
                      fontSize: 12,
                      color: 'var(--text-muted)',
                    }}
                  >
                    %
                  </span>
                </div>

                <div style={{ ...descriptionStyle, marginTop: 5 }}>
                  Límite superior para la clasificación moderada.
                </div>
              </div>


              {/* Severa */}
              <div>
                <label style={labelStyle}>
                  Corrosión severa
                </label>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                  }}
                >
                  <input
                    className="config-input"
                    type="number"
                    min="0"
                    max="100"
                    value={thresholds.severa}
                    onChange={e =>
                      handleThresholdChange(
                        'severa',
                        Number(e.target.value)
                      )
                    }
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 7,
                      border: '1px solid var(--border)',
                      background: 'var(--bg-page)',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-data)',
                      fontSize: 12,
                      boxSizing: 'border-box',
                    }}
                  />

                  <span
                    style={{
                      fontFamily: 'var(--font-data)',
                      fontSize: 12,
                      color: 'var(--text-muted)',
                    }}
                  >
                    %
                  </span>
                </div>

                <div style={{ ...descriptionStyle, marginTop: 5 }}>
                  A partir de este porcentaje se considera severa.
                </div>
              </div>

            </div>

            {/* Nota */}
            <div
              style={{
                marginTop: 16,
                padding: '10px 12px',
                background: 'rgba(20,50,163,0.05)',
                border: '1px solid rgba(20,50,163,0.12)',
                borderRadius: 7,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
              }}
            >
              <Activity
                size={14}
                style={{
                  color: 'var(--accent-blue)',
                  marginTop: 1,
                  flexShrink: 0,
                }}
              />

              <div
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: 11,
                  lineHeight: 1.5,
                  color: 'var(--text-muted)',
                }}
              >
                Estos valores permiten establecer los rangos de referencia
                utilizados para interpretar el porcentaje de área corroída.
              </div>
            </div>

          </div>
        </div>


        {/* ── Información del sistema ── */}

        <div style={sectionStyle}>
          <SectionHeader
            icon={ShieldCheck}
            title="Información del sistema"
            description="Información general de la plataforma y del modelo de análisis."
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
            }}
          >

            <div
              style={{
                padding: '15px 18px',
                borderRight: '1px solid var(--border)',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div style={labelStyle}>Estado del sistema</div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  fontFamily: 'var(--font-ui)',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: 'var(--accent-green)',
                    display: 'inline-block',
                  }}
                />
                Operativo
              </div>
            </div>


            <div
              style={{
                padding: '15px 18px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div style={labelStyle}>Versión</div>

              <div
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 13,
                  color: 'var(--text-primary)',
                }}
              >
                v1.0.0
              </div>
            </div>


            <div
              style={{
                padding: '15px 18px',
                borderRight: '1px solid var(--border)',
              }}
            >
              <div style={labelStyle}>Modelo de IA</div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  fontFamily: 'var(--font-ui)',
                  fontSize: 13,
                  color: 'var(--text-primary)',
                }}
              >
                <Brain
                  size={14}
                  color="var(--accent-blue)"
                />
                Producción_v2
              </div>
            </div>


            <div
              style={{
                padding: '15px 18px',
              }}
            >
              <div style={labelStyle}>Actualización de datos</div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  fontFamily: 'var(--font-ui)',
                  fontSize: 13,
                  color: 'var(--text-primary)',
                }}
              >
                <RefreshCw
                  size={14}
                  color="var(--accent-blue)"
                />
                Automática
              </div>
            </div>

          </div>
        </div>

      </div>
    </>
  );
}