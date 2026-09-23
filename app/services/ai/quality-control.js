export async function runQualityControl(input) {
  const response = await fetch('/api/medical-record-qc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `质控未完成（HTTP ${response.status}）。`);
  return payload;
}
