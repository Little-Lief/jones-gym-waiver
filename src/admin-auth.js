const PIN_KEY = 'jonesgym_admin_pin';
const DEFAULT_PIN = '1234';

export function getPin() {
  return localStorage.getItem(PIN_KEY) || DEFAULT_PIN;
}

export function setPin(pin) {
  localStorage.setItem(PIN_KEY, pin);
}

export function checkPin(pin) {
  return pin === getPin();
}
