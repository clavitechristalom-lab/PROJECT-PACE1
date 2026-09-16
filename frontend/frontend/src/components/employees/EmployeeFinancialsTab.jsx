import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { showToast, confirmAction, showLoading, closeLoading, Btn, Card, StatusBadge } from '../ui';
import { FiPlus, FiTrash2 } from 'react-icons/fi';
import { fmt } from '../../lib/utils';
import { TbCurrencyPeso } from 'react-icons/tb';

export default function EmployeeFinancialsTab({ employeeId }) {
  const [financials, setFinancials] = useState(null);
  const [loading, setLoading] = useState(true);

  // Forms
  const [allowanceName, setAllowanceName] = useState('');
  const [allowanceAmount, setAllowanceAmount] = useState('');
  
  const [deductionName, setDeductionName] = useState('');
  const [deductionAmount, setDeductionAmount] = useState('');

  const [loanName, setLoanName] = useState('');
  const [loanTotal, setLoanTotal] = useState('');
  const [loanMonthly, setLoanMonthly] = useState('');

  const loadFinancials = async () => {
    try {
      const data = await api.employees.getFinancials(employeeId);
      setFinancials(data);
    } catch (err) {
      showToast('Failed to load financials', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFinancials();
  }, [employeeId]);

  const handleAddAllowance = async (e) => {
    e.preventDefault();
    if (!allowanceName || !allowanceAmount) return showToast('Fill all fields', 'error');
    showLoading();
    try {
      await api.employees.addAllowance(employeeId, { name: allowanceName, amount: allowanceAmount, is_active: true });
      showToast('Allowance added', 'success');
      setAllowanceName(''); setAllowanceAmount('');
      loadFinancials();
    } catch (err) {
      showToast(err.message, 'error');
    } finally { closeLoading(); }
  };

  const handleAddDeduction = async (e) => {
    e.preventDefault();
    if (!deductionName || !deductionAmount) return showToast('Fill all fields', 'error');
    showLoading();
    try {
      await api.employees.addDeduction(employeeId, { name: deductionName, amount: deductionAmount, is_active: true });
      showToast('Deduction added', 'success');
      setDeductionName(''); setDeductionAmount('');
      loadFinancials();
    } catch (err) {
      showToast(err.message, 'error');
    } finally { closeLoading(); }
  };

  const handleAddLoan = async (e) => {
    e.preventDefault();
    if (!loanName || !loanTotal || !loanMonthly) return showToast('Fill all fields', 'error');
    showLoading();
    try {
      await api.employees.addLoan(employeeId, { name: loanName, total_amount: loanTotal, monthly_deduction: loanMonthly });
      showToast('Loan added', 'success');
      setLoanName(''); setLoanTotal(''); setLoanMonthly('');
      loadFinancials();
    } catch (err) {
      showToast(err.message, 'error');
    } finally { closeLoading(); }
  };

  const handleDelete = async (type, id) => {
    const ok = await confirmAction('Delete Item', 'Are you sure you want to remove this?');
    if (!ok) return;
    showLoading();
    try {
      if (type === 'allowance') await api.employees.deleteAllowance(id);
      if (type === 'deduction') await api.employees.deleteDeduction(id);
      if (type === 'loan') await api.employees.deleteLoan(id);
      showToast('Removed successfully', 'success');
      loadFinancials();
    } catch (err) {
      showToast(err.message, 'error');
    } finally { closeLoading(); }
  };

  if (loading || !financials) return <div className="text-center p-5">Loading financials...</div>;

  return (
    <div className="space-y-6">
      <div className="bg-blue-500/10 text-blue-500 p-4 rounded-2xl border border-blue-500/20 text-xs">
        <p className="font-bold mb-1">Payroll Financial Setup</p>
        <p>Values configured here are automatically applied every time payroll is generated for this employee. Statutory deductions (SSS, PhilHealth, Pag-IBIG) are automatically calculated and do not need to be added here.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Allowances */}
        <Card title="Fixed Allowances" noPad>
          <div className="p-4 border-b border-border bg-muted/20">
            <form onSubmit={handleAddAllowance} className="flex gap-2">
              <input type="text" placeholder="Name (e.g. Rice)" className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs" value={allowanceName} onChange={e => setAllowanceName(e.target.value)} />
              <input type="number" placeholder="Amt" className="w-24 rounded-lg border border-border bg-background px-3 py-1.5 text-xs" value={allowanceAmount} onChange={e => setAllowanceAmount(e.target.value)} />
              <button type="submit" className="bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-bold shrink-0">Add</button>
            </form>
          </div>
          <div className="p-0">
            {financials.allowances.length === 0 ? <p className="text-xs text-muted-foreground p-4 text-center">No allowances configured</p> : (
              <table className="w-full text-xs text-left">
                <tbody>
                  {financials.allowances.map(a => (
                    <tr key={a.id} className="border-b border-border/50">
                      <td className="py-2.5 px-4 font-semibold">{a.name}</td>
                      <td className="py-2.5 px-4 font-mono text-right">{fmt(a.amount)}</td>
                      <td className="py-2.5 px-4 w-10"><button onClick={() => handleDelete('allowance', a.id)} className="text-rose-500 hover:text-rose-700"><FiTrash2 /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        {/* Deductions */}
        <Card title="Custom Deductions" noPad>
          <div className="p-4 border-b border-border bg-muted/20">
            <form onSubmit={handleAddDeduction} className="flex gap-2">
              <input type="text" placeholder="Name (e.g. Penalty)" className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs" value={deductionName} onChange={e => setDeductionName(e.target.value)} />
              <input type="number" placeholder="Amt" className="w-24 rounded-lg border border-border bg-background px-3 py-1.5 text-xs" value={deductionAmount} onChange={e => setDeductionAmount(e.target.value)} />
              <button type="submit" className="bg-rose-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shrink-0">Add</button>
            </form>
          </div>
          <div className="p-0">
            {financials.deductions.length === 0 ? <p className="text-xs text-muted-foreground p-4 text-center">No custom deductions configured</p> : (
              <table className="w-full text-xs text-left">
                <tbody>
                  {financials.deductions.map(d => (
                    <tr key={d.id} className="border-b border-border/50">
                      <td className="py-2.5 px-4 font-semibold">{d.name}</td>
                      <td className="py-2.5 px-4 font-mono text-right">{fmt(d.amount)}</td>
                      <td className="py-2.5 px-4 w-10"><button onClick={() => handleDelete('deduction', d.id)} className="text-rose-500 hover:text-rose-700"><FiTrash2 /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        {/* Loans */}
        <div className="md:col-span-2">
          <Card title="Employee Loans & Advances" noPad>
            <div className="p-4 border-b border-border bg-muted/20">
              <form onSubmit={handleAddLoan} className="flex flex-wrap sm:flex-nowrap gap-2 items-end">
                <div className="flex-1 min-w-[120px]">
                  <label className="text-[10px] font-bold text-muted-foreground mb-1 block">Description</label>
                  <input type="text" className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs" value={loanName} onChange={e => setLoanName(e.target.value)} />
                </div>
                <div className="w-32">
                  <label className="text-[10px] font-bold text-muted-foreground mb-1 block">Total Amt</label>
                  <input type="number" className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs" value={loanTotal} onChange={e => setLoanTotal(e.target.value)} />
                </div>
                <div className="w-32">
                  <label className="text-[10px] font-bold text-muted-foreground mb-1 block">Mo. Deduct</label>
                  <input type="number" className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs" value={loanMonthly} onChange={e => setLoanMonthly(e.target.value)} />
                </div>
                <button type="submit" className="bg-amber-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold h-[30px]">Issue</button>
              </form>
            </div>
            <div className="p-0 overflow-x-auto">
              {financials.loans.length === 0 ? <p className="text-xs text-muted-foreground p-4 text-center">No active loans</p> : (
                <table className="w-full text-xs text-left whitespace-nowrap">
                  <thead className="bg-muted/10 text-[10px] uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2 px-4">Description</th>
                      <th className="py-2 px-4 text-right">Total</th>
                      <th className="py-2 px-4 text-right">Paid</th>
                      <th className="py-2 px-4 text-right">Balance</th>
                      <th className="py-2 px-4 text-right">Mo. Deduct</th>
                      <th className="py-2 px-4 text-center">Status</th>
                      <th className="py-2 px-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {financials.loans.map(l => {
                      const balance = parseFloat(l.total_amount) - parseFloat(l.amount_paid);
                      return (
                        <tr key={l.id} className="border-b border-border/50">
                          <td className="py-2.5 px-4 font-semibold">{l.name}</td>
                          <td className="py-2.5 px-4 text-right font-mono">{fmt(l.total_amount)}</td>
                          <td className="py-2.5 px-4 text-right font-mono text-emerald-600">{fmt(l.amount_paid)}</td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-rose-600">{fmt(balance)}</td>
                          <td className="py-2.5 px-4 text-right font-mono text-amber-600">{fmt(l.monthly_deduction)}</td>
                          <td className="py-2.5 px-4 text-center"><StatusBadge status={l.status} /></td>
                          <td className="py-2.5 px-4 w-10 text-center"><button onClick={() => handleDelete('loan', l.id)} className="text-rose-500 hover:text-rose-700"><FiTrash2 /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
