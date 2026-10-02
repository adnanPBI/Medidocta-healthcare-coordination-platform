export function requireAdminOversight(context) {
  if (context?.permissions?.includes('admin.oversight')) return;
  const error = new Error('Medidocta administrative oversight permission required');
  error.code = 'FORBIDDEN';
  error.statusCode = 403;
  throw error;
}

export function requireAuditRead(context) {
  if (
    context?.permissions?.includes('admin.oversight') &&
    context?.permissions?.includes('audit.read')
  ) return;
  const error = new Error('Medidocta audit permission required');
  error.code = 'FORBIDDEN';
  error.statusCode = 403;
  throw error;
}
