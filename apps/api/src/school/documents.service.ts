import { Injectable } from '@nestjs/common';
import { notFound } from '@gradeon/nest-kit';
import type { TenantCtx } from '../tenancy/tenant.js';
import { LearningService } from './learning.service.js';
import { pdf, type PdfLine } from './pdf.js';
import { SettingsService } from './support.js';

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const date = (d: string) => new Date(`${d}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

/** Printable receipts and report cards, made on request (nothing to keep in sync): the school's header, then the facts. */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly settings: SettingsService,
    private readonly learning: LearningService,
  ) {}

  private async header(t: TenantCtx, title: string): Promise<PdfLine[]> {
    const v = (await this.settings.doc(t)).values;
    const address = [v['school.address'], v['school.place']].filter(Boolean).map(String).join(', ');
    return [
      { text: String(v['school.name'] ?? t.info.name), size: 18, bold: true },
      ...(address ? [{ text: address, size: 10 }] : []),
      ...(v['school.phone'] || v['school.email'] ? [{ text: [v['school.phone'], v['school.email']].filter(Boolean).join(' · '), size: 10 }] : []),
      ...(v['fees.receiptNote'] ? String(v['fees.receiptNote']).split('\n').map((l) => ({ text: l, size: 9 })) : []),
      { text: '', rule: true, gap: 14 },
      { text: title, size: 14, bold: true, gap: 26 },
    ];
  }

  /** A receipt for one payment; `students` limits it to a family's own children. */
  async receipt(t: TenantCtx, paymentId: string, students: string[] | null): Promise<{ name: string; data: Buffer }> {
    const p = (await t.pool.query<{ receipt_no: string; amount: number; refunded: number; method: string; reference: string | null; paid_on: string; title: string; student: string; student_id: string; admission_no: string; class: string; tax: Record<string, any> | null }>(
      `select p.receipt_no, p.amount, p.refunded, p.method, p.reference, p.paid_on::text, i.title, s.name student, s.id student_id, s.admission_no, c.name class, p.tax
       from payments p join fee_invoices i on i.id = p.invoice_id join students s on s.id = i.student_id join classes c on c.id = s.class_id where p.id = $1`, [paymentId])).rows[0];
    if (!p || (students && !students.includes(p.student_id))) throw notFound('That receipt');
    const lines: PdfLine[] = [
      ...(await this.header(t, p.tax ? 'Tax receipt' : 'Fee receipt')),
      { text: 'Receipt number', right: p.receipt_no },
      { text: 'Date', right: date(p.paid_on) },
      { text: 'Student', right: `${p.student} (${p.admission_no})` },
      { text: 'Class', right: p.class },
      { text: '', rule: true, gap: 18 },
      { text: p.title, right: rupees(p.amount), bold: true, gap: 22 },
    ];
    if (p.tax) {
      lines.push({ text: `Taxable value (SAC ${p.tax.sac})`, right: rupees(p.tax.taxable), size: 10 });
      lines.push({ text: `CGST ${p.tax.ratePct / 2}%`, right: rupees(p.tax.cgst), size: 10 }, { text: `SGST ${p.tax.ratePct / 2}%`, right: rupees(p.tax.sgst), size: 10 });
      lines.push({ text: `GSTIN ${p.tax.gstin}`, size: 10 });
    }
    if (p.refunded) lines.push({ text: 'Refunded', right: `- ${rupees(p.refunded)}`, size: 10 });
    lines.push({ text: '', rule: true, gap: 18 }, { text: 'Paid by', right: `${p.method.toUpperCase()}${p.reference ? ` · ${p.reference}` : ''}`, size: 10 },
      { text: 'This receipt was made by Gradeon and needs no signature.', size: 9, gap: 40 });
    return { name: `${p.receipt_no}.pdf`, data: pdf(lines) };
  }

  /** A report card for one student in one published exam. */
  async reportCard(t: TenantCtx, examId: string, studentId: string, students: string[] | null): Promise<{ name: string; data: Buffer }> {
    if (students && !students.includes(studentId)) throw notFound('That report card');
    const res = await this.learning.results(t, examId);
    const row = res.rows.find((r) => r.studentId === studentId);
    if (!row || (students && res.exam.status !== 'published')) throw notFound('That report card');
    const s = (await t.pool.query<{ name: string; admission_no: string; class: string; roll_no: string }>(
      'select s.name, s.admission_no, c.name class, s.roll_no from students s join classes c on c.id = s.class_id where s.id = $1', [studentId])).rows[0]!;
    const marks = (await t.pool.query<{ subject: string; score: string | null; absent: boolean; max_marks: number }>(
      `select coalesce(sub.name, m.subject_id) subject, m.score, m.absent, x.max_marks from exam_marks m join exam_subjects x on x.exam_id = m.exam_id and x.subject_id = m.subject_id
       left join subjects sub on sub.id = m.subject_id where m.exam_id = $1 and m.student_id = $2 order by subject`, [examId, studentId])).rows;
    const lines: PdfLine[] = [
      ...(await this.header(t, `Report card: ${res.exam.name}`)),
      { text: 'Student', right: `${s.name} (${s.admission_no})` },
      { text: 'Class and roll number', right: `${s.class} · ${s.roll_no || '-'}` },
      { text: '', rule: true, gap: 18 },
      { text: 'Subject', right: 'Marks', bold: true, gap: 22 },
      ...marks.map((m) => ({ text: m.subject, right: m.absent ? 'Absent' : `${Math.round(Number(m.score ?? 0))} / ${m.max_marks}` })),
      { text: '', rule: true, gap: 18 },
      { text: 'Overall', right: `${row.pct}% · grade ${row.grade}`, bold: true, gap: 22 },
      { text: 'Rank in class', right: `${row.rank} of ${res.rows.length}` },
      { text: 'Class teacher', gap: 60 }, { text: 'Principal', right: 'Parent', gap: 0 },
    ];
    return { name: `${s.admission_no}-${res.exam.name.replace(/[^\w-]+/g, '_')}.pdf`, data: pdf(lines) };
  }
}
