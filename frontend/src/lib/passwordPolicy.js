// Single source of truth for the password rules shown and enforced in the UI.
// Mirrors the REAL policy:
//   - Cognito user pool: infra/pf_corrosion_infra/stacks/auth_stack.py
//     (min 8, lowercase, uppercase, digits; symbols NOT required)
//   - Backend: _validar_password in api_usuarios/handler.py
// If the policy changes there, change it here only.

export const PASSWORD_RULES = [
  { id: 'length', label: 'Mínimo 8 caracteres', test: (pw) => pw.length >= 8 },
  { id: 'upper', label: 'Una mayúscula', test: (pw) => /[A-Z]/.test(pw) },
  { id: 'lower', label: 'Una minúscula', test: (pw) => /[a-z]/.test(pw) },
  { id: 'digit', label: 'Un número', test: (pw) => /[0-9]/.test(pw) },
];

export function passwordRuleResults(pw = '') {
  return PASSWORD_RULES.map((r) => ({ id: r.id, label: r.label, met: r.test(pw) }));
}

export function isPasswordValid(pw = '') {
  return PASSWORD_RULES.every((r) => r.test(pw));
}
