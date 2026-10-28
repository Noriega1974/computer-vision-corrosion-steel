import React, { useEffect, useId, useRef, useState } from 'react';
import { IconoCheck } from './Iconos';
import { passwordRuleResults } from '../lib/passwordPolicy';

// Live checklist of the password policy, shown under a "new password" field.
// Each row: empty ring when pending, filled green circle with a check when met.
// Colors and contrast live in index.css under .pw-check (checked in both themes).
//
// Accessibility: a plain list; every item carries visually hidden text
// "cumplido"/"pendiente" (state never depends on color alone). One polite live
// region announces the summary ONLY when the number of met rules changes, so
// typing a character that changes nothing stays silent.
//
// Give the password input aria-describedby={id} (pass `id`) to tie them.
export default function PasswordChecklist({ password, id }) {
  const autoId = useId();
  const listId = id || autoId;
  const results = passwordRuleResults(password);
  const metCount = results.filter((r) => r.met).length;
  const total = results.length;

  const [announcement, setAnnouncement] = useState('');
  const prevCount = useRef(metCount);
  useEffect(() => {
    if (prevCount.current === metCount) return;
    prevCount.current = metCount;
    setAnnouncement(
      metCount === total
        ? 'Se cumplen todos los requisitos de la contraseña.'
        : `Requisitos de la contraseña cumplidos: ${metCount} de ${total}.`,
    );
  }, [metCount, total]);

  return (
    <div className="pw-check">
      <ul id={listId} className="pw-check__list" aria-label="Requisitos de la contraseña">
        {results.map((r) => (
          <li key={r.id} className={`pw-check__item${r.met ? ' is-met' : ''}`}>
            <span className="pw-check__mark" aria-hidden="true">
              {r.met && <IconoCheck size={12} />}
            </span>
            <span>{r.label}</span>
            <span className="sr-only-pw">{r.met ? ': cumplido' : ': pendiente'}</span>
          </li>
        ))}
      </ul>
      <div className="sr-only-pw" role="status" aria-live="polite">{announcement}</div>
    </div>
  );
}
