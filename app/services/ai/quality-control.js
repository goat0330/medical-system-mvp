export async function runQualityControl(input) {
  const response = await fetch('/api/medical-record-qc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error?.message || `质控未完成（HTTP ${response.status}）。`);
    error.code = payload.error?.code || 'QC_REQUEST_FAILED';
    error.trace = payload.error?.trace || null;
    throw error;
  }
  return payload;
}
