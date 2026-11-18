export const STAFF_WORKDAYS = Object.freeze([2,3,4,5,6]);

const initialRoster = [
  ['Regina','08:00'], ['Patrícia','07:00'], ['Diego','08:30'], ['Bruna Nunes','08:30'],
  ['Bruna Chagas','10:00'], ['Bruna Gomes','11:00'], ['Gabriele','11:00'], ['Arlete','12:00'],
  ['Marina','09:00'], ['Alana','09:00'], ['Camila','12:00'], ['Allan','11:00'],
  ['Wallace','09:00'], ['Dani','10:00'], ['Luiza','10:00'], ['Mara','10:00'],
  ['Cesar','09:00'], ['Dhandara','10:00'], ['Karin','10:00'], ['Talita','11:00'],
  ['Noelia','10:00'], ['Rogério','09:00'], ['Thiago','09:00'], ['Salles','10:00'], ['Diogo','10:00'], ['Déia',null]
];

export const APPROVED_STAFF = initialRoster.map(([name,start]) => ({
  id:name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,'-'),
  name, start, toleranceMinutes:60, days:[...STAFF_WORKDAYS], active:true
}));

const statuses = new Set(['pending','present','absent','dayoff','leave']);
const minute = 60_000;
const businessOffset = 3 * 60 * minute;
const cleanText = value => typeof value === 'string' ? value.trim() : '';

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0,10) === value;
}

function validStart(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

// Require an explicit timezone; parsing a local timestamp would depend on the device.
function timestamp(value) {
  if (typeof value !== 'string') return NaN;
  const match = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,3})?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!match || !validDate(match[1])) return NaN;
  return Date.parse(value);
}

// The approved operational timezone currently uses UTC-03:00 all year.
function businessDay(instant) {
  return new Date(instant - businessOffset).toISOString().slice(0,10);
}

function validSchedule(shift) {
  return Boolean(shift && cleanText(shift.staffId) && validDate(shift.date) &&
    validStart(shift.start) && statuses.has(shift.status) &&
    Number.isInteger(shift.toleranceMinutes) && shift.toleranceMinutes >= 0 &&
    (shift.enabled === true || ['dayoff','leave'].includes(shift.status)));
}

export function shouldAlert(shift, nowISO) {
  const now = timestamp(nowISO);
  if (!Number.isFinite(now) || !validSchedule(shift) || shift.status !== 'pending' ||
    businessDay(now) !== shift.date) return false;
  const due = Date.parse(`${shift.date}T${shift.start}:00-03:00`) + shift.toleranceMinutes * minute;
  if (now < due) return false;
  if (shift.remindAt !== undefined && shift.remindAt !== null) {
    const reminder = timestamp(shift.remindAt);
    if (!Number.isFinite(reminder) || now < reminder) return false;
  }
  return true;
}

export function applyPresenceAction(shift, action, context = {}) {
  const {at,actor} = context || {};
  const instant = timestamp(at);
  if (!Number.isFinite(instant)) throw Error('Informe uma data e horário válidos, com fuso horário.');
  const responsible = cleanText(actor);
  if (!responsible) throw Error('Informe o responsável pelo registro.');
  if (!validSchedule(shift)) throw Error('A escala está desativada ou tem data, horário ou situação inválida.');
  if (businessDay(instant) !== shift.date) throw Error('O registro de presença deve ser feito para o dia atual da escala.');
  if (!['present','absent','dayoff','snooze','departed'].includes(action?.type)) throw Error('Ação de presença inválida.');

  const type = action.type;
  const reason = cleanText(action.reason) || (type === 'departed' ? 'Profissional já foi embora.' : '');
  if(type==='departed'&&shift.status==='absent'&&shift.checkedOutAt)return {shift:{...shift},event:null,changed:false};
  if(type==='departed'&&shift.status!=='present')throw Error('Registre a chegada do profissional antes de marcar que já foi embora.');
  if (type === 'absent' && reason.length < 3) throw Error('Informe um motivo de ausência com pelo menos 3 caracteres.');
  if (type === 'snooze' && shift.status !== 'pending') throw Error('Só é possível adiar uma conferência pendente.');

  const next = {...shift};
  if (shift.status === type) return {shift:next, event:null, changed:false};
  next.enabled = type !== 'dayoff';
  const recordedAt = new Date(instant).toISOString();
  if (type === 'present') {
    next.status = 'present';
    next.checkedInAt = recordedAt;
  } else if (type === 'absent' || type === 'departed') {
    next.status = 'absent';
    next.absenceAt = recordedAt;
    if(type === 'departed')next.checkedOutAt = recordedAt;
    next.reason = reason;
  } else if (type === 'dayoff') {
    next.status = 'dayoff';
    next.reason = reason;
  } else {
    next.remindAt = new Date(instant + 10 * minute).toISOString();
  }
  return {
    shift:next,
    event:{type,staffId:shift.staffId,date:shift.date,at:recordedAt,actor:responsible,
      fromStatus:shift.status,beforeStatus:shift.status,toStatus:next.status,reason},
    changed:true
  };
}
