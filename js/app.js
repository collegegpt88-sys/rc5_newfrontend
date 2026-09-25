// ─────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────
const API = "https://rc5-newbackend.onrender.com";
const BOOKING_WINDOW = 30; // days from today

// ─────────────────────────────────────────────
//  SLOT DEFINITIONS  (07:00 AM – 08:00 AM format)
// ─────────────────────────────────────────────
function fmt12(h) {
  const p  = h >= 12 ? 'PM' : 'AM';
  let hr   = h % 12; if (hr === 0) hr = 12;
  return String(hr).padStart(2, '0') + ':00 ' + p;
}

const ALL_SLOTS = [];
for (let h = 7; h < 21; h++)
  ALL_SLOTS.push(fmt12(h) + ' \u2013 ' + fmt12(h + 1));

// slot label → 24h start hour
function slotTo24h(slot) {
  const part = slot.split(' \u2013 ')[0].trim();          // "07:00 AM"
  const [hStr, ampm] = [part.slice(0,2), part.slice(6)];
  let h = parseInt(hStr);
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h;
}

// ─────────────────────────────────────────────
//  DATE HELPERS
// ─────────────────────────────────────────────
function toIso(ds) {                        // "dd/mm/yyyy" → "yyyy-mm-dd"
  const [d, m, y] = ds.split('/');
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}
function toDisplay(ds) {                    // "dd/mm/yyyy" → "02 Aug 2026"
  const [d, m, y] = ds.split('/');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`;
}
function toDateStr(date) {                  // Date → "dd/mm/yyyy"
  return String(date.getDate()).padStart(2,'0') + '/' +
         String(date.getMonth()+1).padStart(2,'0') + '/' +
         date.getFullYear();
}

function isoToDisplay(iso) {
  const [y, m, d] = iso.split('-');
  const months = [
    'Jan','Feb','Mar','Apr','May','Jun',
    'Jul','Aug','Sep','Oct','Nov','Dec'
  ];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

// ─────────────────────────────────────────────
//  MOBILE INPUT — numeric only
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  ['bMobile','cMobile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', function() {
      this.value = this.value.replace(/\D/g,'').slice(0,10);
    });
  });
  loadWorkshopDates();
});

async function loadWorkshopDates() {
  try {
    const res  = await fetch(`${API}/api/workshop-dates`);
    const data = await res.json();
    // Update hero date display
    const heroDate = document.getElementById('heroWorkshopDate');
    if (heroDate) heroDate.textContent = data.display;
  } catch (e) {
    console.warn('Could not load workshop dates:', e.message);
  }
}

// ═════════════════════════════════════════════
//  BOOKING MODAL STATE
// ═════════════════════════════════════════════
let bCalYear, bCalMonth;
let bSelectedDate  = null;
let bSelectedSlot  = null;
let bSlotCounts    = {};   // slot label → count of active bookings
let bReservation   = null;

// ── Open / Close ──────────────────────────────
function openBooking() {
  resetBookingModal();
  document.getElementById('bookingOverlay').classList.add('open');
}
function closeBooking() {
  document.getElementById('bookingOverlay').classList.remove('open');
}
document.getElementById('bookingOverlay').addEventListener('click', function(e) {
  if (e.target === this) closeBooking();
});
document.querySelector('#bookingOverlay .modal-box').addEventListener('click', e => e.stopPropagation());

function resetBookingModal() {
  showBStep(1);
  ['bName','bAge'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('bMobile').value    = '';
  document.getElementById('bGender').value    = '';
  document.getElementById('bTreatment').value = '';
  ['bErrName','bErrMobile','bErrAge','bErrGender','bErrTreatment','bErrDate','bErrSlot']
    .forEach(id => document.getElementById(id).style.display = 'none');
  bSelectedDate = null;
  bSelectedSlot = null;
  bSlotCounts   = {};
  bReservation  = null;
  document.getElementById('bSlotGrid').innerHTML = '';
  const btn = document.getElementById('bBookBtn');
  btn.textContent = 'BOOK APPOINTMENT \u2192';
  btn.disabled = false;
  initBCalendar();
}

function showBStep(n) {
  [1,2,3].forEach(i =>
    document.getElementById('bStep'+i).style.display = i===n ? 'block' : 'none'
  );
}

// ── Calendar ──────────────────────────────────
function initBCalendar() {
  const t  = new Date();
  bCalYear  = t.getFullYear();
  bCalMonth = t.getMonth();
  renderBCalendar();
}

function renderBCalendar() {
  const today   = new Date(); today.setHours(0,0,0,0);
  const maxDate = new Date(today); maxDate.setDate(today.getDate() + BOOKING_WINDOW);
  const firstDay    = new Date(bCalYear, bCalMonth, 1).getDay();
  const daysInMonth = new Date(bCalYear, bCalMonth+1, 0).getDate();
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];

  const wrap = document.getElementById('bCalendar');
  wrap.innerHTML = `
    <div class="appt-cal-header">
      <button class="appt-cal-nav" onclick="shiftBCal(-1)">&#8249;</button>
      <span class="cal-month">${months[bCalMonth]} ${bCalYear}</span>
      <button class="appt-cal-nav" onclick="shiftBCal(1)">&#8250;</button>
    </div>
    <div class="appt-cal-weekdays">
      <span>Su</span><span>Mo</span><span>Tu</span><span>We</span>
      <span>Th</span><span>Fr</span><span>Sa</span>
    </div>
    <div class="appt-cal-days" id="bCalDays"></div>`;

  const grid = document.getElementById('bCalDays');
  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement('div');
    el.className = 'appt-cal-day empty';
    grid.appendChild(el);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(bCalYear, bCalMonth, d);
    date.setHours(0,0,0,0);
    const el = document.createElement('div');
    el.className = 'appt-cal-day';
    el.textContent = d;
    const ds = toDateStr(date);
    if (date < today || date > maxDate) {
      el.classList.add('out-of-range');
    } else {
      if (date.getTime() === today.getTime()) el.classList.add('today');
      if (bSelectedDate === ds) el.classList.add('selected');
      el.onclick = () => selectBDate(ds);
    }
    grid.appendChild(el);
  }
}

function shiftBCal(dir) {
  bCalMonth += dir;
  if (bCalMonth > 11) { bCalMonth = 0; bCalYear++; }
  if (bCalMonth < 0)  { bCalMonth = 11; bCalYear--; }
  renderBCalendar();
}

async function selectBDate(ds) {
  bSelectedDate = ds;
  bSelectedSlot = null;
  renderBCalendar();
  document.getElementById('bErrDate').style.display = 'none';

  // Fetch slot counts for this date
  try {
    const res  = await fetch(`${API}/api/appointments/slot-counts?date=${toIso(ds)}`);
    const data = await res.json();
    bSlotCounts = data.slotCounts || {};
  } catch {
    bSlotCounts = {};
  }
  renderBSlots();
}

function getWorkshopSlotOptions(selectedDate) {
  // Always display the full workshop slot range for selected dates.
  return ALL_SLOTS.slice();
}

// ── Slot rendering with status ─────────────────
function renderBSlots() {
  const grid = document.getElementById('bSlotGrid');
  grid.innerHTML = '';
  if (!bSelectedDate) {
    const info = document.createElement('div');
    info.className = 'slot-empty-message';
    info.textContent = 'Please select a date first to view available time slots.';
    grid.appendChild(info);
    return;
  }

  const now = new Date();
  const [d,m,y] = bSelectedDate.split('/');
  const isToday = parseInt(d)===now.getDate() &&
                  parseInt(m)===now.getMonth()+1 &&
                  parseInt(y)===now.getFullYear();
  const slotsToShow = getWorkshopSlotOptions(bSelectedDate);

  if (!slotsToShow.length) {
    const info = document.createElement('div');
    info.className = 'slot-empty-message';
    info.textContent = 'No available slots are visible for this date. Please choose another date.';
    grid.appendChild(info);
    return;
  }

  slotsToShow.forEach(slot => {
    const chip  = document.createElement('div');
    chip.className = 'appt-slot-chip';
    const h24   = slotTo24h(slot);
    const count = bSlotCounts[slot] || 0;
    const isFull   = count >= 3;
    const isClosed = isToday && h24 <= now.getHours();

    if (isClosed) {
      chip.classList.add('booked');
      chip.innerHTML = `${slot}<br><small style="font-size:10px;opacity:.8;">⚫ Closed</small>`;
    } else if (isFull) {
      chip.classList.add('booked');
      chip.innerHTML = `${slot}<br><small style="font-size:10px;opacity:.8;">🔴 Full</small>`;
    } else {
      chip.innerHTML = `${slot}<br><small style="font-size:10px;color:#16a34a;">🟢 Available</small>`;
      if (bSelectedSlot === slot) chip.classList.add('active');
      chip.onclick = () => {
        bSelectedSlot = slot;
        renderBSlots();
        document.getElementById('bErrSlot').style.display = 'none';
      };
    }
    grid.appendChild(chip);
  });
}

// ── Submit: validate → reserve → open Razorpay directly ──
async function submitBooking() {
  const name      = document.getElementById('bName').value.trim();
  const mobile    = document.getElementById('bMobile').value.trim();
  const age       = document.getElementById('bAge').value.trim();
  const gender    = document.getElementById('bGender').value;
  const treatment = document.getElementById('bTreatment').value;

  let ok = true;
  const showErr = (id, cond) => {
    document.getElementById(id).style.display = cond ? 'none' : 'block';
    if (!cond) ok = false;
  };
  showErr('bErrName',      !!name);
  showErr('bErrMobile',    /^\d{10}$/.test(mobile));
  showErr('bErrAge',       !!age && +age > 0 && +age <= 120);
  showErr('bErrGender',    !!gender);
  showErr('bErrTreatment', !!treatment);
  showErr('bErrDate',      !!bSelectedDate);
  showErr('bErrSlot',      !!bSelectedSlot);
  if (!ok) return;

  // Re-check slot is still available
  const h24    = slotTo24h(bSelectedSlot);
  const now    = new Date();
  const [d,m,y] = bSelectedDate.split('/');
  const isToday = parseInt(d)===now.getDate() && parseInt(m)===now.getMonth()+1 && parseInt(y)===now.getFullYear();
  if (isToday && h24 <= now.getHours()) {
    document.getElementById('bErrSlot').textContent = 'This slot is already closed.';
    document.getElementById('bErrSlot').style.display = 'block';
    return;
  }
  if ((bSlotCounts[bSelectedSlot] || 0) >= 3) {
    document.getElementById('bErrSlot').textContent = 'This slot is fully booked.';
    document.getElementById('bErrSlot').style.display = 'block';
    return;
  }

  const btn = document.getElementById('bBookBtn');
  btn.textContent = 'Please wait\u2026';
  btn.disabled = true;

  try {
    const res  = await fetch(`${API}/api/appointments/reserve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, mobile, age, gender, treatment,
        appt_date: toIso(bSelectedDate),
        appt_time: bSelectedSlot,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Reservation failed');

    if (!data.orderId) {
      alert('Payment gateway not configured. Please contact the clinic.');
      btn.textContent = 'BOOK APPOINTMENT \u2192';
      btn.disabled = false;
      return;
    }

    bReservation = {
      bookingId: data.bookingId,
      orderId:   data.orderId,
      keyId:     data.keyId,
      amount:    data.amount,
      name, mobile, treatment,
      date: toDisplay(bSelectedDate),
      time: bSelectedSlot,
    };

    // Open Razorpay immediately
    openRazorpay(bReservation, (bookingId, paymentId) => {
      closeBooking();
      showSuccessModal({
        bookingId,
        paymentId,
        name,
        date: toDisplay(bSelectedDate),
        time: bSelectedSlot,
        treatment,
      });
      // Update local slot count for real-time UI
      bSlotCounts[bSelectedSlot] = (bSlotCounts[bSelectedSlot] || 0) + 1;
    }, () => {
      const btn = document.getElementById('bBookBtn');
      if (btn) {
        btn.textContent = 'BOOK APPOINTMENT \u2192';
        btn.disabled = false;
      }
    });

  } catch (e) {
    alert('Error: ' + e.message);
    btn.textContent = 'BOOK APPOINTMENT \u2192';
    btn.disabled = false;
  }
}

// ═════════════════════════════════════════════
//  SUCCESS MODAL
// ═════════════════════════════════════════════
function showSuccessModal(d) {
  document.getElementById('sConId').textContent        = d.bookingId;
  document.getElementById('sConPayId').textContent     = d.paymentId;
  document.getElementById('sConName').textContent      = d.name;
  document.getElementById('sConDate').textContent      = d.date;
  document.getElementById('sConTime').textContent      = d.time;
  document.getElementById('sConTreatment').textContent = d.treatment;
  document.getElementById('successOverlay').classList.add('open');
}
function closeSuccessModal() {
  document.getElementById('successOverlay').classList.remove('open');
}

// ═════════════════════════════════════════════
//  PAY NOW MODAL  (for existing reservation)
// ═════════════════════════════════════════════
let pReservation = null;

function openPayNow() {
  showPStep(1);
  document.getElementById('pBookingId').value = '';
  document.getElementById('pErrId').style.display = 'none';
  const btn = document.getElementById('pPayBtn');
  if (btn) { btn.textContent = 'PAY \u20b999 NOW \u2192'; btn.disabled = false; }
  pReservation = null;
  document.getElementById('payNowOverlay').classList.add('open');
}
function closePayNow() {
  document.getElementById('payNowOverlay').classList.remove('open');
}
document.getElementById('payNowOverlay').addEventListener('click', function(e) {
  if (e.target === this) closePayNow();
});
document.querySelector('#payNowOverlay .modal-box').addEventListener('click', e => e.stopPropagation());

function showPStep(n) {
  [1,2,3].forEach(i =>
    document.getElementById('pStep'+i).style.display = i===n ? 'block' : 'none'
  );
}

async function lookupAndPay() {
  const id = document.getElementById('pBookingId').value.trim().toUpperCase();
  if (!id) { document.getElementById('pErrId').style.display = 'block'; return; }
  document.getElementById('pErrId').style.display = 'none';

  try {
    const res  = await fetch(`${API}/api/appointments/lookup?bookingId=${encodeURIComponent(id)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Booking not found');

    pReservation = {
      bookingId: data.bookingId, orderId: data.orderId,
      keyId: data.keyId, amount: data.amount,
      name: data.name, mobile: data.mobile,
      treatment: data.treatment, date: isoToDisplay(data.appt_date), time: data.appt_time,
    };

    document.getElementById('pConId').textContent        = data.bookingId;
    document.getElementById('pConName').textContent      = data.name;
    document.getElementById('pConDate').textContent      = isoToDisplay(data.appt_date);
    document.getElementById('pConTime').textContent      = data.appt_time;
    document.getElementById('pConTreatment').textContent = data.treatment;
    showPStep(2);
  } catch (e) {
    document.getElementById('pErrId').textContent = e.message;
    document.getElementById('pErrId').style.display = 'block';
  }
}

function payForReservation() {
  if (!pReservation) return;
  openRazorpay(pReservation, (bookingId, paymentId) => {
    closePayNow();
    showSuccessModal({
      bookingId, paymentId,
      name:      pReservation.name,
      date:      pReservation.date,
      time:      pReservation.time,
      treatment: pReservation.treatment,
    });
  }, () => {
    const btn = document.getElementById('pPayBtn');
    if (btn) {
      btn.textContent = 'PAY ₹99 NOW →';
      btn.disabled = false;
    }
  });
}

// Called from bStep2 "Proceed to Payment" button
function proceedToPayment() {
  if (!bReservation) return;
  openRazorpay(bReservation, (bookingId, paymentId) => {
    closeBooking();
    showSuccessModal({
      bookingId,
      paymentId,
      name:      bReservation.name,
      date:      bReservation.date,
      time:      bReservation.time,
      treatment: bReservation.treatment,
    });
  }, () => {
    const btn = document.getElementById('bPayBtn');
    if (btn) {
      btn.textContent = 'PROCEED TO PAYMENT →';
      btn.disabled = false;
    }
  });
}

// ═════════════════════════════════════════════
//  RAZORPAY  (shared)
// ═════════════════════════════════════════════
let rzpInstance = null;

function openRazorpay(reservation, onSuccess, resetButton) {
  const options = {
    key:         reservation.keyId,
    amount:      reservation.amount,
    currency:    'INR',
    name:        'RC5 Elite Motion',
    description: `Workshop \u2014 ${reservation.treatment}`,
    order_id:    reservation.orderId,
    prefill:     { name: reservation.name, contact: reservation.mobile },
    theme:       { color: '#D4A017' },
    handler: async (response) => {
      try {
        const vRes = await fetch(`${API}/api/appointments/verify-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            razorpay_order_id:   response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature:  response.razorpay_signature,
            booking_id:          reservation.bookingId,
          }),
        });
        const vData = await vRes.json();
        if (!vRes.ok) throw new Error(vData.error || 'Verification failed');
        // Close Razorpay checkout before showing success modal
        if (rzpInstance) { try { rzpInstance.close(); } catch (_) {} rzpInstance = null; }
        onSuccess(vData.bookingId, vData.paymentId);
      } catch (e) {
        if (resetButton) resetButton();
        alert('Payment error: ' + e.message);
      }
    },
    modal: { ondismiss: () => { rzpInstance = null; if (resetButton) resetButton(); } },
  };
  rzpInstance = new Razorpay(options);
  rzpInstance.open();
}