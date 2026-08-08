'use strict';

const $ = id => document.getElementById(id);
const els = {
  housePrice: $('housePrice'), downPayment: $('downPayment'), loanAmount: $('loanAmount'),
  loanYears: $('loanYears'), annualRate: $('annualRate'), formError: $('formError'),
  monthlyPayment: $('monthlyPayment'), totalPayment: $('totalPayment'), totalInterest: $('totalInterest'),
  resultDownPayment: $('resultDownPayment'), resultPrincipal: $('resultPrincipal'), scheduleBody: $('scheduleBody'),
  prepaymentAmount: $('prepaymentAmount'), prepaymentMonth: $('prepaymentMonth'), prepaymentError: $('prepaymentError'),
  simulationResults: $('simulationResults'), historyList: $('historyList')
};

const DEFAULT_SETTINGS = { commercialRate: 3.0, fundRate: 2.85, theme: 'system' };
const state = { loanType: 'commercial', repaymentMethod: 'annuity', schedule: [], showAll: false, latest: null, settings: loadJSON('mortgage-settings', DEFAULT_SETTINGS) };
const money = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 2 });
const compactMoney = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function loadJSON(key, fallback) {
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch { return { ...fallback }; }
}

function payment(principal, monthlyRate, months) {
  if (!monthlyRate) return principal / months;
  const factor = Math.pow(1 + monthlyRate, months);
  return principal * monthlyRate * factor / (factor - 1);
}

function buildSchedule(principal, annualRate, months, method = 'annuity') {
  const monthlyRate = annualRate / 100 / 12;
  const monthly = method === 'annuity' ? payment(principal, monthlyRate, months) : 0;
  const fixedPrincipal = principal / months;
  let balance = principal;
  const rows = [];
  for (let month = 1; month <= months; month += 1) {
    const interest = balance * monthlyRate;
    const principalPaid = month === months ? balance : Math.min(method === 'annuity' ? monthly - interest : fixedPrincipal, balance);
    const actualPayment = principalPaid + interest;
    balance = Math.max(0, balance - principalPaid);
    rows.push({ month, payment: actualPayment, principal: principalPaid, interest, remaining: balance });
  }
  return rows;
}

function readLoan() {
  const housePrice = Number(els.housePrice.value);
  const downPayment = Number(els.downPayment.value);
  const years = Number(els.loanYears.value);
  const rate = Number(els.annualRate.value);
  const principal = housePrice - downPayment;
  if (!Number.isFinite(housePrice) || housePrice <= 0) throw new Error('请输入有效的房屋总价');
  if (!Number.isFinite(downPayment) || downPayment < 0) throw new Error('请输入有效的首付款金额');
  if (principal <= 0) throw new Error('首付款必须小于房屋总价');
  if (!Number.isFinite(rate) || rate < 0 || rate > 30) throw new Error('请输入 0–30% 之间的年利率');
  return { housePrice, downPayment, principal, years, rate, months: years * 12, loanType: state.loanType, repaymentMethod: state.repaymentMethod };
}

function updateLoanAmount() {
  const value = Math.max(0, Number(els.housePrice.value || 0) - Number(els.downPayment.value || 0));
  els.loanAmount.textContent = compactMoney.format(value);
}

function calculate(save = true) {
  els.formError.textContent = '';
  try {
    const loan = readLoan();
    const schedule = buildSchedule(loan.principal, loan.rate, loan.months, loan.repaymentMethod);
    const totalPayment = schedule.reduce((sum, row) => sum + row.payment, 0);
    const totalInterest = totalPayment - loan.principal;
    state.schedule = schedule;
    state.latest = { ...loan, monthlyPayment: schedule[0].payment, totalPayment, totalInterest };
    $('paymentLabel').textContent = loan.repaymentMethod === 'annuity' ? '每月还款' : '首月还款（逐月递减）';
    els.monthlyPayment.textContent = money.format(schedule[0].payment);
    els.totalPayment.textContent = money.format(totalPayment);
    els.totalInterest.textContent = money.format(totalInterest);
    els.resultDownPayment.textContent = compactMoney.format(loan.downPayment);
    els.resultPrincipal.textContent = compactMoney.format(loan.principal);
    els.prepaymentMonth.max = String(loan.months - 1);
    renderSchedule();
    els.simulationResults.classList.add('hidden');
    if (save) saveHistory(state.latest);
  } catch (error) {
    els.formError.textContent = error.message;
  }
}

function renderSchedule() {
  const rows = state.showAll ? state.schedule : state.schedule.slice(0, 12);
  els.scheduleBody.innerHTML = rows.map(row => `<tr><td>${row.month}</td><td>${number.format(row.payment)}</td><td>${number.format(row.principal)}</td><td>${number.format(row.interest)}</td><td>${number.format(row.remaining)}</td></tr>`).join('');
  $('scheduleSummary').textContent = state.showAll ? `完整 ${state.schedule.length} 期` : `前 ${Math.min(12, state.schedule.length)} 期`;
  $('scheduleToggle').textContent = state.showAll ? '收起' : '查看全部';
}

function simulatePrepayment() {
  els.prepaymentError.textContent = '';
  if (!state.latest) return;
  const amount = Number(els.prepaymentAmount.value);
  const paidMonths = Math.floor(Number(els.prepaymentMonth.value));
  if (!Number.isFinite(paidMonths) || paidMonths < 1 || paidMonths >= state.latest.months) {
    els.prepaymentError.textContent = `发生期数应在 1–${state.latest.months - 1} 之间`; return;
  }
  const balance = state.schedule[paidMonths - 1].remaining;
  if (!Number.isFinite(amount) || amount <= 0 || amount >= balance) {
    els.prepaymentError.textContent = `提前还款金额应大于 0 且小于当期剩余本金 ${compactMoney.format(balance)}`; return;
  }
  const newPrincipal = balance - amount;
  const remainingMonths = state.latest.months - paidMonths;
  const monthlyRate = state.latest.rate / 100 / 12;
  const oldMonthly = state.latest.repaymentMethod === 'annuity' ? state.latest.monthlyPayment : state.schedule[paidMonths].payment;
  const baselineInterest = state.schedule.slice(paidMonths).reduce((sum, row) => sum + row.interest, 0);

  let shortenBalance = newPrincipal, shortenInterest = 0, shortenMonths = 0;
  const originalPrincipalPart = state.latest.principal / state.latest.months;
  while (shortenBalance > 0.005 && shortenMonths < remainingMonths) {
    const interest = shortenBalance * monthlyRate;
    const principalPaid = Math.min(state.latest.repaymentMethod === 'annuity' ? Math.max(0, oldMonthly - interest) : originalPrincipalPart, shortenBalance);
    if (principalPaid <= 0) break;
    shortenInterest += interest; shortenBalance -= principalPaid; shortenMonths += 1;
  }
  const reducedSchedule = buildSchedule(newPrincipal, state.latest.rate, remainingMonths, state.latest.repaymentMethod);
  const reducedMonthly = reducedSchedule[0].payment;
  const reducedInterest = reducedSchedule.reduce((sum, row) => sum + row.interest, 0);
  $('shortenSaving').textContent = `节省利息 ${compactMoney.format(Math.max(0, baselineInterest - shortenInterest))}`;
  $('shortenEffect').textContent = state.latest.repaymentMethod === 'annuity'
    ? `预计缩短 ${remainingMonths - shortenMonths} 期，仍按 ${money.format(oldMonthly)} / 月`
    : `预计缩短 ${remainingMonths - shortenMonths} 期，本金仍按原计划偿还`;
  $('reduceSaving').textContent = `节省利息 ${compactMoney.format(Math.max(0, baselineInterest - reducedInterest))}`;
  $('reduceEffect').textContent = `${state.latest.repaymentMethod === 'annuity' ? '月供' : '下一期还款'}降至 ${money.format(reducedMonthly)}，减少 ${money.format(oldMonthly - reducedMonthly)}`;
  els.simulationResults.classList.remove('hidden');
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem('mortgage-history') || '[]'); } catch { return []; }
}

function saveHistory(result) {
  const entry = { ...result, id: Date.now(), createdAt: new Date().toISOString() };
  const history = [entry, ...getHistory()].slice(0, 10);
  localStorage.setItem('mortgage-history', JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  const history = getHistory();
  if (!history.length) { els.historyList.innerHTML = '<div class="empty-state">还没有计算记录<br><small>完成一次计算后会自动保存在这里</small></div>'; return; }
  els.historyList.innerHTML = history.map(item => {
    const date = new Date(item.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const type = item.loanType === 'fund' ? '公积金' : '商业';
    const method = item.repaymentMethod === 'equalPrincipal' ? '等额本金' : '等额本息';
    const paymentSuffix = item.repaymentMethod === 'equalPrincipal' ? ' 首月' : '/月';
    return `<button class="history-item" type="button" data-history-id="${item.id}"><strong>${compactMoney.format(item.housePrice)} · ${item.years} 年</strong><span class="amount">${compactMoney.format(item.monthlyPayment)}${paymentSuffix}</span><small>${type} · ${method} · ${item.rate}% · ${date}</small></button>`;
  }).join('');
}

function restoreHistory(id) {
  const item = getHistory().find(entry => entry.id === id); if (!item) return;
  els.housePrice.value = item.housePrice; els.downPayment.value = item.downPayment; els.loanYears.value = item.years; els.annualRate.value = item.rate;
  setLoanType(item.loanType, false); setRepaymentMethod(item.repaymentMethod || 'annuity', false); updateLoanAmount(); calculate(false); switchPage('calculator'); window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setRepaymentMethod(method, recalculate = true) {
  state.repaymentMethod = method;
  document.querySelectorAll('.method-button').forEach(button => button.classList.toggle('active', button.dataset.method === method));
  if (recalculate) calculate(false);
}

function setLoanType(type, updateRate = true) {
  state.loanType = type;
  document.querySelectorAll('.segment').forEach(button => button.classList.toggle('active', button.dataset.loanType === type));
  $('loanTypePill').textContent = type === 'fund' ? '公积金贷款' : '商业贷款';
  if (updateRate) els.annualRate.value = type === 'fund' ? state.settings.fundRate : state.settings.commercialRate;
  calculate(false);
}

function exportCSV() {
  if (!state.schedule.length) return;
  const lines = [['期数','每月还款','偿还本金','支付利息','剩余贷款'], ...state.schedule.map(row => [row.month,row.payment.toFixed(2),row.principal.toFixed(2),row.interest.toFixed(2),row.remaining.toFixed(2)])];
  const csv = '\ufeff' + lines.map(row => row.join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `还款计划-${new Date().toISOString().slice(0,10)}.csv`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}

function switchPage(target) {
  document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.dataset.page === target));
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.target === target));
  $('pageTitle').textContent = { calculator: '房贷计算器', history: '计算记录', settings: '设置' }[target];
  if (target === 'history') renderHistory();
}

function applyTheme(theme) {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = theme;
}

function initSettings() {
  $('commercialRate').value = state.settings.commercialRate;
  $('fundRate').value = state.settings.fundRate;
  $('themeSelect').value = state.settings.theme;
  els.annualRate.value = state.loanType === 'fund' ? state.settings.fundRate : state.settings.commercialRate;
  applyTheme(state.settings.theme);
}

els.housePrice.addEventListener('input', updateLoanAmount);
els.downPayment.addEventListener('input', updateLoanAmount);
$('calculateButton').addEventListener('click', () => calculate(true));
$('simulateButton').addEventListener('click', simulatePrepayment);
$('scheduleToggle').addEventListener('click', () => { state.showAll = !state.showAll; renderSchedule(); });
$('exportButton').addEventListener('click', exportCSV);
document.querySelectorAll('.segment').forEach(button => button.addEventListener('click', () => setLoanType(button.dataset.loanType)));
document.querySelectorAll('.method-button').forEach(button => button.addEventListener('click', () => setRepaymentMethod(button.dataset.method)));
document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => switchPage(button.dataset.target)));
els.historyList.addEventListener('click', event => { const button = event.target.closest('[data-history-id]'); if (button) restoreHistory(Number(button.dataset.historyId)); });
$('clearHistory').addEventListener('click', () => { if (confirm('确定清空全部计算记录吗？')) { localStorage.removeItem('mortgage-history'); renderHistory(); } });
$('themeSelect').addEventListener('change', event => applyTheme(event.target.value));
$('saveSettings').addEventListener('click', () => {
  state.settings = { commercialRate: Math.max(0, Number($('commercialRate').value) || 0), fundRate: Math.max(0, Number($('fundRate').value) || 0), theme: $('themeSelect').value };
  localStorage.setItem('mortgage-settings', JSON.stringify(state.settings));
  els.annualRate.value = state.loanType === 'fund' ? state.settings.fundRate : state.settings.commercialRate;
  applyTheme(state.settings.theme);
  calculate(false);
  $('saveNotice').classList.add('show'); setTimeout(() => $('saveNotice').classList.remove('show'), 1600);
});

initSettings(); updateLoanAmount(); calculate(false); renderHistory();
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
