const STORAGE_KEY = 'jonesgym_waivers';

export function getWaivers() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

export function saveWaiver(waiver) {
  const waivers = getWaivers();
  waivers.push({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), ...waiver });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(waivers));
}

export function clearWaivers() {
  localStorage.removeItem(STORAGE_KEY);
}

export function exportWaiversAsJSON() {
  const data = JSON.stringify(getWaivers(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jonesgym-waivers-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
