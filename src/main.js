import './style.css';
import { WAIVER_TEXT } from './waiver-text.js';
import { createSignaturePad } from './signature-pad.js';
import { getWaivers, saveWaiver, clearWaivers, exportWaiversAsJSON } from './storage.js';
import { checkPin, setPin } from './admin-auth.js';
import { generateWaiverPdf, waiverPdfFilename } from './pdf.js';
import { MONTHS, DAYS, dobYears, calculateAge, MIN_AGE, US_STATES, EMERGENCY_RELATIONS } from './form-options.js';
import { sendWaiverNotification } from './email.js';

const PIN_LENGTH = 4;

const app = document.getElementById('app');

function renderForm() {
  app.innerHTML = `
    <div class="kiosk">
      <header class="header">
        <h1 id="admin-trigger">The Jones Gym</h1>
        <p class="subtitle">Liability Waiver</p>
      </header>

      <form id="waiver-form" class="waiver-form">
        <div class="field-row">
          <label>
            Full Name
            <input type="text" name="fullName" required autocomplete="off" />
          </label>
          <label class="dob-label">
            Date of Birth
            <div class="dob-row">
              <select name="dobMonth" required>
                <option value="" disabled selected>Month</option>
                ${MONTHS.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}
              </select>
              <select name="dobDay" required>
                <option value="" disabled selected>Day</option>
                ${DAYS.map((day) => `<option value="${day}">${Number(day)}</option>`).join('')}
              </select>
              <select name="dobYear" required>
                <option value="" disabled selected>Year</option>
                ${dobYears()
                  .map((year) => `<option value="${year}">${year}</option>`)
                  .join('')}
              </select>
            </div>
          </label>
        </div>
        <div class="field-row" id="guardian-row" hidden>
          <label>
            Parent/Guardian Full Name
            <input type="text" name="guardianName" autocomplete="off" />
          </label>
        </div>
        <div class="field-row">
          <label>
            Phone
            <input type="tel" name="phone" required autocomplete="off" />
          </label>
          <label>
            Address
            <input type="text" name="address" required autocomplete="off" />
          </label>
        </div>
        <div class="field-row">
          <label>
            City
            <input type="text" name="city" required autocomplete="off" />
          </label>
          <label class="field-narrow">
            State
            <select name="state" required>
              <option value="" disabled selected>State</option>
              ${US_STATES.map((state) => `<option value="${state}">${state}</option>`).join('')}
            </select>
          </label>
          <label class="field-narrow">
            Zip
            <input type="text" name="zip" required autocomplete="off" inputmode="numeric" />
          </label>
        </div>
        <div class="field-row">
          <label>
            Emergency Contact Name
            <input type="text" name="emergencyName" required autocomplete="off" />
          </label>
          <label>
            Emergency Contact Phone
            <input type="tel" name="emergencyPhone" required autocomplete="off" />
          </label>
        </div>
        <div class="field-row">
          <label>
            Relation to Emergency Contact
            <select name="emergencyRelation" required>
              <option value="" disabled selected>Select relation</option>
              ${EMERGENCY_RELATIONS.map((rel) => `<option value="${rel}">${rel}</option>`).join('')}
            </select>
          </label>
        </div>

        <div class="waiver-text" tabindex="0">${WAIVER_TEXT.replace(/\n/g, '<br />')}</div>

        <label class="agree-row">
          <input type="checkbox" name="agree" required />
          I have read and agree to the terms above
        </label>

        <div class="signature-block">
          <p class="signature-label">Sign Below</p>
          <canvas id="signature-canvas" class="signature-canvas"></canvas>
          <button type="button" id="clear-signature" class="btn btn-secondary">Clear Signature</button>
        </div>

        <div class="actions">
          <button type="submit" class="btn btn-primary">Submit Waiver</button>
        </div>
        <p id="error-msg" class="error-msg"></p>
      </form>
    </div>
  `;

  const canvas = document.getElementById('signature-canvas');
  const pad = createSignaturePad(canvas);

  document.getElementById('clear-signature').addEventListener('click', () => pad.clear());

  const form = document.getElementById('waiver-form');
  const errorMsg = document.getElementById('error-msg');
  const guardianRow = document.getElementById('guardian-row');
  const guardianInput = form.elements.guardianName;
  const signatureLabel = document.querySelector('.signature-label');

  const getDobAge = () => {
    const { dobMonth, dobDay, dobYear } = form.elements;
    if (!dobMonth.value || !dobDay.value || !dobYear.value) return null;
    return calculateAge(Number(dobYear.value), Number(dobMonth.value), Number(dobDay.value));
  };

  const updateMinorState = () => {
    const age = getDobAge();
    const isMinor = age !== null && age < MIN_AGE;
    guardianRow.hidden = !isMinor;
    guardianInput.required = isMinor;
    signatureLabel.textContent = isMinor ? 'Parent/Guardian Sign Below' : 'Sign Below';
  };
  [form.elements.dobMonth, form.elements.dobDay, form.elements.dobYear].forEach((el) =>
    el.addEventListener('change', updateMinorState)
  );

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (pad.isEmpty()) {
      errorMsg.textContent = 'Please sign the waiver before submitting.';
      return;
    }

    const data = new FormData(form);
    const dobMonth = data.get('dobMonth');
    const dobDay = data.get('dobDay');
    const dobYear = data.get('dobYear');
    const age = calculateAge(Number(dobYear), Number(dobMonth), Number(dobDay));
    const isMinor = age < MIN_AGE;
    const guardianName = data.get('guardianName')?.trim();
    if (isMinor && !guardianName) {
      errorMsg.textContent = 'Parent or guardian name is required for participants under 18.';
      return;
    }
    errorMsg.textContent = '';

    const waiver = {
      fullName: data.get('fullName'),
      dob: `${dobYear}-${dobMonth}-${dobDay}`,
      guardianName: isMinor ? guardianName : '',
      phone: data.get('phone'),
      address: data.get('address'),
      city: data.get('city'),
      state: data.get('state'),
      zip: data.get('zip'),
      emergencyName: data.get('emergencyName'),
      emergencyPhone: data.get('emergencyPhone'),
      emergencyRelation: data.get('emergencyRelation'),
      signatureDataUrl: pad.toDataURL(),
    };
    saveWaiver(waiver);
    generateWaiverPdf(waiver).save(waiverPdfFilename(waiver));
    sendWaiverNotification(waiver).catch((err) => console.error('Waiver email notification failed:', err));

    renderThankYou(data.get('fullName'));
  });

  setupAdminTrigger();
}

function renderThankYou(name) {
  app.innerHTML = `
    <div class="kiosk thank-you">
      <h1>Thanks, ${escapeHtml(name)}!</h1>
      <p>Your waiver has been submitted. Enjoy your workout at The Jones Gym.</p>
    </div>
  `;
  setTimeout(renderForm, 4000);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

let pressTimer;
function setupAdminTrigger() {
  const trigger = document.getElementById('admin-trigger');
  const start = () => {
    pressTimer = setTimeout(() => renderAdminUnlock(), 1500);
  };
  const cancel = () => clearTimeout(pressTimer);
  trigger.addEventListener('pointerdown', start);
  trigger.addEventListener('pointerup', cancel);
  trigger.addEventListener('pointerleave', cancel);
}

function renderPinScreen({ title, subtitle, errorText, onSubmit, onCancel }) {
  app.innerHTML = `
    <div class="kiosk pin-screen">
      <header class="header">
        <h1>${title}</h1>
        <p class="subtitle">${subtitle}</p>
      </header>
      <div class="pin-dots" id="pin-dots">
        ${'<span class="pin-dot"></span>'.repeat(PIN_LENGTH)}
      </div>
      <p class="error-msg">${errorText || ''}</p>
      <div class="keypad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9]
          .map((n) => `<button type="button" class="keypad-btn" data-digit="${n}">${n}</button>`)
          .join('')}
        <div></div>
        <button type="button" class="keypad-btn" data-digit="0">0</button>
        <button type="button" class="keypad-btn" id="pin-backspace">&larr;</button>
      </div>
      <button type="button" id="pin-cancel" class="btn btn-secondary">Cancel</button>
    </div>
  `;

  let entered = '';
  const dots = document.querySelectorAll('#pin-dots .pin-dot');
  const updateDots = () => dots.forEach((dot, i) => dot.classList.toggle('filled', i < entered.length));

  document.querySelectorAll('.keypad-btn[data-digit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (entered.length >= PIN_LENGTH) return;
      entered += btn.dataset.digit;
      updateDots();
      if (entered.length === PIN_LENGTH) onSubmit(entered);
    });
  });

  document.getElementById('pin-backspace').addEventListener('click', () => {
    entered = entered.slice(0, -1);
    updateDots();
  });

  document.getElementById('pin-cancel').addEventListener('click', onCancel);
}

function renderAdminUnlock(showError = false) {
  renderPinScreen({
    title: 'Admin Access',
    subtitle: 'Enter PIN',
    errorText: showError ? 'Incorrect PIN' : '',
    onSubmit: (pin) => (checkPin(pin) ? renderAdmin() : renderAdminUnlock(true)),
    onCancel: renderForm,
  });
}

function renderChangePinCurrent(showError = false) {
  renderPinScreen({
    title: 'Change PIN',
    subtitle: 'Enter current PIN',
    errorText: showError ? 'Incorrect PIN' : '',
    onSubmit: (pin) => (checkPin(pin) ? renderChangePinNew() : renderChangePinCurrent(true)),
    onCancel: renderAdmin,
  });
}

function renderChangePinNew() {
  renderPinScreen({
    title: 'Change PIN',
    subtitle: 'Enter new PIN',
    onSubmit: (pin) => renderChangePinConfirm(pin),
    onCancel: renderAdmin,
  });
}

function renderChangePinConfirm(newPin, showError = false) {
  renderPinScreen({
    title: 'Change PIN',
    subtitle: 'Confirm new PIN',
    errorText: showError ? "PINs didn't match" : '',
    onSubmit: (pin) => {
      if (pin === newPin) {
        setPin(newPin);
        renderAdmin();
      } else {
        renderChangePinConfirm(newPin, true);
      }
    },
    onCancel: renderAdmin,
  });
}

function renderAdmin() {
  const waivers = getWaivers().slice().reverse();
  app.innerHTML = `
    <div class="kiosk admin">
      <header class="header">
        <h1>Admin</h1>
        <p class="subtitle">${waivers.length} waiver(s) on this device</p>
      </header>
      <div class="admin-actions">
        <button id="export-btn" class="btn btn-primary">Export as JSON</button>
        <button id="change-pin-btn" class="btn btn-secondary">Change PIN</button>
        <button id="clear-btn" class="btn btn-danger">Clear All Waivers</button>
        <button id="back-btn" class="btn btn-secondary">Back to Form</button>
      </div>
      <ul class="waiver-list">
        ${waivers
          .map(
            (w) => `
          <li class="waiver-item">
            <div>
              <strong>${escapeHtml(w.fullName)}</strong>
              ${w.guardianName ? `<span class="waiver-meta">Guardian: ${escapeHtml(w.guardianName)}</span>` : ''}
              <span class="waiver-meta">${new Date(w.timestamp).toLocaleString()}</span>
            </div>
            <img src="${w.signatureDataUrl}" alt="signature" class="waiver-sig-thumb" />
            <button type="button" class="btn btn-secondary pdf-btn" data-waiver-id="${w.id}">PDF</button>
          </li>`
          )
          .join('')}
      </ul>
    </div>
  `;

  document.getElementById('export-btn').addEventListener('click', exportWaiversAsJSON);
  document.getElementById('change-pin-btn').addEventListener('click', () => renderChangePinCurrent());
  document.getElementById('back-btn').addEventListener('click', renderForm);
  document.getElementById('clear-btn').addEventListener('click', () => {
    if (confirm('Delete all stored waivers from this device? This cannot be undone.')) {
      clearWaivers();
      renderAdmin();
    }
  });
  document.querySelectorAll('.pdf-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const waiver = waivers.find((w) => w.id === btn.dataset.waiverId);
      if (waiver) generateWaiverPdf(waiver).save(waiverPdfFilename(waiver));
    });
  });
}

renderForm();
